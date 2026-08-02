# Email Transaction Reading Integration Guide

## Overview
The email service (`src/services/email.ts`) is ready to process bank transaction emails. It handles:
- Transaction extraction from email bodies
- Deduplication with SMS (same transaction won't be counted twice)
- Pattern-based filtering (ignore rules by payee)
- AI-based categorization
- Adding to pending queue for user confirmation

## Architecture

```
Email Provider SDK → processEmail() → Extract transaction details
                                    → Check for duplicates
                                    → Check ignore patterns
                                    → Run AI categorization
                                    → Add to pending queue
                                    → Save with source='email'
```

## Implementation Steps

### Step 1: Install Email Provider SDK

For Android, you have several options:

**Option A: Gmail API (Recommended for production)**
```bash
npm install @react-native-share/react-native-share
# Or for OAuth integration
npm install react-native-app-auth @react-native-community/google-signin
```

**Option B: Direct Email Access via Intent**
```bash
# Build custom module to read default email app
```

**Option C: Android IMAP/POP3 Library**
```bash
npm install react-native-mail
```

### Step 2: Create Email Reader Service

Add a method to read emails. Example for Gmail:

```typescript
// In src/services/email.ts

import { GoogleSignin } from '@react-native-community/google-signin';

export const emailService = {
  async requestEmailPermissions() {
    try {
      GoogleSignin.configure({
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      });
      const userInfo = await GoogleSignin.signIn();
      return userInfo;
    } catch (e) {
      console.error('[Email Service] Permission request failed:', e);
      return null;
    }
  },

  async syncRecentEmails() {
    try {
      console.log('[Email Service] Starting email sync...');
      
      const tokens = await GoogleSignin.getTokens();
      const response = await fetch(
        'https://www.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=10',
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        }
      );

      const data = await response.json();
      
      if (data.messages) {
        for (const message of data.messages) {
          // Fetch full message
          const fullMessage = await fetch(
            `https://www.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
            {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
              },
            }
          ).then(r => r.json());

          // Extract email details
          const headers = fullMessage.payload.headers;
          const from = headers.find((h: any) => h.name === 'From')?.value || '';
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
          const body = this.extractEmailBody(fullMessage);

          // Process email
          await this.processEmail({
            id: message.id,
            from,
            subject,
            body,
            timestamp: parseInt(fullMessage.internalDate),
          });
        }
      }

      console.log('[Email Service] Email sync completed');
    } catch (e) {
      console.error('[Email Service] Error syncing emails:', e);
    }
  },

  extractEmailBody(message: any): string {
    if (message.payload.parts) {
      for (const part of message.payload.parts) {
        if (part.mimeType === 'text/plain') {
          const data = part.body.data || '';
          return Buffer.from(data, 'base64').toString('utf-8');
        }
      }
    }
    return message.payload.body?.data ? 
      Buffer.from(message.payload.body.data, 'base64').toString('utf-8') : '';
  }
};
```

### Step 3: Call from App Initialization

In your main app component or navigation screen:

```typescript
import { emailService } from '../services/email';

// Request permissions once
useEffect(() => {
  const setupEmail = async () => {
    const hasPermission = await emailService.requestEmailPermissions();
    if (hasPermission) {
      // Sync emails on app start
      await emailService.syncRecentEmails();
    }
  };
  
  setupEmail();
}, []);
```

### Step 4: Add to Settings/Permissions Screen

Let users toggle email sync:

```typescript
const [emailSyncEnabled, setEmailSyncEnabled] = useState(false);

const toggleEmailSync = async () => {
  if (!emailSyncEnabled) {
    const hasPermission = await emailService.requestEmailPermissions();
    setEmailSyncEnabled(!!hasPermission);
  } else {
    setEmailSyncEnabled(false);
  }
};
```

## How Deduplication Works

When same transaction comes from SMS and Email:

**SMS arrives:**
- Amount: 500, Payee: Starbucks, Time: 3:00 PM
- Hash: `500_1719216000_starbucks` → Created and stored

**Email arrives:** 
- Same transaction details
- Hash calculated: `500_1719216000_starbucks` → Matches existing!
- Status marked as `system_ignored` with note "Duplicate: Already tracked from SMS"
- Only appears once in app ✓

## Email Body Parsing

The service uses regex patterns to extract:

**Amount patterns:**
```
"Debited Rs 500"
"₹500 spent"
"Amount: 500.00"
```

**Payee patterns:**
```
"at Starbucks"
"UPI/STARBUCKS"
"payment to Amazon"
```

## Testing

To test locally:

```typescript
// Simulate email notification
const mockEmail = {
  id: 'email_123',
  from: 'banking@axis.co.in',
  subject: 'Transaction Notification',
  body: `
    INR 500.00 debited
    A/c no. XX1234
    21-06-26, 15:46:08
    UPI/STARBUCKS
    Not you? Reply BLOCK to 9999999999
  `,
  timestamp: Date.now(),
};

await emailService.processEmail(mockEmail);
```

## Common Bank Email Formats

The service supports:

- **Axis Bank:** `UPI/P2M/transaction_id/PAYEE_NAME`
- **HDFC Bank:** `Amount: Rs 500 | Merchant: Starbucks`
- **ICICI Bank:** `Debit: Rs 500 to Starbucks`
- **Google Pay:** `PaymentUPI to {payee}`
- **PhonePe:** `Transaction ID: ... Amount: Rs 500`

## Next Steps

1. Choose email provider (Gmail recommended)
2. Install SDK
3. Implement `requestEmailPermissions()` 
4. Update `syncRecentEmails()` with actual API calls
5. Test with a mock email
6. Add to app initialization flow
7. Test deduplication with real SMS + Email

## Troubleshooting

**Issue:** "Duplicate transaction" appearing when shouldn't be

**Solution:** Check the hash calculation. Hashes are based on:
- Amount (exact match required)
- Timestamp (within 1 second)
- Payee (case-insensitive)

If amounts differ by even Re.1, it won't deduplicate.

**Issue:** Email not being extracted correctly

**Solution:** Check if bank format is supported in regex patterns. Add new patterns to `extractTransactionFromEmail()`.

**Issue:** Permission denied for email access

**Solution:** Ensure OAuth scopes include `gmail.readonly` and user approval is granted.

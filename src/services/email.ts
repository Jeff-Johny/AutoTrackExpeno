import { geminiService } from '../api/gemini';
import { dbService } from './db';
import { useStore } from '../store/useStore';
import { patternService } from './patterns';
import { notificationService } from './notifications';
import { NativeModules, Platform } from 'react-native';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// Access to native Gmail module (to be implemented)
const GmailModule = NativeModules.GmailModule || {};

export const emailService = {
  /**
   * Generate a unique transaction hash to deduplicate SMS and email
   * Format: {amount}_{date}_{payee}
   */
  generateTransactionHash(amount: number, date: number, payee: string | null): string {
    const payeeStr = (payee || '').toLowerCase().replace(/\s+/g, '');
    return `${amount}_${Math.floor(date / 1000)}_${payeeStr}`;
  },

  /**
   * Check if transaction already exists by hash
   */
  async isTransactionDuplicate(hash: string): Promise<boolean> {
    const existing = await dbService.getTransactionByHash(hash);
    return !!existing;
  },

  /**
   * Extract transaction details from email body using regex patterns
   * Handles common bank email formats
   */
  extractTransactionFromEmail(emailBody: string, sender: string): {
    amount: number | null;
    payee: string | null;
    description: string | null;
  } | null {
    try {
      // Pattern for common debit formats
      const debitPatterns = [
        /(?:debited|spent|paid|deducted|transferred|withdrawn)\s+(?:of|by)?[\s₹Rs]*([0-9,\.]+)/gi,
        /(?:Rs|₹)\s*([0-9,\.]+)\s+(?:debited|spent|paid|deducted|transferred|withdrawn)/gi,
        /amount[:\s]+(?:Rs|₹)\s*([0-9,\.]+)/gi,
      ];

      // Pattern for payee/merchant name
      const payeePatterns = [
        /(?:at|to|from|merchant|vendor|payee|shop|store)[\s:]+([A-Za-z0-9\s&.,'-]+?)(?:\.|,|$)/i,
        /UPI[\/\s]+([A-Za-z0-9\s&.,'-]+?)(?:\.|,|\n|$)/i,
        /(?:transaction|payment)\s+(?:to|with|from)[\s:]+([A-Za-z0-9\s&.,'-]+?)(?:\.|,|$)/i,
      ];

      let amount: number | null = null;
      let payee: string | null = null;
      let description = emailBody.substring(0, 200);

      // Extract amount
      for (const pattern of debitPatterns) {
        const match = emailBody.match(pattern);
        if (match && match[1]) {
          const amountStr = match[1].replace(/,/g, '').trim();
          const parsed = parseFloat(amountStr);
          if (!isNaN(parsed) && parsed > 0) {
            amount = parsed;
            break;
          }
        }
      }

      // Extract payee
      for (const pattern of payeePatterns) {
        const match = emailBody.match(pattern);
        if (match && match[1]) {
          payee = match[1].trim().toUpperCase();
          break;
        }
      }

      // Check if it looks like a spending email
      const spendingKeywords = ['debited', 'spent', 'paid', 'deducted', 'transferred', 'withdrawn'];
      const isSpending = spendingKeywords.some(kw => emailBody.toLowerCase().includes(kw));

      if (amount && isSpending) {
        return { amount, payee, description };
      }

      return null;
    } catch (e) {
      console.error('[Email Service] Error extracting transaction:', e);
      return null;
    }
  },

  /**
   * Process a single email
   */
  async processEmail(email: {
    id: string;
    from: string;
    subject: string;
    body: string;
    timestamp: number;
  }) {
    try {
      console.log('[Email Service] Processing email from:', email.from);

      // Check if email already processed
      const existing = await dbService.getSmsTransaction(email.id);
      if (existing) {
        console.log('[Email Service] Email already processed:', email.id);
        return;
      }

      // Extract transaction details
      const extracted = this.extractTransactionFromEmail(email.body, email.from);
      if (!extracted) {
        console.log('[Email Service] No transaction found in email:', email.id);
        return;
      }

      const { amount, payee, description } = extracted;
      const transactionHash = this.generateTransactionHash(amount!, email.timestamp, payee);

      // Check for duplicate (same transaction from SMS and email)
      const isDuplicate = await this.isTransactionDuplicate(transactionHash);
      if (isDuplicate) {
        console.log('[Email Service] Duplicate transaction detected (SMS already received):', transactionHash);
        await dbService.saveSmsTransaction({
          smsId: email.id,
          sender: email.from,
          smsText: email.body,
          date: email.timestamp,
          amount: 0,
          payee: payee,
          category: null,
          description: `Duplicate: Already tracked from SMS`,
          isSpending: false,
          status: 'system_ignored',
          source: 'email',
          transactionHash: transactionHash,
        });
        return;
      }

      // Check learned patterns (payee-based ignore rules)
      const pattern = await patternService.checkPattern(email.body, email.from, payee);
      if (pattern && pattern.action === 'ignore') {
        console.log('[Email Service] Email ignored by payee rule:', payee);
        await dbService.saveSmsTransaction({
          smsId: email.id,
          sender: email.from,
          smsText: email.body,
          date: email.timestamp,
          amount: 0,
          payee: payee,
          category: null,
          description: `Ignored by payee rule: ${payee}`,
          isSpending: false,
          status: 'system_ignored',
          source: 'email',
          transactionHash: transactionHash,
        });
        return;
      }

      // Run AI for categorization if not already categorized by pattern
      let category = pattern?.category || null;
      let aiResult = null;

      if (!category) {
        aiResult = await geminiService.categorizeSms(email.body);
      }

      // Save transaction to pending queue for user confirmation
      await dbService.saveSmsTransaction({
        smsId: email.id,
        sender: email.from,
        smsText: email.body,
        date: email.timestamp,
        amount: amount!,
        payee: payee,
        category: category || aiResult?.category || null,
        description: aiResult?.description || description,
        isSpending: true,
        status: 'pending',
        source: 'email',
        transactionHash: transactionHash,
      });

      // Add to unsure queue
      useStore.getState().addToUnsureQueue({
        smsText: email.body,
        sender: email.from,
        aiResult: aiResult || {
          amount: amount!,
          category: category || '',
          description: description || '',
          payee: payee,
          isSpending: true,
          isCertain: !!aiResult,
        },
        isSync: true,
        suggestedCategory: category,
        externalSmsId: email.id,
        date: email.timestamp,
      });

      notificationService.notify(
        'Transaction Detected (Email)',
        `₹${amount} from ${payee || email.from}. Tap to confirm.`,
        { smsText: email.body, sender: email.from, aiResult, externalSmsId: email.id }
      );

      console.log('[Email Service] Email processed successfully:', email.id);
    } catch (e) {
      console.error('[Email Service] Error processing email:', e);
    }
  },

  /**
   * Request Gmail API permissions using OAuth
   */
  async requestGmailPermission() {
    try {
      console.log('[Email Service] Requesting Gmail access...');

      if (Platform.OS !== 'android') {
        console.log('[Email Service] Gmail API only available on Android');
        return false;
      }

      // This will be implemented via native module
      // For now, return placeholder
      console.log('[Email Service] Gmail permission flow to be implemented');
      return true;
    } catch (e) {
      console.error('[Email Service] Failed to request Gmail permission:', e);
      return false;
    }
  },

  /**
   * Sync recent emails from Gmail
   * Fetches unread emails from past 48 hours
   */
  async syncRecentEmails() {
    try {
      console.log('[Email Service] Starting Gmail sync...');

      if (Platform.OS !== 'android') {
        console.log('[Email Service] Gmail sync only available on Android');
        return;
      }

      // Check if native module is available
      if (!GmailModule.getRecentEmails) {
        console.warn('[Email Service] Gmail module not available. Please build native module.');
        return;
      }

      // Fetch recent emails (past 48 hours, unread)
      const emails = await GmailModule.getRecentEmails({
        maxResults: 20,
        query: 'is:unread newer_than:2d',  // Last 2 days, unread
      });

      if (!emails || emails.length === 0) {
        console.log('[Email Service] No new emails found');
        return;
      }

      console.log(`[Email Service] Found ${emails.length} emails to process`);

      // Process each email
      for (const email of emails) {
        // Filter for bank transaction emails
        if (!this.isBankTransactionEmail(email.subject, email.from)) {
          console.log('[Email Service] Skipping non-bank email:', email.subject);
          continue;
        }

        // Process the email
        await this.processEmail({
          id: email.id,
          from: email.from,
          subject: email.subject,
          body: email.body,
          timestamp: email.timestamp,
        });

        // Mark as read after processing
        if (GmailModule.markAsRead) {
          await GmailModule.markAsRead(email.id);
        }
      }

      console.log('[Email Service] Gmail sync completed');
    } catch (e) {
      console.error('[Email Service] Error syncing emails:', e);
    }
  },

  /**
   * Initialize Gmail sync on app startup
   * Syncs once when app opens, just like SMS
   */
  async initializeEmailSync() {
    try {
      const hasPermission = await this.requestGmailPermission();
      if (!hasPermission) {
        console.log('[Email Service] Gmail permission denied, skipping email sync');
        return;
      }

      console.log('[Email Service] Initializing email sync on app startup');
      await this.syncRecentEmails();
    } catch (e) {
      console.error('[Email Service] Error initializing email sync:', e);
    }
  },

  /**
   * Filter emails to find bank transaction emails
   */
  isBankTransactionEmail(subject: string, from: string): boolean {
    const bankKeywords = [
      'bank', 'transaction', 'debit', 'credit', 'payment', 'transfer',
      'upi', 'cheque', 'deposit', 'withdrawal', 'account', 'balance'
    ];

    const subjectLower = subject.toLowerCase();
    const fromLower = from.toLowerCase();

    return bankKeywords.some(kw =>
      subjectLower.includes(kw) || fromLower.includes('bank') || fromLower.includes('payment')
    );
  }
};

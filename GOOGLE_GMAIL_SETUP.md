# Google Gmail Setup for AutoTrackExpeno

## Overview
This guide walks you through setting up Gmail API integration for reading bank transaction emails.

## Prerequisites
- Google Cloud Project with Gmail API enabled
- Firebase project for OAuth configuration
- Android app signed with SHA-1 certificate

## Step 1: Get Your App's SHA-1 Certificate

```bash
cd android
./gradlew signingReport
```

Copy the **SHA1** value from `app` variant (not `debug` or `release`, just `app`).

## Step 2: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project named "AutoTrackExpeno"
3. Enable APIs:
   - Gmail API
   - Google Play Services API
   - Cloud Resource Manager API

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Choose **Android**
4. Fill in package name: `com.autotrackexpeno`
5. Paste your SHA-1 certificate
6. Download the JSON file

## Step 4: Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project: "AutoTrackExpeno"
3. Add Android app with package: `com.autotrackexpeno`
4. Download `google-services.json`
5. Place it in: `android/app/google-services.json`

## Step 5: Update build.gradle Files

### android/build.gradle
```gradle
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.google.gms:google-services:4.3.14'
    }
}
```

### android/app/build.gradle
```gradle
dependencies {
    // Google Sign-In
    implementation 'com.google.android.gms:play-services-auth:20.5.0'
    
    // Gmail API
    implementation('com.google.api-client:google-api-client-android:1.32.1') {
        exclude group: 'org.apache.httpcomponents'
    }
    implementation 'com.google.apis:google-api-services-gmail:v1-rev20220404-1.32.1'
    
    // Firebase
    implementation platform('com.google.firebase:firebase-bom:32.0.0')
}

apply plugin: 'com.google.gms.google-services'
```

## Step 6: Update AndroidManifest.xml

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.GET_ACCOUNTS" />
```

## Step 7: Register Native Module

Update `MainActivity.kt`:

```kotlin
package com.autotrackexpeno

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactRootView
import com.facebook.react.ReactPackage
import com.facebook.react.shell.MainReactPackage

class MainActivity : ReactActivity() {
    override fun getMainComponentName(): String = "AutoTrackExpeno"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        ReactActivityDelegate(this, mainComponentName)
}
```

Update `MainApplication.kt`:

```kotlin
package com.autotrackexpeno

import android.app.Application
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.shell.MainReactPackage
import java.util.*

class MainApplication : Application(), ReactApplication {

    private val mReactNativeHost = object : ReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            Arrays.asList(
                MainReactPackage(),
                GmailPackage()  // Add this line
            )

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
        override fun getJSMainModuleNa(): String = "index"
    }

    override fun getReactNativeHost(): ReactNativeHost = mReactNativeHost

    override fun onCreate() {
        super.onCreate()
    }
}
```

## Step 8: Update App.tsx or Main Navigation

Add to your app initialization (same place where SMS listener is initialized):

```typescript
import React, { useEffect } from 'react';
import { emailService } from './src/services/email';
import { smsService } from './src/services/sms';

export default function App() {
  useEffect(() => {
    // Initialize SMS listener on app start
    smsService.requestPermissions().then(hasPermission => {
      if (hasPermission) {
        smsService.startListening(onUnsure);
      }
    });

    // Initialize Email sync on app start (syncs once on open)
    emailService.initializeEmailSync();
  }, []);

  // Rest of your app...
}
```

**Or in your navigation setup:**

```typescript
// In MainNavigator.tsx or App.tsx useEffect
useEffect(() => {
  emailService.initializeEmailSync(); // Sync emails on app open
}, []);
```

## Step 9: Testing

### Test the Gmail Module

```typescript
import { NativeModules } from 'react-native';

const { GmailModule } = NativeModules;

// Test accessing Gmail
GmailModule.requestGmailAccess()
  .then(success => console.log('Gmail access:', success))
  .catch(error => console.error('Error:', error));
```

### Test Email Processing

```typescript
import { emailService } from './src/services/email';

// Simulate processing a bank email
const mockEmail = {
  id: 'email_test_123',
  from: 'noreply@banking.google.com',
  subject: 'UPI Transaction Notification',
  body: `
    INR 500.00 debited from your account
    A/c no. XX1968
    22-06-26, 10:30:45
    UPI/P2M/000000000001/STARBUCKS
    Ref. No: 123456789
    Not you? Report fraud immediately
  `,
  timestamp: Date.now(),
};

emailService.processEmail(mockEmail)
  .then(() => console.log('Email processed'))
  .catch(e => console.error('Error:', e));
```

## Step 10: Build and Deploy

```bash
# Build debug APK
cd android
./gradlew assembleDebug

# Or build release APK
./gradlew assembleRelease
```

## Troubleshooting

### "Gmail module not available"
- Ensure `GmailPackage` is registered in `MainApplication.kt`
- Rebuild and reinstall APK: `./gradlew clean assembleDebug`

### "User not signed in"
- Ensure user logged in with Gmail account
- Check device has internet connection
- Verify OAuth consent screen is configured

### "Gmail API not available"
- Enable Gmail API in Google Cloud Console
- Check API quota: Console → Gmail API → Quotas

### "Can't extract email body"
- Check email format is MIME with text/plain part
- Some HTML-only emails may not parse correctly
- Add custom parsing for specific bank formats

## Security Notes

1. **never commit** `google-services.json` to public repo
2. **Use proguard rules** for production builds:
   ```gradle
   -keep class com.google.api.** { *; }
   -keep class com.google.common.** { *; }
   ```

3. **Limit permissions** to `GMAIL_READONLY` only
4. **Never store tokens** in SharedPreferences - use secure storage

## Supported Email Formats

The system automatically detects:
- **Axis Bank:** `UPI/P2M/transaction_id/MERCHANT_NAME`
- **HDFC Bank:** `Amount: Rs 500 | Merchant: Name`
- **ICICI Bank:** `Debit: Rs 500 to Merchant`
- **Google Pay:** `PaymentUPI to Merchant`
- **PhonePe:** `Transaction ID: ... Amount: Rs 500`

## Manual Bank Format Addition

To support a new bank, add patterns to `src/services/email.ts`:

```typescript
// In extractTransactionFromEmail() method
const payeePatterns = [
  // Existing patterns...
  /NEW_BANK_PATTERN_HERE/i,
];
```

## Next Steps

1. Complete all setup steps above
2. Build and test on physical Android device
3. Test with actual bank emails
4. Monitor logs for deduplication working correctly
5. Adjust email sync interval as needed

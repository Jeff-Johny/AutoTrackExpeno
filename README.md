# AutoTrackExpeno 📱💸

An **Android app** built with React Native that automatically tracks your expenses by reading SMS messages from your bank/UPI apps. It uses AI (DeepSeek) to categorize transactions and lets you confirm or ignore them with a single tap.

## Features

- 📩 **SMS Listener** — Automatically detects spending SMS messages in real time
- 🔄 **Offline Sync** — Catches SMS missed while the app was closed
- 🤖 **AI Categorization** — Uses DeepSeek AI to identify and categorize transactions
- 🧠 **Pattern Learning** — Remembers your choices to auto-categorize future SMS from the same sender
- 📊 **Budget Tracking** — Set spending limits per category with alerts
- 📋 **Auto-Tracked Summary** — Shows a summary popup of expenses auto-logged while app was away
- 🗂 **Transaction Source** — Tap any transaction to see the original SMS that triggered it
- 📤 **Excel Export** — Export your expenses as a spreadsheet

## Setup

### Prerequisites

- Node.js >= 20
- Android Studio + Android SDK
- Java 17+

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/AutoTrackExpeno.git
cd AutoTrackExpeno
npm install
```

### 2. Configure API Keys

This app uses the [DeepSeek API](https://platform.deepseek.com) for AI categorization.

```bash
cp .env.example .env
```

Then open `.env` and fill in your API key:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here   # optional
```

> ⚠️ **Never commit your `.env` file.** It is already in `.gitignore`.

### 3. Run the app

```bash
# Start Metro bundler
npm start

# Run on Android emulator/device (new terminal)
npm run android
```

### 4. Build a release APK

```bash
cd android && ./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

## Permissions Required (Android)

- `READ_SMS` — To read SMS when app is opened (offline sync)
- `RECEIVE_SMS` — To listen for new SMS in real time
- `POST_NOTIFICATIONS` — To send budget alert notifications (Android 13+)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.83 |
| UI | React Native Paper |
| AI | DeepSeek Chat API |
| Database | SQLite (react-native-quick-sqlite) |
| State | Zustand |
| SMS | react-native-android-sms-listener + react-native-get-sms-android |

## Contributing

1. Fork the repo
2. Create your branch: `git checkout -b feature/my-feature`
3. Copy `.env.example` → `.env` and add your keys
4. Commit your changes (never commit `.env`)
5. Open a Pull Request

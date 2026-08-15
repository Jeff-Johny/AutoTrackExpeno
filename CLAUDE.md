# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AutoTrackExpeno is a bare React Native 0.83 **Android-only** app that auto-tracks expenses by
reading bank/UPI SMS, sending the message text to an AI (DeepSeek) for categorization, and letting
the user confirm/ignore the detected spend with one tap.
Core functionality (SMS listener, `PermissionsAndroid` SMS scopes) has no iOS equivalent — don't add
iOS-specific code paths without checking with the user first, and don't treat `Platform.OS !== 'android'`
early-returns as bugs.

## Commands

```bash
npm install                 # install JS deps
npm start                   # start Metro on :8081
npm run android              # build + install debug APK, launch on connected device/emulator
npm run lint                 # eslint . (config: @react-native/eslint-config)
npm test                     # jest (preset: react-native)
npx jest __tests__/App.test.tsx   # run a single test file
npx jest -t "renders correctly"   # run a single test by name

cd android && ./gradlew assembleRelease   # release APK -> android/app/build/outputs/apk/release/
```

There is no iOS build path configured for this project's core use case — treat `npm run ios` /
`ios/` as unmaintained.

### Environment

Copy `.env.example` to `.env` and set `DEEPSEEK_API_KEY` (required — AI categorization calls fail
silently and return `null` without it). Vars are injected via `react-native-dotenv` (imported as
`from '@env'`), not `process.env`. `GEMINI_API_KEY` is present in `.env.example` but unused —
`src/api/gemini.ts` currently calls the DeepSeek API despite the filename (`aiService` re-exported
as `geminiService` for backwards compatibility).

### Known local build gotchas

The Android toolchain in this repo has version skew that isn't fully pinned yet:
- `androidx.core:core:1.17.0` (pulled in transitively) requires `compileSdk`/`targetSdk` 36 —
  already set in `android/build.gradle`, but if a dependency bump reintroduces the mismatch you'll
  see it as a `checkDebugAarMetadata` failure recommending compileSdk 36.
- Gradle's Jetifier transform on the `react-android` AAR needs more heap than the default; if you
  see `Java heap space` during `checkDebugAarMetadata`, raise `org.gradle.jvmargs` in
  `android/gradle.properties` (currently `-Xmx4096m`).
- `react-native-screens`' `StackHeaderConfigAndroidNativeComponent.ts` uses `React.ComponentRef<>`
  for a native command arg, but this RN 0.83.1 install's codegen parser
  (`@react-native/codegen`) only accepts `React.ElementRef<>`, so a fresh `npm install` will
  reintroduce a `generateCodegenSchemaFromJavaScript` failure. It's currently hand-patched in
  `node_modules` (not tracked by git, so it doesn't survive a clean install) — either re-apply the
  same one-line swap or wire up `patch-package` if this keeps recurring.
- Metro can silently die under load (e.g. while Gradle is doing a heavy native build) and leave the
  app stuck on "Loading from ...". If a build install succeeds but the app never gets past the
  loading screen, check `lsof -i :8081` / `curl localhost:8081/status` and restart `npm start`.

## Architecture

### Data flow: SMS → AI → pending queue → confirmed expense

This is the core loop and spans several files — read them together, not in isolation:

1. **Ingestion** (`src/services/sms.ts`): `smsService.startListening` (live
   `react-native-android-sms-listener` events) and `smsService.syncRecentSms`
   (`react-native-get-sms-android`, catch-up scan on app start using a persisted
   `last_sync_timestamp`) both funnel messages through the same pipeline.
2. **Filtering/classification order** (same in both listener and sync paths, `classifyTransaction`
   in `sms.ts`): deterministic regex extraction first (`transactionParser.ts` — pre-filters
   OTP/credit/promo text and extracts amount/payee without an AI call) → check `learned_patterns`
   for a payee/keyword match (`patternService.checkPattern`) → static keyword dictionary
   (`categoryKeywords.ts`) → AI categorization as a last resort, only when both come up empty (and
   a definite `isSpending: false` from the AI downgrades the result even at this stage) → save the
   result to `sms_transactions` with a `status` of `pending`, `system_ignored`, or (once the user
   acts) `confirmed`/`user_ignored`. A `pending` result with no usable amount is always downgraded
   to `system_ignored` rather than shown to the user.
3. **Pending → confirmed**: items needing user input go into the Zustand `unsureData` /
   `unsureDataQueue` (single-item-visible + FIFO queue, see `useStore.setUnsureData`) and are
   rendered by the single global confirm/edit modal in `App.tsx` — there's no per-screen modal.
   Confirming calls `expenseService.addExpense` (which also runs budget-overshoot notification
   logic) and `patternService.addPattern` to learn the payee→category mapping for next time.
   Ignoring only writes an `ignore` pattern, no expense.
4. **Pattern learning** (`src/services/patterns.ts`): patterns are keyed by a free-text `pattern`
   string (usually the AI-extracted payee) with `action: 'ignore' | 'category'`. Payee-based ignore
   rules take priority over generic substring matches in `checkPattern`.

Email/Gmail ingestion was removed — `sms_transactions.source`/`transaction_hash` columns remain in
the schema (harmless, default to `'sms'`) but nothing writes a non-SMS source anymore.

### Storage

Single SQLite db (`react-native-quick-sqlite`, `expeno.db`) owned by `src/services/db.ts`
(`dbService`). Schema changes are applied as idempotent `CREATE TABLE IF NOT EXISTS` plus
best-effort `ALTER TABLE ... ADD COLUMN` wrapped in try/catch (no formal migration system) — follow
this pattern for new columns rather than introducing a migration framework. Tables: `expenses`,
`categories` (with per-category `maxSpend` budget), `learned_patterns`, `settings` (key/value, used
for `last_sync_timestamp`), `sms_transactions` (the pending/ignored queue).

### State

`src/store/useStore.ts` is the single Zustand store for all cross-screen state (expenses,
categories, patterns, the unsure-item queue, sync status). Most fields are loosely typed (`any`) —
this is consistent with the rest of the codebase, not an oversight to "fix" opportunistically.
Screens read/write the store directly rather than going through service-layer callbacks.

### Navigation

`src/navigation/MainNavigator.tsx`: a native-stack `Home` route wrapping a bottom-tab navigator
(Dashboard / Transactions / Categories / Settings), plus a sibling `PendingTransactionsScreen`
stack route (reached from Dashboard, not a tab).

### AI categorization

`src/api/gemini.ts` sends raw SMS text to DeepSeek's chat-completions endpoint with a
system+user prompt that enforces strict spend-only classification (OTP/credit/refund/pending/promo
→ `isSpending: false`) and a fixed category enum from `DEFAULT_CATEGORIES`
(`src/utils/constants.ts`). Returns `null` on any error/parse failure — callers must handle that.

### Notifications

`src/services/notifications.ts` wraps `react-native-push-notification` with actionable
Confirm/Ignore buttons; the action handlers live in `App.tsx`'s `notificationService.configure`
callback, not in the service itself.

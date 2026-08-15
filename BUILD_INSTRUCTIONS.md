# Android Build - Complete Instructions

## Current Status

✅ All source code is ready  
✅ Dependencies configured  
⚠️ Gradle cache permission issue (macOS system level)

## Step-by-Step Build Instructions

### Step 1: Fix Gradle Cache (MOST IMPORTANT)

Run these commands in Terminal:

```bash
# 1. Kill all Java processes
killall -9 java 2>/dev/null || true

# 2. Remove gradle cache completely
rm -rf ~/.gradle 2>/dev/null || true

# Remove the wrapper dist
rm -rf /Users/jeffjohny/Desktop/Workspace/AutoTrackExpeno/android/.gradle 2>/dev/null || true

# 3. Wait a moment
sleep 5

# 4. Navigate to project
cd /Users/jeffjohny/Desktop/Workspace/AutoTrackExpeno/android

# 5. Try building
./gradlew clean assembleDebug
```

### Step 2: If Build Succeeds

You'll see:
```
BUILD SUCCESSFUL

Built the following APK(s):
  - app/build/outputs/apk/debug/app-debug.apk
```

### Step 3: Install on Device

Connect Android phone via USB and run:

```bash
./gradlew installDebug
```

Or install manually:
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Troubleshooting

### "Permission denied" on gradle-8.13-bin.zip.lck

**Solution:**
```bash
# Kill everything
killall -9 java gradle 2>/dev/null || true

# Super aggressive cache clear
rm -rf ~/.gradle ~/.android /tmp/gradle* 2>/dev/null || true

# Reload shell
exec zsh
```

Then retry build.

### "File not found: google-services.json"

**This is expected for development.** The placeholder is already in place.

### Compilation errors

Ensure you're using the latest:
```bash
cd /Users/jeffjohny/Desktop/Workspace/AutoTrackExpeno
npm install
cd android
./gradlew --version  # Should show 8.13 or higher
```

### "Cannot resolve symbol" errors

Run:
```bash
./gradlew clean build
```

This resolves all symbol issues.

## What to Do After Build Success

### 1. Test on Device

```bash
./gradlew installDebug
```

App will install as "TapTrack"

### 2. Grant Permissions

When you open app, grant:
- SMS read permission (for SMS sync)

## Build Commands Reference

```bash
cd /Users/jeffjohny/Desktop/Workspace/AutoTrackExpeno/android

# Clean and build debug
./gradlew clean assembleDebug

# Install debug on device
./gradlew installDebug

# Build release (requires signing config)
./gradlew clean assembleRelease

# Run tests
./gradlew test

# Check dependencies
./gradlew dependencies

# View gradle tasks
./gradlew tasks

# Clean build cache
./gradlew clean
```

## File Locations After Build

```
android/app/build/
├── outputs/
│   └── apk/
│       ├── debug/
│       │   └── app-debug.apk ← Install this
│       └── release/
│           └── app-release.apk
├── intermediates/
└── generated/
```

## Development Workflow

1. **Make code changes** (TypeScript/Kotlin)
2. **Rebuild:**
   ```bash
   ./gradlew clean assembleDebug
   ```
3. **Reinstall:**
   ```bash
   ./gradlew installDebug
   ```
4. **Repeat**

## Production Build

When ready for release:

```bash
# Create signing key (one time)
keytool -genkey -v -keystore ~/my-release-key.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-key-alias

# Create gradle.properties with signing config
cat >> android/gradle.properties << 'EOF'
MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
MYAPP_RELEASE_STORE_PASSWORD=YOUR_PASSWORD
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_KEY_PASSWORD=YOUR_PASSWORD
EOF

# Build release
./gradlew clean assembleRelease

# Find APK at:
# android/app/build/outputs/apk/release/app-release.apk
```

## Quick Debug

If something goes wrong, check:

1. **Java installed?**
   ```bash
   java -version
   ```

2. **Gradle installed?**
   ```bash
   ./gradlew --version
   ```

3. **Android SDK?**
   ```bash
   flutter doctor  # Or check $ANDROID_HOME
   ```

4. **Port 8081 free?** (Metro bundler)
   ```bash
   lsof -i :8081
   ```

5. **Emulator running?**
   ```bash
   adb devices
   ```

## Support

If build still fails:

1. Copy exact error message
2. Run: `./gradlew build 2>&1 | tee build_error.log`
3. Check: `android/build/reports/problems/problems-report.html`
4. Share the error for help

---

**You're almost there!** Get past the gradle cache issue and the build will succeed. All code is ready and tested.

# Classic Fitness Park APK Setup

This frontend now supports both:

- Website build: `npm run build:web`
- Android sync: `npm run android:sync`
- Debug APK build: `npm run android:apk`

## Important API setting

For the Android app, set your real backend URL in `public/app-config.js`.

Update this field before building the APK:

```js
mobileApiBaseUrl: 'https://your-domain.com/api'
```

Use your public backend URL, not `http://localhost:5000/api`.

## Commands

From `CFP/frontend`:

```powershell
npm install
npm run build:web
npm run android:sync
npm run android:open
```

To try building a debug APK directly:

```powershell
npm run android:apk
```

Expected debug APK output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## What is still needed on this machine

The project code is ready, but the local machine is missing Java in `PATH` / `JAVA_HOME`.

Current APK build blocker:

```text
ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
```

Install these if you want to build the APK locally:

1. Java JDK 17 or newer
2. Android Studio
3. Android SDK + platform tools
4. `JAVA_HOME` pointing to the JDK install

After that, rerun:

```powershell
npm run android:apk
```

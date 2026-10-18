# Native app builds (Android / iOS)

Aara ships as a single-page PWA. The native apps are thin Capacitor shells
around the exact same code — no second codebase to maintain. On a device,
`index.html` detects `window.Capacitor` and routes file downloads and shares
through the native Filesystem / Share plugins instead of browser downloads.

## One-time setup

```bash
npm install          # pulls @capacitor/* devDependencies
npm run app:add      # creates android/ and ios/ projects
```

- Android: Android Studio + SDK
- iOS: Xcode on a Mac, Apple Developer account for distribution

## Build & run

```bash
npm run app:sync     # copies web assets into www/, then `cap sync`
npm run app:android  # opens the project in Android Studio
npm run app:ios      # opens the project in Xcode
```

From the IDE: run on a device/emulator, or build the signed AAB/IPA for the
Play Store / App Store.

## What changes inside the shell

| Behaviour | Browser / PWA | Native app |
|---|---|---|
| Backup / PDF / CSV download | Browser download | Saved via Filesystem plugin, then the share sheet opens |
| Share PDF | Web Share API (or download) | Native share sheet |
| Service worker | Registers for offline | Skipped (assets are bundled) |
| Sync | Same Supabase REST calls | Same — `CapacitorHttp` plugin keeps cookies/sessions sane |

## Store checklist (when ready to publish)

- App icon + splash: replace generated Capacitor defaults with `icon.svg`
- Play Store: AAB + privacy policy URL (the in-app policy can be hosted)
- App Store: privacy nutrition label — data stays on device unless sync is
  configured by the owner, which is a good story to tell

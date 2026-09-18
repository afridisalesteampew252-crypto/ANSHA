# Mobile

Capacitor provides a thin iOS/Android shell around the existing public catalog PWA. It does not rewrite admin or ship a second app codebase. The WebView loads the live site URL (default `https://www.anshatradingco.com`).

The installable PWA (Phase 22) remains the primary mobile path in the browser. Capacitor is additive for store-ready wrappers.

## Prerequisites

- Node.js `>=20.9.0` and npm (`npm ci --legacy-peer-deps` in `ANSHA/`)
- Capacitor packages are already in `package.json` (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`)
- **Android:** Android Studio + JDK 17+, Windows or macOS
- **iOS:** Xcode on macOS only (Windows cannot build or open iOS projects)

Native project folders (`android/`, `ios/`) are generated locally and are gitignored. Do not commit them unless a later release process requires checked-in native projects.

## Config

| File | Role |
|---|---|
| `capacitor.config.ts` | App id `com.anshatrading.app`, `webDir: native/www`, `server.url` |
| `native/www/` | Minimal placeholder required by `cap sync` (not the Next.js build) |

Default server URL: `https://www.anshatradingco.com`.

Override for a preview or staging host:

```powershell
$env:CAPACITOR_SERVER_URL = "https://your-preview.vercel.app"
npx cap sync
```

```bash
CAPACITOR_SERVER_URL=https://your-preview.vercel.app npx cap sync
```

## One-time: add platforms

From `ANSHA/`:

```bash
npx cap add android
```

On macOS only:

```bash
npx cap add ios
```

Or via npm scripts: `npm run cap:add:android` / `npm run cap:add:ios`.

## Sync and open

After config changes or dependency updates:

```bash
npx cap sync
```

Open IDEs:

```bash
npx cap open android
# macOS only:
npx cap open ios
```

npm scripts: `npm run cap:sync`, `npm run cap:android`, `npm run cap:ios`.

## Build and run (high level)

1. Ensure production (or override) URL is reachable and HTTPS.
2. `npx cap sync`
3. Android Studio: select a device/emulator → Run.
4. Xcode (macOS): select a simulator/device → Run. Configure signing for physical devices / App Store.

Store listing, push certificates, and deep-link schemes are out of scope for this MVP shell.

## Windows note

Windows can fully support the Android path (Studio + Gradle). iOS requires a Mac with Xcode. Generate `ios/` on a Mac when needed; do not expect `cap open ios` to work on Windows.

## What this is not

- Not a rewrite of `/admin` into native UI
- Not offline-first native storage separate from the PWA service worker
- Not a second Supabase project or API

Public catalog, portal, and staff ERP stay on the same Next.js + Supabase deployment. See `docs/Architecture.md` and `docs/Deployment.md`.

# Mobile

Capacitor provides an iOS/Android shell around the dedicated mobile frontend at `/mobile`. The website and APK have different UI routes, but they use the same Next.js deployment, Supabase project, Supabase Auth, Storage, and database. The WebView loads `https://www.anshatradingco.com/mobile` by default.

The installable PWA (Phase 22) remains the primary mobile path in the browser. Capacitor is additive for store-ready wrappers. PWA details: `docs/PWA.md`.

## Prerequisites

- Node.js `>=20.9.0` and npm (`npm ci --legacy-peer-deps` in `ANSHA/`)
- Capacitor packages are already in `package.json` (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`)
- **Android:** Android Studio + JDK 17+, Windows or macOS
- **iOS:** Xcode on macOS only (Windows cannot build or open iOS projects)

Native project folders (`android/`, `ios/`) are generated locally and are gitignored. Do not commit them unless a later release process requires checked-in native projects.

## Config

| File | Role |
|---|---|
| `capacitor.config.ts` | App id `com.anshatrading.app`, `webDir: native/www`, mobile `server.url` |
| `app/mobile/` | Dedicated mobile-first app shell, dashboard, catalogs, sign-in, and account routes |
| `native/www/` | Minimal placeholder required by `cap sync` (not the Next.js build) |

Default server URL: `https://www.anshatradingco.com/mobile`.

Override for a preview or staging host:

```powershell
$env:CAPACITOR_SERVER_URL = "https://your-preview.vercel.app"
npx cap sync
```

```bash
CAPACITOR_SERVER_URL=https://your-preview.vercel.app/mobile npx cap sync
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

## Shared admin and data architecture

The website and mobile frontend intentionally share the same Supabase project and tables. The existing admin site remains the single control center: publishing a vehicle, part, offer, invoice, reservation, or notification target makes that data available to both frontends without copying records or introducing a second database. The mobile dashboard reads published `vehicles`, `parts`, and `site_offers` directly through the existing public Supabase policies.

Normal mobile UI changes are deployed with the website and become available the next time the APK opens because the Capacitor shell loads `/mobile` remotely. Native changes—Firebase/FCM integration, Android permissions, icons, splash screens, deep links, or Capacitor plugins—still require a new signed APK/AAB and store/direct-download release.

## Windows note

Windows can fully support the Android path (Studio + Gradle). iOS requires a Mac with Xcode. Generate `ios/` on a Mac when needed; do not expect `cap open ios` to work on Windows.

## What this is not

- Not a rewrite of `/admin` into native UI
- Not offline-first native storage separate from the PWA service worker
- Not a second Supabase project or API

Public catalog, portal, and staff ERP stay on the same Next.js + Supabase deployment. See `docs/Architecture.md` and `docs/Deployment.md`.


## Google Play account deletion

The wrapped site supports account creation and deletion on the same production origin:

- In app: Portal → Settings → Request account deletion.
- External web resource: `https://www.anshatradingco.com/account-deletion`.
- Admin review is limited to ownership/fraud checks. Approval deletes the Auth login and anonymizes personal customer fields.
- Only records required for legal, tax, fraud-prevention, or audit obligations may remain, in anonymized form.
- Enter the external URL in the Play Console Data safety account-deletion field before release.

## Native Android notifications (FCM)

The Android wrapper uses Capacitor Push Notifications with Firebase Cloud Messaging (FCM). The registered Firebase Android app must use the exact package name `com.anshatrading.app`. The Firebase client configuration is kept at `firebase/google-services.json`; the generated native project is ignored, so the file is copied into `android/app/google-services.json` by the preparation script before every Android sync.

The repository includes the native notification client and Supabase registration flow. When the APK starts on Android, it requests notification permission when required, registers with FCM, and upserts the installation token through the `register_fcm_push_token` RPC. Desktop and mobile browsers continue using the existing Web Push/VAPID flow and do not load the native bridge.

Prepare the generated Android project after cloning or after removing the ignored `android/` directory:

```bash
npm ci --legacy-peer-deps
npx cap add android                         # only if android/ does not exist
npm run cap:sync:android
```

The Android 13+ notification permission is requested at runtime. Android devices and emulators must have Google Play services available. FCM delivery can be smoke-tested from Firebase Console → Messaging after installing an APK built from the configured project.

### Firebase Console checklist

1. Open the [Firebase Console](https://console.firebase.google.com/) and create or select the ANSHA Trading project.
2. Register an Android app with package name `com.anshatrading.app`.
3. Download `google-services.json` and replace `firebase/google-services.json` only when the Firebase project changes.
4. Do not commit a Firebase service-account private key. The client JSON contains app identifiers and is used by the Android build; it is not a server credential.
5. To send from ANSHA admin workflows rather than the Firebase Console, configure the repository's Firebase HTTP v1 sender with the protected Supabase Edge Function secret `FCM_SERVICE_ACCOUNT_JSON`. Its value is the complete Firebase service-account JSON containing `project_id`, `client_email`, and `private_key`. Never put a service-account JSON, private key, or FCM server credential in the web bundle or `NEXT_PUBLIC_*` environment variables.

The existing `send-web-push` admin function is platform-aware: it continues delivering browser notifications through VAPID and also sends Android notifications through FCM when the secret is configured. Targeted support notifications use the same behavior. Invalid Android tokens are removed after FCM reports them as unregistered. The response reports native subscriber, sent, failed, and configuration counts so operators can distinguish a configured sender from a browser-only send.

Configure the secret from a trusted operator environment, never from the website or APK:

```bash
supabase secrets set --project-ref ydrnilquojvalhgifest FCM_SERVICE_ACCOUNT_JSON="$(cat firebase/fcm-service-account.json)"
```

Keep `firebase/fcm-service-account.json` outside the repository or in a protected local path; only `firebase/google-services.json` belongs in the repository. After deployment, install an APK, sign in, send a test push from `/admin/subscribers`, and verify both the admin response's `native_sent` count and the device notification. Do not treat a token-registration success as proof of delivery.

### Supabase migration

Apply `supabase/migrations/20260924010000_native_fcm_push.sql` to the ANSHA Supabase project before testing device registration. It extends `push_subscriptions` with platform and FCM token fields and adds the public registration RPC. The RPC only upserts a caller-provided device token; it does not expose subscriber rows. Workspace/admin reads remain protected by the existing row-level security policies.

### Data and notification behavior

The APK still loads the live site URL from `capacitor.config.ts`; it does not bundle a separate database or catalog. Data uploaded through the website and stored in the ANSHA Supabase project appears in the app when the corresponding live page is opened or refreshed. FCM registration is separate from data synchronization: it identifies an app installation so a future server-side sender can deliver targeted notifications and deep-link the user to the relevant ANSHA page.

### Native portal sign-in and PWA separation

The native shell uses the deep-link callback `ansha://auth/callback?next=/portal/account` for customer email confirmation and Google OAuth. Add this exact URL to Supabase Authentication → URL Configuration → Redirect URLs before testing native OAuth. The Android preparation script adds the matching `ansha://auth/callback` intent filter to the generated manifest. The app URL handler converts that deep link into the live site's `/auth/callback` route inside the WebView, so the user returns to `/portal/account` without being left in Chrome or the PWA.

PWA install prompts, browser Web Push opt-ins, and the service worker are disabled when `Capacitor.isNativePlatform()` is true. Desktop and mobile browser users retain the PWA experience; Android APK users remain in the native ANSHA app.

### Website APK download route

The public website exposes `/download` as the customer-facing Android download page. The current APK is served from `/downloads/ansha-trading-mobile.apk`, and the page explains Android's direct-install permission flow. Keep the downloadable file replaced with the latest signed release APK before public distribution; the checked-in artifact is currently the validated debug build for testing. The website header includes a `Download app` link so desktop and mobile browser visitors can find it without entering the APK UI.

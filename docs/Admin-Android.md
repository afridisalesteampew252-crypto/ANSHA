# ANSHA Admin Android APK

The admin APK is a separate staff app. It keeps the customer/catalog APK unchanged and loads the existing role-protected ANSHA admin dashboard at `/admin/dashboard`. Staff sign in with their existing ANSHA admin account. The current dashboard already contains the operations and finance metrics/charts; it now also shows live API/database health.

## Android app identity

- App name: **ANSHA Admin**
- Android package: `com.anshatrading.admin`
- Capacitor config: `capacitor.admin.config.ts`
- Start URL: `https://www.anshatradingco.com/admin/dashboard`
- Push provider: Firebase Cloud Messaging (FCM)
- Android native project is generated locally or in GitHub Actions; it remains gitignored.

Register a second Android app in the existing Firebase project with the exact package name `com.anshatrading.admin`. Download its `google-services.json` and add it to the repository as `firebase/google-services-admin.json`. This client configuration is required at build time; the prepare script validates its package name before copying it into the generated Android project.

## Build a debug APK

From a clean checkout:

```bash
npm ci --legacy-peer-deps
npm run cap:add:admin:android
npm run cap:sync:admin:android
cd android
./gradlew assembleDebug
```

The installable test APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

Alternatively, add `firebase/google-services-admin.json`, then run the repository's **Build ANSHA Admin APK** GitHub Actions workflow. It uploads the debug APK as a downloadable artifact. The workflow can point the APK at a Vercel preview by changing the `server_url` input.

Debug APKs are for internal testing. To distribute a release that can be updated cleanly, configure a private Android signing keystore in the release pipeline. Never commit the keystore or its passwords.

## Push-notification setup

Native FCM token registration and admin deep links are included. The SQL migration also fixes the existing token-registration insert so Android tokens are stored against the signed-in user. New `admin_notifications` rows are forwarded asynchronously to the sender Edge Function; it sends only to Android devices registered to that notification's recipient.

After merging the PR:

1. Apply database migrations to the ANSHA Supabase project.
2. Deploy `send-admin-push`.
3. In Supabase Edge Functions → Secrets, set:
   - `FCM_SERVICE_ACCOUNT_JSON`: the Firebase service-account JSON with Firebase Cloud Messaging send permission.
   - `ADMIN_PUSH_WEBHOOK_SECRET`: a random secret of at least 32 characters.
4. Store the same webhook secret in Supabase Vault with the name `admin_push_webhook_secret`. The database trigger reads it at call time; no secret is embedded in SQL or source control.
5. Add `firebase/google-services-admin.json` and build the admin APK.

The Edge Function is configured without Supabase JWT verification because Postgres calls it with the private webhook secret header. The function rejects requests unless that secret matches. Keep the secret and Firebase service-account key in Supabase-managed secrets only.

## Important scope

The app opens the existing ANSHA website inside Capacitor. Admin permissions remain enforced by the existing Supabase Auth session and admin-role checks. The APK does not add a separate database or bypass website authorization.


## Freight and bulk catalog tools

The admin APK is a Capacitor shell around the shared `/admin` web app. After deploying the shared web app, authorized APK users can reach the same bulk pricing, model M³ configuration, freight charge setup, and freight calculator. The APK does not keep a separate local price or freight database. See [Catalog Prices and Freight](./Catalog-Freight-Pricing.md) for details.

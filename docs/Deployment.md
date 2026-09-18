# Deployment

## Path

```
GitHub (afridisalesteampew252-crypto/ANSHA)
  → branch push / PR
    → GitHub Actions CI on pull_request and push to main
    → Vercel Preview (non-main) or Production (main)
```

Default branch is `main`. There is no `master` workflow in `.github/workflows/ci.yml`.

## Vercel

- Install: `npm ci --legacy-peer-deps` (`vercel.json`)
- Framework: Next.js 16
- Canonical host: `https://www.anshatradingco.com`
- Redirects in `next.config.js`: `anshatrading.com`, `www.anshatrading.com`, `anshatradingco.com` → canonical HTTPS
- Admin routes: `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`
- Health: `GET /api/health` (no-store)

`vercel.json` only sets `installCommand`. Public Supabase URL and publishable key come from Vercel Environment Variables (and local `.env.local`), not from git. GitHub Actions injects placeholders for CI builds.

## CI

`.github/workflows/ci.yml` runs Node 24: `npm ci --legacy-peer-deps`, `lint`, `typecheck`, `verify:brands`, `build`. Placeholder public Supabase env is injected so the build can compile. CI does **not** run `verify:deployment`.

## Preview before production

Preferred: feature branch → Preview URL → `npm run verify:deployment -- <preview-url>` → merge to `main`.

Release gate locally: `npm run verify:release`.

## PWA

Public catalog is installable (`app/manifest.ts`, `/sw.js`, `/icons/*`, `/offline`). Service worker intentionally bypasses `/admin`, `/api`, and cross-origin requests. `verify:deployment` checks the manifest, service worker, offline page, and icon.

Web Push (Phase 24): set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` on Vercel. Set Edge Function secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and optional `VAPID_SUBJECT` (mailto:) for `send-web-push`. Generate keys with `npx web-push generate-vapid-keys`. Never put the private key in `NEXT_PUBLIC_*` or git.

Outbound email (Phase 39): set Edge Function secrets for `send-outbound-email` (not Vercel `NEXT_PUBLIC_*`, and not the Supabase service role in the Next.js app):

| Secret | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | yes | Resend API key (`re_…`). Without it the function returns HTTP 503 with a clear error. |
| `RESEND_FROM_EMAIL` | no | Default `ANSHA Trading <noreply@anshatradingco.com>`. Must be a verified Resend sender/domain. |

Set with Supabase CLI against project `ydrnilquojvalhgifest`, e.g. `supabase secrets set RESEND_API_KEY=re_… RESEND_FROM_EMAIL="ANSHA Trading <noreply@anshatradingco.com>"`. Redeploy `send-outbound-email` after changing secrets. SMTP is not wired in this MVP — Resend only.


## Capacitor (native shell)

Store builds are local: generate `android`/`ios` with `npx cap add …`, then `npx cap sync` and open Android Studio or Xcode. The shell loads the deployed public URL (`capacitor.config.ts` `server.url`), not a bundled Next.js `out/` folder. CI and Vercel remain web-only. Full steps: `docs/Mobile.md`.


WhatsApp Business Cloud API (Phase 40): set Edge Function secrets for `send-whatsapp` (never `NEXT_PUBLIC_*`, never commit tokens):

| Secret | Required | Notes |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | yes | Meta permanent Cloud API token (alias `WHATSAPP_CLOUD_API_TOKEN` also accepted). |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | WhatsApp Business phone number ID from Meta. |
| `WHATSAPP_API_VERSION` | no | Graph API version; default `v21.0`. |

Set with Supabase CLI against project `ydrnilquojvalhgifest`, e.g. `supabase secrets set WHATSAPP_ACCESS_TOKEN=… WHATSAPP_PHONE_NUMBER_ID=…`. Redeploy `send-whatsapp` after changing secrets. Admin UI `/admin/whatsapp` probes `action: status` and shows setup instructions when secrets are missing (no crash).

## Rollback

Vercel instant rollback to a previous production deployment is the application rollback. Database is **not** rolled back by a Vercel revert. Forward-fix with a new migration if schema already applied.

## Backups

Supabase project backups are an infrastructure concern, not an in-repo script. Do not treat `supabase db reset` as a recovery tool on production.

## Leftovers

- Inactive Supabase project `kmngigxpqhiilcavmcmm` is already `INACTIVE` (cannot pause again). Permanent delete is a dashboard action if still required.

## Edge Functions

`admin-create-user`, `admin-update-user`, `send-outbound-email`, `send-whatsapp`, and related functions deploy with the Supabase project, not with the Next.js Vercel build. Shared CORS lives in `supabase/functions/_shared/cors.ts`. Deploy both functions together so they keep the same origin allowlist and anon-key caller verification.

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

## SEO / Search Console (shipped)

After each production deploy that touches crawl metadata:

1. **Google Search Console ownership** — root layout includes `metadata.verification.google` (HTML tag). Confirm the property verifies for `https://www.anshatradingco.com`.
2. **Request indexing** — submit or re-request key URLs (home, catalog hubs, blog, reviews) once the deploy is READY.
3. **Favicon / brand icons** — stable `/favicon.ico` plus `/icons/favicon-48.png` and PWA icons under `/icons/*`. Google may take **days** to refresh the SERP icon after a change.
4. **Default Open Graph** — `/images/og-default.jpg` via `lib/seo.ts` (`defaultOgImage`); listing/detail pages fall back to it when no cover photo exists.

Helpers: `lib/seo.ts`, `scripts/generate-brand-icons.mjs`.

## CI

`.github/workflows/ci.yml` runs Node 24: `npm ci --legacy-peer-deps`, `lint`, `typecheck`, `verify:brands`, `build`. Placeholder public Supabase env is injected so the build can compile. CI does **not** run `verify:deployment`.

## Preview before production

Preferred: feature branch → Preview URL → `npm run verify:deployment -- <preview-url>` → merge to `main`.

Release gate locally: `npm run verify:release`.

## PWA

Public catalog is installable (`app/manifest.ts`, `/sw.js`, `/icons/*`, `/offline`). Service worker intentionally bypasses `/admin`, `/api`, and cross-origin requests. `verify:deployment` checks the manifest, service worker, offline page, and icon.

Web Push (Phase 24) — generate once, then split public vs private:

1. From the repo root: `npx web-push generate-vapid-keys` (prints Public Key + Private Key).
2. **Next.js (browser subscribe):** set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to the Public Key in local `.env.local` and on the Vercel project for **Production** and **Preview**. Redeploy Next after changing it.
3. **Edge Function `send-web-push` (staff send):** set secrets on Supabase project `ydrnilquojvalhgifest` — never `NEXT_PUBLIC_*`, never git:

```
supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT="mailto:info@anshatrading.com" --project-ref ydrnilquojvalhgifest
supabase functions deploy send-web-push --project-ref ydrnilquojvalhgifest
```

`VAPID_SUBJECT` is optional (defaults to a mailto). Notifications only fire when staff opts in (offers checkbox, blog “PWA push on publish”, or campaigns Send now) — nothing auto-sends from the database.

**Common failure:** Edge logs show `VAPID_PUBLIC_KEY is not valid URL-safe base64` or `Failed to decode base64` when secrets were pasted with ellipsis placeholders (`…`) or quotes. Re-set with the real keys from `npx web-push generate-vapid-keys` (or your existing matching pair). MCP cannot set secrets — use CLI after `npx supabase login` or the Supabase Dashboard → Edge Functions → Secrets.

Outbound email (Phase 39): set Edge Function secrets for `send-outbound-email` (not Vercel `NEXT_PUBLIC_*`, and not the Supabase service role in the Next.js app):

| Secret | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | yes | Resend API key (`re_…`). Without it the function returns HTTP 503 with a clear error. |
| `RESEND_FROM_EMAIL` | no | Default `ANSHA Trading <noreply@anshatradingco.com>`. Must be a verified Resend sender/domain. |

Set with Supabase CLI against project `ydrnilquojvalhgifest`, e.g. `supabase secrets set RESEND_API_KEY=re_… RESEND_FROM_EMAIL="ANSHA Trading <noreply@anshatradingco.com>"`. Redeploy `send-outbound-email` after changing secrets. SMTP is not wired in this MVP — Resend only.

AI ops assistant (Phase 42): set on the **Vercel** project (and local `.env.local`), not as browser `NEXT_PUBLIC_*` values:

| Variable | Required | Notes |
|---|---|---|
| `AI_GATEWAY_API_KEY` | preferred | Vercel AI Gateway; AI SDK default provider |
| `OPENAI_API_KEY` | fallback | Direct OpenAI when gateway is unset |
| `AI_MODEL` | no | Override model id |

## Capacitor (native shell)

Store builds are local: generate `android`/`ios` with `npx cap add …`, then `npx cap sync` and open Android Studio or Xcode. The shell loads the deployed public URL (`capacitor.config.ts` `server.url`), not a bundled Next.js `out/` folder. CI and Vercel remain web-only. Full steps: `docs/Mobile.md`.


WhatsApp Business Cloud API (Phase 40): set Edge Function secrets for `send-whatsapp` (never `NEXT_PUBLIC_*`, never commit tokens):

| Secret | Required | Notes |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | yes | Meta permanent Cloud API token (alias `WHATSAPP_CLOUD_API_TOKEN` also accepted). |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | WhatsApp Business phone number ID from Meta. |
| `WHATSAPP_API_VERSION` | no | Graph API version; default `v21.0`. |

Set with Supabase CLI against project `ydrnilquojvalhgifest`, e.g. `supabase secrets set WHATSAPP_ACCESS_TOKEN=… WHATSAPP_PHONE_NUMBER_ID=…`. Redeploy `send-whatsapp` after changing secrets. Admin UI `/admin/whatsapp` probes `action: status` and shows setup instructions when secrets are missing (no crash).

Tawk.to live chat (public widget + admin agent inbox): set on the **Vercel** project (and local `.env.local`). These are publishable widget IDs, not secrets — still do not hard-code them in git.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_TAWK_PROPERTY_ID` | yes (to enable) | From embed URL `https://embed.tawk.to/<PROPERTY_ID>/<WIDGET_ID>` |
| `NEXT_PUBLIC_TAWK_WIDGET_ID` | yes (to enable) | Widget id from the same URL |
| `NEXT_PUBLIC_TAWK_DASHBOARD_URL` | no | Defaults to `https://dashboard.tawk.to` for `/admin/live-chat` |

Leave property/widget blank to disable the public widget. Admin Live chat is **admin + manager only** (see `docs/Roles.md`). Redeploy Next.js after changing Vercel env.

**Phase 58 (activated):** Tawk webhook mirror — Edge secret `TAWK_WEBHOOK_SECRET`, migration `20260920070000_phase_58_tawk_chat_events.sql`, Edge Function `tawk-webhook` deployed with `--no-verify-jwt`, Tawk dashboard → Webhooks → URL `https://ydrnilquojvalhgifest.supabase.co/functions/v1/tawk-webhook` (Chat Start, Chat End, New ticket). Full steps: `docs/Tawk.md`. Never commit the webhook secret.

## Rollback

Vercel instant rollback to a previous production deployment is the application rollback. Database is **not** rolled back by a Vercel revert. Forward-fix with a new migration if schema already applied.

## Backups

Supabase project backups are an infrastructure concern, not an in-repo script. Do not treat `supabase db reset` as a recovery tool on production.

## Leftovers

- Inactive Supabase project `kmngigxpqhiilcavmcmm` is already `INACTIVE` (cannot pause again). Permanent delete is a dashboard action if still required.

## Edge Functions

`admin-create-user`, `admin-update-user`, `send-outbound-email`, `send-whatsapp`, `tawk-webhook`, and related functions deploy with the Supabase project, not with the Next.js Vercel build. Shared CORS lives in `supabase/functions/_shared/cors.ts`. Deploy JWT-protected functions together so they keep the same origin allowlist and anon-key caller verification. Deploy `tawk-webhook` with `--no-verify-jwt` (Tawk cannot send a Supabase JWT; HMAC is verified in-function).

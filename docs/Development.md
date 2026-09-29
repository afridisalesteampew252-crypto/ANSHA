# Development

Local work happens in `ANSHA/`. Package manager is npm (`package-lock.json`). Node.js must be `>=20.9.0`.

## Setup

1. Copy `.env.example` to `.env.local`
2. Fill variable **names** with development values. Never commit `.env.local`
3. `npm ci --legacy-peer-deps` (or `npm install --legacy-peer-deps` on a new machine)

Required names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — legacy fallback only if the publishable key is unset

Optional (public site):

- `NEXT_PUBLIC_GTM_ID` — Google Tag Manager (`GTM-TFSZD9WT` in production; set on Vercel Production). Unset uses `siteConfig.gtmId` fallback; blank disables. Public + portal layouts (not `/admin`). GA and other tags fire from the GTM container. See `docs/Deployment.md`.
- `NEXT_PUBLIC_GTM_GATEWAY_PATH` — optional; default `/metrics`. First-party path for Google tag gateway (must match the Vercel rewrite to `gtm-tfszd9wt.fps.goog`).

Do not put `SUPABASE_SERVICE_ROLE_KEY` in Next.js env. Service role belongs on Edge Functions only.

AI ops assistant (Phase 42) — server-only on Vercel / `.env.local` (never `NEXT_PUBLIC_*`):

| Variable | Required | Notes |
|---|---|---|
| `AI_GATEWAY_API_KEY` | preferred | Vercel AI Gateway key used by the AI SDK |
| `OPENAI_API_KEY` | fallback | Used when gateway key is unset |
| `AI_MODEL` | no | Default `openai/gpt-5-mini` (gateway) or `gpt-5-mini` (direct OpenAI) |

## Scripts (from `package.json`)

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run lint` | ESLint, `--max-warnings=0` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run verify:brands` | Manufacturer SVG coverage |
| `npm run verify:release` | lint + typecheck + brands + build |
| `npm run verify:deployment -- https://…` | HTTP checks against a deployed URL |
| `npm run cap:sync` | Sync customer Capacitor config into local `android`/`ios` |
| `npm run cap:sync:android` | Prepare customer Firebase config and sync Android |
| `npm run cap:sync:admin:android` | Prepare staff Firebase config and sync the admin Android app |
| `npm run cap:add:android` / `cap:add:ios` | Generate customer native projects (once; gitignored) |
| `npm run cap:android` / `cap:ios` | Open customer Android Studio project / Xcode |
| `npm run cap:open:admin:android` | Open the staff Android Studio project |

Use `npm run test:e2e:public` for the current public/security Playwright subset; the complete end-to-end suite is still limited. Customer mobile steps: `docs/Mobile.md`; staff APK steps: `docs/Admin-Android.md`. Live product checkpoint: `docs/CURRENT_STATE.md`.

## Conventions

- Feature work on a branch; do not use production as a playground
- Reuse `components/ui`, `lib/supabase`, and existing admin/public pages
- Schema changes: new file under `supabase/migrations/` only
- Types: extend `lib/types.ts` when tables change
- Path alias: `@/*` → project root (`tsconfig.json`)
- PWA assets: `app/manifest.ts`, `public/sw.js`, `public/icons/`; do not cache admin or auth in the service worker
- Web Push: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in app env; private VAPID key only as Edge Function secret (local `.env.local` may hold `VAPID_PRIVATE_KEY` as a copy for `supabase secrets set` — never commit). Staff test path: `/admin/subscribers`.
- Capacitor: `capacitor.config.ts` + `native/www`; do not commit generated `android/` or `ios/` (see `docs/Mobile.md`)
- One-off inventory scripts (ops only, service role locally — never commit keys): `scripts/import-japan-stock-vehicles.mjs`, `scripts/import-whatsapp-parts.mjs`, `scripts/import-whatsapp-parts-dubai.mjs`, `scripts/import-whatsapp-parts-keys.mjs`, `scripts/import-dubai-whatsapp-sep20-stock.mjs`. Do not commit `_import_*` extracts, `.tmp-*`, or huge `scripts/tmp/` image dumps; small JSON reports optional.

## Next.js 16 notes

Admin gating lives in `proxy.ts` (`export async function proxy`), not `middleware.ts`. Do not rename it back without checking the Next.js 16 proxy contract.

## Linked project

Local `.env.local` must point at an environment that is safe to query. The production Supabase project is `ydrnilquojvalhgifest`. Do not reset it.


## Catalog and freight development notes

Vehicle public pricing is derived from FOB when present, with the legacy `price` field as compatibility fallback; do not treat C&F or CIF as the base listing price. Bulk price writes use `bulk_update_vehicle_prices`. Freight calculation uses saved `vehicle_model_specs.volume_m3` or manual dimensions in metres. RoRo rates are per M³; 40-ft rates are total container prices. Keep `docs/Catalog-Freight-Pricing.md`, the user manual, database/API references, and README aligned when these workflows change.

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
| `npm run cap:sync` | Sync Capacitor config into local `android`/`ios` |
| `npm run cap:add:android` / `cap:add:ios` | Generate native projects (once; gitignored) |
| `npm run cap:android` / `cap:ios` | Open Android Studio / Xcode |

There is no `test` script. Native mobile steps: `docs/Mobile.md`. Live product checkpoint: `docs/CURRENT_STATE.md`.

## Conventions

- Feature work on a branch; do not use production as a playground
- Reuse `components/ui`, `lib/supabase`, and existing admin/public pages
- Schema changes: new file under `supabase/migrations/` only
- Types: extend `lib/types.ts` when tables change
- Path alias: `@/*` → project root (`tsconfig.json`)
- PWA assets: `app/manifest.ts`, `public/sw.js`, `public/icons/`; do not cache admin or auth in the service worker
- Web Push: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in app env; private VAPID key only as Edge Function secret
- Capacitor: `capacitor.config.ts` + `native/www`; do not commit generated `android/` or `ios/` (see `docs/Mobile.md`)
- One-off inventory scripts (ops only, service role locally — never commit keys): `scripts/import-japan-stock-vehicles.mjs`, `scripts/import-whatsapp-parts.mjs`, `scripts/import-whatsapp-parts-dubai.mjs`, `scripts/import-whatsapp-parts-keys.mjs`

## Next.js 16 notes

Admin gating lives in `proxy.ts` (`export async function proxy`), not `middleware.ts`. Do not rename it back without checking the Next.js 16 proxy contract.

## Linked project

Local `.env.local` must point at an environment that is safe to query. The production Supabase project is `ydrnilquojvalhgifest`. Do not reset it.

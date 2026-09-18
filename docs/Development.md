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

There is no `test` script.

## Conventions

- Feature work on a branch; do not use production as a playground
- Reuse `components/ui`, `lib/supabase`, and existing admin/public pages
- Schema changes: new file under `supabase/migrations/` only
- Types: extend `lib/types.ts` when tables change
- Path alias: `@/*` → project root (`tsconfig.json`)

## Next.js 16 notes

Admin gating lives in `proxy.ts` (`export async function proxy`), not `middleware.ts`. Do not rename it back without checking the Next.js 16 proxy contract.

## Linked project

Local `.env.local` must point at an environment that is safe to query. The production Supabase project is `ydrnilquojvalhgifest`. Do not reset it.

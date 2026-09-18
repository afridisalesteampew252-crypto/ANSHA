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

## Rollback

Vercel instant rollback to a previous production deployment is the application rollback. Database is **not** rolled back by a Vercel revert. Forward-fix with a new migration if schema already applied.

## Backups

Supabase project backups are an infrastructure concern, not an in-repo script. Do not treat `supabase db reset` as a recovery tool on production.

## Leftovers

- Inactive Supabase project `kmngigxpqhiilcavmcmm` is already `INACTIVE` (cannot pause again). Permanent delete is a dashboard action if still required.

## Edge Functions

`admin-create-user` and `admin-update-user` deploy with the Supabase project, not with the Next.js Vercel build. Shared CORS lives in `supabase/functions/_shared/cors.ts`. Deploy both functions together so they keep the same origin allowlist and anon-key caller verification.

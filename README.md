# ANSHA

ANSHA is a global automotive parts and vehicle catalog with a public website and a protected internal management dashboard.

## Technology

- Next.js 16, React 19, TypeScript, and Tailwind CSS
- Supabase Database, Auth, and Storage
- Vercel hosting
- GitHub source control and CI

## Project status

| Phase | Scope | Status |
|---|---|---|
| 1 | Supabase authorization and storage hardening | Complete |
| 2 | Server-side admin authentication and route protection | Complete |
| 3 | Next.js modernization, Vercel cleanup, CI, and quality gates | Complete |
| 4 | Global SEO and exporter schema for parts and vehicles | Complete |
| 5 | Admin customers/users, Excel imports, and ZIP image matching | Next |
| 6 | Vercel environments, deployments, domains, and runtime validation | In progress |
| 7 | Final testing, performance, SEO validation, backups, and launch | Planned |

## Phase 1 completion

Completed on 2026-09-15.

- Hardened database and Storage authorization around `admin_profiles`.
- Limited public inventory access to published records.
- Applied and verified migration `20260915203819_phase_1_security_authorization_hardening`.

Manual security action still required: enable leaked-password protection in Supabase Auth settings.

## Phase 2 completion

Completed on 2026-09-15.

- Added cookie-based browser and server Supabase clients with `@supabase/ssr`.
- Protected admin routes with verified claims and `admin_profiles` membership.
- Preserved refreshed session cookies and cache headers across redirects.
- No database migration was required.

## Phase 3 completion

Completed on 2026-09-15.

- Upgraded incrementally through Next.js 14 and 15 to Next.js 16.3.5 and React 19.3.0.
- Migrated asynchronous route parameters and renamed Next.js middleware to `proxy.ts`.
- Added a Suspense boundary for the parts catalog search-parameter route.
- Removed the Netlify build plugin and obsolete Next.js lint bypass.
- Added ESLint flat configuration, TypeScript validation, and GitHub Actions CI.
- Configured Vercel to use the lockfile with legacy peer-dependency resolution for React 19 compatibility with the existing UI component set.
- Added a checked-in environment-variable template and Node.js 20.9+ requirement.
- Passed lint, typecheck, and production build validation across all application routes.
- No database migration was required.

## Vercel status

The Vercel project is connected. Production is healthy, but the latest preview deployment failed because Preview does not contain `NEXT_PUBLIC_SUPABASE_URL` and a Supabase publishable/anon key. Add the variables to Preview, Production, and Development before Phase 6 validation.

## Environment variables

Copy `.env.example` to `.env.local`. Never commit real credentials.

Only public/publishable Supabase keys belong in browser variables. Never expose a Supabase secret or service-role key through a `NEXT_PUBLIC_` variable.

## Database migrations

Database changes belong under `supabase/migrations/`. They must be tested transactionally, applied to the linked Supabase project, verified with read-only queries, and committed with the phase documentation.

Latest migration: `supabase/migrations/20260915214041_phase_4_global_seo_exporter_schema.sql`.

## Phase 4: global SEO and exporter schema

Completed on 2026-09-15.

- Set `https://www.anshatrading.com` as the canonical production origin.
- Added Organization and WebSite search structured data across the site.
- Added Schema.org Product markup to part pages and Vehicle/Product markup to vehicle pages.
- Expanded the XML sitemap with published parts, vehicles, categories, and blog posts.
- Added searchable SEO metadata, manufacturer/interchange/supersession numbers, export markets, destination markets, and shipping methods.
- Added unique chassis-number and stock-number indexes for reliable import and image matching.
- Added trigram and array indexes for OEM, part-number, make, model, chassis-code, compatibility, and keyword searches.
- Applied and verified migration `20260915214041_phase_4_global_seo_exporter_schema` on the linked Supabase project.
- Passed ESLint, TypeScript, and the complete Next.js production build.

Post-migration advisors reported no new Phase 4 security defect. Existing follow-up items are the intentionally callable `is_admin()` authorization helper, leaked-password protection in Auth settings, one missing blog author foreign-key index, and RLS policy performance consolidation.

## Phase 5: admin and bulk catalog workflows

- Add and manage customers from the admin dashboard.
- Invite and manage approved admin users without exposing service-role credentials to the browser.
- Import parts and vehicles from validated Excel templates with preview, error reporting, and idempotent upserts.
- Upload vehicle-image ZIP files matched by chassis number.
- Upload part-image ZIP files matched by part number.
- Record import jobs, unmatched files, duplicates, and row-level failures for safe retry and audit.

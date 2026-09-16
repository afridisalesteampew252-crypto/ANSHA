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
| 4B | Premium responsive homepage, logo, brand directory, and UX fixes | Complete |
| 5 | Admin customers/users, Excel imports, and ZIP image matching | Complete |
| 6 | Vercel environments, deployments, domains, and runtime validation | Complete |
| 7 | Final testing, performance, SEO validation, backups, and launch | Next |

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

The Vercel project is connected, and Production and Preview deployments are healthy. Browser-safe Supabase public configuration is available during Vercel builds; secret and service-role keys remain server-only. Phase 6 validated domain coverage, deployment behavior, runtime health, and Supabase connectivity end to end.

## Environment variables

Copy `.env.example` to `.env.local`. Never commit real credentials.

Only public/publishable Supabase keys belong in browser variables. Never expose a Supabase secret or service-role key through a `NEXT_PUBLIC_` variable.

## Database migrations

Database changes belong under `supabase/migrations/`. They must be tested transactionally, applied to the linked Supabase project, verified with read-only queries, and committed with the phase documentation.

Latest migration: `supabase/migrations/20260916082738_phase_5_admin_bulk_workflows.sql`.

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

## Phase 4B: premium homepage and brand experience

Completed on 2026-09-15.

- Integrated the supplied ANSHA Trading Co. LLC-FZ logo into the responsive header.
- Repositioned the homepage around global vehicle and all-brand automotive-parts exports.
- Added clear vehicle and parts calls to action and improved high-intent search messaging.
- Added a responsive directory for all 55 currently supported manufacturers across seven regions.
- Fixed manufacturer aliases so multi-word brand names resolve to the correct logo asset.
- Replaced full-page browser navigation with Next.js client routing in homepage and header search.
- Preserved lightweight responsive layouts and lazy-loaded non-critical manufacturer artwork.
- Re-ran lint, TypeScript, lockfile installation, and the full production build successfully.

## Phase 5: admin and bulk catalog workflows

Completed on 2026-09-16.

- Added protected customer creation, search, listing, and deletion in the admin dashboard.
- Added secure administrator-created Supabase users with passwords through the JWT-protected `admin-create-user` Edge Function.
- Added Parts and Vehicles Excel `.xlsx` preview and import with required-field validation and idempotent updates.
- Added vehicle-image ZIP uploads matched by normalized chassis number.
- Added part-image ZIP uploads matched by normalized part number.
- Added `import_jobs` and `import_rows` audit records with success/failure totals and row-level error messages.
- Added admin-only RLS policies for customers and import audit data.
- Applied and verified migration `20260916082738_phase_5_admin_bulk_workflows` and deployed Edge Function version 1.
- Added pinned `read-excel-file` and `fflate` dependencies and updated the lockfile.

## Phase 6: Vercel operations and runtime validation

Completed on 2026-09-16.

- Verified the connected Vercel project, GitHub deployment integration, and healthy Production and Preview builds.
- Verified the canonical `www.anshatrading.com` domain and attached alternate domains.
- Added permanent redirects from `anshatrading.com`, `anshatradingco.com`, and `www.anshatradingco.com` to the canonical domain.
- Added site-wide content-type, framing, referrer, and browser-permission security headers.
- Added no-store and no-index headers for protected admin routes.
- Added `/api/health` to validate build configuration and live Supabase REST connectivity without exposing credentials.
- Added `npm run verify:deployment -- <https-url>` to check public routes, SEO files, health, security headers, and unauthenticated admin protection.
- Confirmed no Vercel runtime errors during the audit window.
- No database migration was required because this phase changes deployment and runtime configuration only.

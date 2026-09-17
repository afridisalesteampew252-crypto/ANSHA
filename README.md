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
| 7 | Final testing, performance, SEO validation, backups, and launch | In progress |
| 9A | Admin operations shell, account menu, access visibility, and quick actions | Complete |
| 9B | Secure internal chat, file sharing, groups, and internal mail | Complete |
| 9C | Automatic catalog image optimization for direct and ZIP uploads | Complete |
| 10 | Internal communications UI and self-service profiles | Complete |
| 11 | Responsive operations, reliable user creation, imports, and invoicing | Complete |
| 12 | Canonical domain migration and official banking page | In progress |

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

Latest migration: `supabase/migrations/20260916154500_phase_9_internal_communications_indexes.sql`.

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
- Replaced free-text part brands with the shared supported-manufacturer dropdown on create and edit screens.
- Connected homepage brand cards and catalog filtering directly to each published part's saved brand.
- Added editable customer and staff profiles, including names, contact details, roles, account email, optional password changes, and profile pictures.
- Added private profile-image storage with administrator-only signed reads, uploads, replacements, and deletions.
- Added confirmed part deletion with associated Storage image cleanup.
- Applied migration `20260916091902_phase_6_admin_profile_management` and deployed the administrator user-update function.

## Phase 7: final launch validation

In progress from 2026-09-16.

- Restored local SVG assets for all 55 supported manufacturers plus an accessible default automotive mark.
- Added genuine manufacturer artwork for all supported brands from the curated MIT-licensed automotive logo dataset, with the current Hino mark sourced from Wikimedia Commons.
- Added `npm run verify:brands` to fail CI/release checks when a mapped logo is missing, empty, malformed, or lacks an accessible name.
- Added `npm run verify:release` to run lint, TypeScript, brand-asset coverage, and the complete production build as one release gate.
- Fixed administrator user creation and editing by separating caller JWT validation from service-role Auth administration in both Edge Functions.
- Deployed `admin-create-user` version 3 and `admin-update-user` version 2; avatar creation now proceeds after successful user creation.
- Redesigned the public part gallery with uncropped product imagery, touch-friendly controls, scrolling thumbnails, an accessible full-screen viewer, and image-count badges on catalog cards.
- Redesigned the admin part photo manager with multi-image upload progress, responsive previews, persistent cover controls, deletion feedback, and automatic cover reassignment.
- Added persistent light/dark mode with system-theme support and public/admin header toggles, while replacing hard-coded light header surfaces with theme-aware tokens.
- Confirmed no Vercel runtime errors during the audit window.
- No database migration was required for these UI changes because they use the existing part-photo schema and storage bucket.

## Phase 8: theme and gallery consistency

In progress from 2026-09-16.

- Extended dark-mode-safe surfaces across homepage brand cards, trust content, process cards, request forms, featured articles, and admin blog screens.
- Brought the public vehicle gallery to feature parity with the parts gallery: uncropped media, keyboard and touch controls, scrolling thumbnails, and a full-screen thumbnail rail.
- Added the optimized Ansha global vehicles-and-parts campaign artwork as the footer background, with a dark readability overlay and theme-independent white footer content.
- Removed the extra remote hero photograph to reduce competing downloads and keep the branded artwork local and performance-friendly.
- Confirmed the production deployment for Phase 7B is ready and the Vercel runtime error scan is clean.
- No database migration is required because this phase changes presentation and interaction behavior only.

## Phase 9A: admin operations shell

Completed on 2026-09-16.

- Replaced the generic admin mark with the real ANSHA Trading logo across desktop and mobile navigation.
- Added a signed-in account menu with private avatar preview, name, email, role, access summary, profile link, website shortcut, and sign-out action.
- Added a dedicated profile overview page for the current user.
- Added a desktop workspace header with contextual page titles, quick creation/import actions, website preview, and dark-mode control.
- Kept dark mode and account access available on mobile and desktop layouts.
- No database migration is required because this phase uses the existing `admin_profiles` table and private `profile-images` bucket.

Phase 9B will add persisted direct/group conversations, protected document and image sharing, read state, and internal inbox/sent-mail workflows with Supabase RLS.

## Phase 9B: internal communications

Backend foundation applied on 2026-09-16; interface work is in progress.

- Added persisted direct and group conversations, participants, messages, replies, attachment metadata, and per-user read state.
- Added internal mail, To/CC/BCC recipients, inbox read/archive state, sent-mail ownership, and mail attachment metadata.
- Added a private `internal-files` Storage bucket with a 25 MB file limit and conversation/mail-aware access policies.
- Enabled Realtime delivery for chat messages while retaining table-level RLS filtering.
- Restricted all communication tables to authenticated ANSHA workspace users with membership- and recipient-aware policies.
- Added covering indexes for conversation, message, sender, recipient, reply, and attachment relationships.
- Applied migrations `20260916154000_phase_9_internal_communications` and `20260916154500_phase_9_internal_communications_indexes` to the linked Supabase project.

## Phase 9C: catalog image optimization

Completed on 2026-09-16.

- Added automatic in-browser resizing for all new part and vehicle images, including ZIP image imports.
- Constrained the longest image edge to 1,920 pixels and converted uploads to WebP at a balanced quality setting.
- Added descriptive, normalized image filenames built from part or vehicle identifiers.
- Added one-year immutable Storage cache metadata for faster repeat visits and lower transfer overhead.
- Kept original aspect ratios and high-quality resampling while reducing oversized uploads before network transfer.
- No database migration is required because the existing photo records and Storage buckets continue to store the optimized asset paths.


## Phase 10 — Internal communications UI and self-service profiles

- Added production-ready direct and group Chat screens with realtime delivery, replies, edits, soft deletion, read state, unread counts, and private 25 MB attachments.
- Added Internal Mail with Inbox, Sent, Archive, search, To/CC/BCC, read/unread controls, replies, and private attachments.
- Added Chat and Internal Mail navigation to the admin operations workspace.
- Added secure self-service profile name, optimized private avatar, and password updates.
- Added transaction-safe database functions for conversation creation and internal mail sending.
- Consolidated profile RLS policies and added missing foreign-key indexes.
- Applied Supabase migrations `phase_10_communications_ui_support` and `phase_10_policy_and_index_cleanup`.


## Phase 11 — Responsive operations and invoicing

- Optimized public and admin layouts for phones, tablets, laptops, and wide desktop screens.
- Replaced boxed JPEG branding with the supplied transparent ANSHA logo, enlarged in the public header, admin shell, footer, and invoices.
- Set light mode as the default while preserving the saved light/dark/system selector.
- Added a persistent collapsible desktop admin sidebar and a closable mobile drawer.
- Updated the company address to Meydan Grandstand, 6th Floor, Meydan Road, Nad Al Sheba, Dubai, U.A.E.
- Added validated Parts and Vehicles Excel templates with required-field highlighting, dropdowns, and embedded image ZIP guidance.
- Corrected Excel TRUE/FALSE parsing so FALSE values no longer import as enabled.
- Added secure tax invoices with sequential invoice numbers, customer and seller tax snapshots, per-line VAT and discounts, payment tracking, outstanding balances, print/PDF output, structured JSON export, and provider submission fields.
- Added a clear UAE eInvoice compliance boundary: PDF invoices remain printable records; tax-authority reporting requires a connected UAE accredited service provider.
- Applied Supabase migrations `phase_11_invoicing_and_operations` and `phase_11_invoice_advisor_cleanup`.
- Upgraded `admin-create-user` to version 4 with separated caller/service clients, robust CORS, direct administrator account creation, duplicate detection, and reliable profile creation.


## Phase 12 — Canonical domain and banking information

- Set `https://www.anshatradingco.com` as the canonical production origin across metadata, structured data, robots, sitemap, and generated public URLs.
- Reversed legacy-domain redirects so `anshatrading.com`, `www.anshatrading.com`, and `anshatradingco.com` permanently redirect to `www.anshatradingco.com`.
- Added a responsive official Banking Information page for the Wio AED account and Citi USD intermediary details.
- Added one-click copy controls, payment-reference guidance, and an official WhatsApp verification action.
- Kept the banking page out of search indexes while making it directly accessible from the public footer.
- No database migration is required.

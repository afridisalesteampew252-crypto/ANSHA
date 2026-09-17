# ANSHA System Audit

Audit date: 2026-09-18.

Scope: repository `ANSHA/` plus read-only inspection of the linked Supabase project. No application code, schema, or production configuration was changed for this audit.

Legend:

- **Fact** — verified in code, migrations, or live project metadata
- **Potential issue** — observed risk, not proven exploitation
- **Recommendation** — future work; not implemented in this pass

---

## 1. Technology Stack

**Fact**

- Next.js 16.3.5 App Router
- React 19.3.0 / React DOM 19.3.0
- TypeScript 5.2.2 (`strict: true`)
- Node.js `>=20.9.0` (CI uses Node 24)
- Tailwind CSS 3.3.3, PostCSS, Autoprefixer
- Radix UI primitives + shadcn-style `components/ui`
- lucide-react, class-variance-authority, tailwind-merge
- `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.116.0
- react-hook-form, zod, date-fns, recharts, sonner, next-themes
- read-excel-file, fflate (bulk Excel/ZIP imports)
- `@vercel/analytics`, `@vercel/speed-insights`
- npm with `package-lock.json`; Vercel install: `npm ci --legacy-peer-deps`
- ESLint 9 + `eslint-config-next` 16.3.5
- No Pages Router
- No `"use server"` Server Actions
- No Vitest/Jest/Playwright test files
- No PWA manifest, service worker, or Capacitor config

**Fact — live backend**

- Active Supabase project name `ANSHA`, ref `ydrnilquojvalhgifest`, region `ap-southeast-2`, Postgres 17, status `ACTIVE_HEALTHY`
- Inactive leftover project name `anshatrading`, ref `kmngigxpqhiilcavmcmm`, status `INACTIVE`

---

## 2. Application Structure

**Fact**

Application root is `ANSHA/` (workspace parent `H:\ansha2`).

| Area | Location |
|---|---|
| Public App Router routes | `app/(public)/` |
| Admin login | `app/admin/page.tsx` |
| Admin workspace | `app/admin/(panel)/` |
| Admin route protection | `proxy.ts` (Next.js 16 proxy; matcher `/admin/:path*`) |
| Health API | `app/api/health/route.ts` |
| Supabase browser client | `lib/supabase/client.ts` |
| Supabase server client | `lib/supabase/server.ts` |
| Domain types | `lib/types.ts` |
| Site constants | `lib/site-config.ts` |
| Stock origin/status helpers | `lib/stock.ts` |
| Catalog image compression | `lib/catalog-image.ts` |
| Public UI | `components/public/` |
| Admin UI | `components/admin/` |
| Shared UI kit | `components/ui/` |
| Migrations | `supabase/migrations/` |
| Edge Functions | `supabase/functions/admin-create-user`, `admin-update-user` |
| Scripts | `scripts/verify-deployment.mjs`, `scripts/verify-brand-assets.mjs` |
| Brand assets | `public/brands/` |
| CI | `.github/workflows/ci.yml` |

Most public catalog pages and almost all admin pages are Client Components that query PostgREST from the browser. Server Components exist for layouts, metadata, sitemap/robots, and invoice verification.

---

## 3. Public Website

**Fact**

Canonical origin is `https://www.anshatradingco.com` (`lib/site-config.ts`).

`next.config.js` 308-redirects hosts `anshatrading.com`, `www.anshatrading.com`, and `anshatradingco.com` to `https://www.anshatradingco.com/:path*`.

Public routes:

- `/` homepage (client catalog fetch, brand directory, part request form)
- `/parts`, `/parts/[slug]`
- `/vehicles`, `/vehicles/[slug]`
- `/categories`, `/categories/[slug]`
- `/about`, `/contact`, `/blog`, `/blog/[slug]`
- `/banking` (noindex banking details page)
- `/verify/invoice/[code]` (QR authenticity; noindex)
- `/sitemap.xml`, `/robots.txt` (`disallow: /admin`)

Public UX:

- Sticky header, manufacturer directory, WhatsApp `wa.me` links
- Mobile bottom nav (`components/public/mobile-bottom-nav.tsx`)
- Light/dark theme via `next-themes`
- Inquiry dialog and part-request form write to `inquiries` / `part_requests` as anon
- Schema.org Organization / WebSite / Product / Vehicle markup on relevant pages
- `next/image` is configured with `images.unoptimized: true`

There is no public customer login.

---

## 4. Admin / ERP

**Fact**

Login: `/admin`. Authenticated workspace nav (`app/admin/(panel)/layout.tsx`):

- Dashboard
- Parts (list, new, `[id]`)
- Vehicles (list, new)
- Categories
- Invoices (list, new, `[id]`, supplier archive)
- Remittances
- Inquiries
- Team Chat
- Internal Mail
- Blog (list, new, edit)
- Customers (list + statement of account `[id]`)
- Users
- Bulk Import
- Profile

Working staff workflows in code: catalog CRUD, photo upload/optimize, Excel/ZIP import, invoicing (delivery note / quotation / proforma / tax / purchase / commercial), remittance recording and allocation, supplier invoice archive, inquiry handling, internal chat and mail, notifications, user create/update (admin role only). Public part requests write to `part_requests` and fire notifications; there is no dedicated `/admin` list page for them.

Not present as modules: auction/yard/port lifecycle, generic request tickets, suppliers as a first-class entity (only `supplier_invoices` files), customer portal, departments, dedicated audit-log UI, outbound SMTP.

---

## 5. Authentication

**Fact**

- Supabase Auth email/password (`signInWithPassword`)
- Browser and server clients use the publishable/anon key via `@supabase/ssr` cookies
- `proxy.ts` calls `auth.getClaims()`, then requires a row in `admin_profiles` for any `/admin/:path*` route except the login page
- Users without a profile are signed out / redirected with `error=unauthorized`
- Logged-in staff hitting `/admin` are redirected to `/admin/dashboard`
- Admin layout also re-checks session + profile client-side

Roles on `admin_profiles.role`: `admin` | `staff` (default `staff`).

`public.is_admin()` returns true if `auth.uid()` exists in `admin_profiles`. It does **not** mean `role = 'admin'`. Almost all RLS write policies use `is_admin()`, so staff and admin have the same catalog/finance/chat permissions. The `admin` role is enforced in Edge Functions for user create/update and in the Users UI (`canManage`).

Live: `admin_profiles` has 5 rows.

There is no customer Auth user type and no OAuth/SSO in this repository.

---

## 6. Database

**Fact — public tables created by migrations (all RLS enabled where inspected live)**

Catalog: `categories`, `parts`, `part_photos`, `part_compatibility`, `vehicles`, `vehicle_photos`, `inquiries`, `part_requests`, `blog_categories`, `blog_posts`

Staff: `admin_profiles`

CRM/import: `customers`, `import_jobs`, `import_rows`

Chat/mail: `chat_conversations`, `chat_participants`, `chat_messages`, `chat_attachments`, `internal_mail`, `internal_mail_recipients`, `internal_mail_attachments`

Finance: `invoice_company_settings`, `invoice_sequences`, `invoices`, `invoice_items`, `invoice_payments`, `remittance_sequences`, `remittances`, `remittance_documents`, `remittance_allocations`, `supplier_invoices`

Notifications: `admin_notifications`

Vehicle/part stock fields (Phase 15): `stock_origin` in `japan|dubai|singapore|china|thailand|taiwan`; `stock_status` in `available|reserved|sold`; `sold_at`, `sold_by`.

Invoice `document_type`: `delivery_note`, `tax_invoice`, `proforma_invoice`, `quotation`, `purchase_invoice`, `commercial_invoice`.

Invoice `status`: `draft`, `sent`, `partially_paid`, `paid`, `overdue`, `cancelled`.

Relationships (simplified):

- `parts.category_id` → `categories`
- `part_photos.part_id` → `parts`
- `part_compatibility.part_id` → `parts`
- `vehicle_photos.vehicle_id` → `vehicles`
- `inquiries.part_id` → `parts` (nullable)
- `blog_posts.category_id` → `blog_categories`; `author_id` → `admin_profiles`
- `invoices.customer_id` → `customers`; `created_by` → `admin_profiles`
- `invoice_items.invoice_id` → `invoices`; optional `part_id` / `vehicle_id`
- `invoice_payments.invoice_id` → `invoices`
- `remittances.customer_id` → `customers`; optional `invoice_id`
- `remittance_allocations` → remittance + invoice
- Chat/mail FKs → `admin_profiles`

Triggers exist for invoice totals, remittance/payment sync, sold-state stamps, and notification inserts.

Duplicate historical files: `supabase/migrations/20260909192712_001_initial_schema.sql` and `20260909194958_001_initial_schema.sql`. Latest applied migration in repo: `20260917180500_phase_17_advisor_indexes.sql`. README still names a Phase 14 file as “latest”.

`lib/types.ts` `Database` map does not include invoices, remittances, chat, notifications, or later tables.

---

## 7. Supabase

**Fact**

- Auth, Postgres, Storage, Realtime, Edge Functions are in use
- Browser clients never use a service-role key
- Service-role key is used only inside Edge Functions (`SUPABASE_SERVICE_ROLE_KEY` Deno env)
- Realtime: chat messages (Phase 10) and admin notifications (Phase 17)
- Public RPC: `verify_invoice(p_verification_code uuid)` (SECURITY DEFINER; used by `/verify/invoice/[code]`)
- Workspace RPCs exist for conversation creation, mail send, invoice/remittance mutations (Phase 10–16)
- `private` schema holds helpers/triggers; not a second business database

**Potential issue:** a second inactive Supabase project exists in the same org. Do not point the app at it.

---

## 8. API / Server Actions

**Fact**

- No Next.js Server Actions
- Next route handlers: `GET /api/health` only (config + REST `parts?select=id&limit=1`)
- Edge Functions:
  - `admin-create-user` POST — JWT + `role = admin`; creates Auth user + `admin_profiles`
  - `admin-update-user` POST — JWT + `role = admin`; updates Auth user + profile
- Public invoice verify calls `rpc('verify_invoice')` from a Server Component
- All other reads/writes go through Supabase JS + RLS

---

## 9. Internal Chat

**Fact**

Implemented. UI: `/admin/chat`. Tables as above. Features in UI/migrations: direct and group conversations, participants, replies, edits, soft delete, attachments (private `internal-files`, 25 MB), read/delivered timestamps, realtime, unread counts.

Internal mail is a separate module at `/admin/mail` (To/CC/BCC, inbox/sent/archive).

**Fact — missing vs later vision:** conversations are not attachable to vehicle, customer, inquiry, shipment, request, invoice, or task records. No department model.

---

## 10. Storage

**Fact — buckets from migrations**

| Bucket | Visibility | Used for |
|---|---|---|
| `part-images` | public | part photos |
| `vehicle-images` | public | vehicle photos |
| `blog-images` | public | blog featured images |
| `profile-images` | private | staff/customer avatars; signed URLs |
| `internal-files` | private | chat and mail attachments |
| `remittance-documents` | private | remittance evidence; short-lived signed URLs |
| `supplier-invoices` | private | supplier document archive |

New catalog uploads are resized in-browser to WebP (max edge 1920). Public image URLs are concatenated from `NEXT_PUBLIC_SUPABASE_URL` + `/storage/v1/object/public/...`.

---

## 11. Current Vehicle System

**Fact**

`vehicles` is a catalog listing: title, slug, make/model/variant/year, chassis/stock/engine, specs, price, publish/feature flags, export/search metadata (Phase 4), photos, `stock_origin`, `stock_status`.

Public listing is published inventory with stock-origin filters. Sold published records remain listable by design (Phase 15).

There is no auction, yard, port, BL, inspection, or shipment status machine. Do not treat `stock_status` as that lifecycle.

---

## 12. Current Business Workflows

**Fact — implemented**

- Public browse → WhatsApp / inquiry / part request
- Staff catalog publish
- Bulk Excel + ZIP image match (chassis / part number)
- Customer CRM + statement of account + remittance allocation
- Document generation (print/PDF-oriented invoices) + QR verify
- Remittance pending/confirmed with optional invoice link
- Supplier file archive
- Internal chat, mail, notification center
- Staff user provisioning

**Fact — not implemented**

- Export operations / RORO / containers / BL
- Yard / auction management
- Generic request tickets with assignment, due dates, activity history
- Customer self-service portal
- Outbound email provider
- WhatsApp Business API (only `wa.me` links)
- AI automation

---

## 13. Mobile Readiness

**Fact**

Public site: mobile header drawer, bottom nav, touch galleries, `pb-16` for bottom nav, Phase 13 redesign notes phone-first catalog.

Admin: collapsible desktop sidebar, mobile drawer, sticky mobile header, notification center.

**Potential issue:** admin tables/forms are denser than public pages; usable on phones but not a dedicated mobile ERP. No PWA installability, no offline cache, no native apps.

---

## 14. Security Findings

**Fact**

- RLS on business tables; public catalog limited to published rows after Phase 1
- Admin routes noindex + `Cache-Control: private, no-store`
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`
- Service-role key not referenced in Next.js app code
- `.env.example` lists names only
- Health endpoint does not return secrets

**Potential issues**

- Supabase advisor: leaked-password protection disabled (Auth setting)
- `public.is_admin()` is SECURITY DEFINER and executable by `authenticated`
- `public.verify_invoice` is SECURITY DEFINER and executable by `anon` (needed for public QR; must stay narrow)
- Edge Function CORS `Access-Control-Allow-Origin: *`
- `admin-update-user` builds the caller client with the service-role key (create-user uses anon + user JWT)
- Staff role can mutate catalog, invoices, customers, chat (by design today)
- Blog HTML rendered with `dangerouslySetInnerHTML` (stored XSS if a staff account posts script)
- Publishable URL/key are committed in `vercel.json` (browser-safe, but environment coupling)
- `netlify.toml` leftover (not evidence of live Netlify hosting)

No service-role key, database password, or `.env.local` values are documented here.

---

## 15. Performance Findings

**Fact**

- Next Image optimization disabled (`unoptimized: true`)
- Homepage and dashboard are client-side multi-query screens
- Dashboard selects all part/vehicle `stock_status` rows and up to 1000 chat messages for unread counts
- Catalog search uses PostgREST filters; trigram indexes exist but many are unused per advisor
- Vercel Speed Insights/Analytics are mounted in root layout

**Potential issues**

- Multiple permissive RLS SELECT policies on `parts`, `vehicles`, photos, compatibility, `blog_posts` for `authenticated`
- Advisor reported ~49 unused indexes (low traffic can look unused; do not drop without measurement)
- Large client bundles from Radix kit + admin charts + Excel/ZIP libraries

---

## 16. Technical Debt

**Fact**

- Duplicate `001_initial_schema` migration files
- README “latest migration” stale vs Phase 15–17
- Incomplete generated/hand-written `Database` types
- Leftover `netlify.toml`
- ESLint disables `react-hooks/exhaustive-deps` and `set-state-in-effect`
- No automated product tests
- CI omits `verify:brands`
- Dual public keys (`PUBLISHABLE_KEY` with `ANON_KEY` fallback)
- `is_admin()` name vs `role = admin` confusion

---

## 17. Potential Risks

| Risk | Class |
|---|---|
| Production data loss from destructive migrations | Database — do not DROP/RESET |
| Inactive second Supabase project confusion | Deployment |
| Thin staff/admin permission split | Authorization |
| Compromised staff account + HTML blog | XSS |
| Open CORS on user-admin functions | API |
| Client-side RLS as the only API layer | If policies regress, browser can over-read |
| Force-push / commit to `main` without preview | Process (current default branch is `main`) |
| Vehicle lifecycle rewrite replacing `stock_status` | Data integrity |

---

## 18. Recommended Architecture

Keep one Next.js app and one Supabase project as the business system of record.

```
Browser
  → Next.js (public site + staff ERP; later customer portal routes)
    → proxy.ts (staff session)
    → /api/* and Edge Functions (privileged Auth admin only)
    → Supabase JS (anon/publishable + RLS)
      → PostgreSQL / Storage / Auth / Realtime
```

Do not create a second database for mobile, PWA, or customer portal. Add vehicle lifecycle and request workflows as new tables/columns beside existing stock and inquiry models.

---

## 19. Recommended Development Phases

1. Documentation and branch hygiene (this delivery)
2. Safety: leaked-password protection, Edge Function caller-client/CORS review, RBAC review
3. Housekeeping: types, README accuracy, leftover Netlify file (approval to delete)
4. Additive vehicle operational lifecycle (preserve `available/reserved/sold`)
5. Request/ticket module reusing `inquiries` / `part_requests`
6. Chat entity linking
7. Customer portal on the same database
8. Responsive hardening → PWA → later Capacitor if required

Stop after this documentation pass until a module is chosen.

---

## 20. Files You Inspected

Representative set (not every SVG):

- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.js`, `vercel.json`, `proxy.ts`, `eslint.config.mjs`, `.env.example`, `netlify.toml`, `README.md`
- `.github/workflows/ci.yml`, `.git/config`
- `app/layout.tsx`, `app/robots.ts`, `app/sitemap.ts`, `app/api/health/route.ts`
- `app/(public)/**`, `app/admin/**`
- `lib/supabase/*`, `lib/types.ts`, `lib/site-config.ts`, `lib/stock.ts`, `lib/catalog-image.ts`
- `components/public/*`, `components/admin/*`, `components/invoices/*`
- `supabase/migrations/*.sql`
- `supabase/functions/admin-create-user/index.ts`, `admin-update-user/index.ts`
- `docs/phase-13-public-redesign.md`

Live read-only: Supabase `list_projects`, `list_tables` (public, verbose), `get_advisors` security and performance.

---

## 21. Files You Created/Changed

Created under `docs/` in this documentation pass (see companion files). Existing `docs/phase-13-public-redesign.md` retained. Application source, migrations, and production env were not modified except optional `.env.example` comments if present.

---

## 22. Commands/Test Results

Not run during the read-only audit. After documentation write: `npm run lint` and `npm run typecheck` from `ANSHA/` if the environment allows. `npm run build` and `npm run dev` were not required for docs. Database was not migrated or reset.

---

## 23. Things Requiring My Approval

- Enable leaked-password protection in Supabase Auth
- Archive/delete inactive project `kmngigxpqhiilcavmcmm`
- Move publishable keys out of `vercel.json` into Vercel env only
- Tighten staff RLS so staff ≠ full ERP write
- Vehicle lifecycle schema
- Delete `netlify.toml` or duplicate initial migrations
- Replace browser PostgREST access with a server API
- Any DROP TABLE, production env change, domain change, or auth replacement

# ANSHA System Audit

Audit date: **2026-09-20** (refresh). Earlier 2026-09-19 snapshot is superseded.

Scope: repository `ANSHA/` vs live product at `www.anshatradingco.com` + Supabase `ydrnilquojvalhgifest`. Documentation-only pass; no production secrets were read.

Legend: **Fact** | **Gap** | **Recommendation**

---

## 1. Technology stack

**Fact**

- Next.js 16 App Router (`proxy.ts` for admin/portal guards)
- React 19, TypeScript strict, Tailwind 3, Radix/shadcn-style UI
- Supabase Auth / Postgres / Storage / Edge Functions / Realtime
- Vercel hosting + Analytics/Speed Insights
- Optional Capacitor shell (`capacitor.config.ts`) loading the live public URL
- PWA: `app/manifest.ts`, `public/sw.js`, install + push components
- AI: Vercel AI SDK route `POST /api/ai/chat`
- FX proxy: `GET /api/fx` (cached open.er-api.com)
- Home featured rotation: `lib/featured-rotation.ts` (10-minute buckets; no cron)
- CI: lint, typecheck, `verify:brands`, build (Node 24)
- **Gap:** no Vitest/Jest/Playwright suite in repo

---

## 2. Application structure

| Area | Location |
|---|---|
| Public routes | `app/(public)/` |
| Admin panel | `app/admin/(panel)/` |
| Portal | `app/portal/` |
| API | `app/api/{health,fx,ai/chat,cron/request-dues}` |
| Domain libs | `lib/` (`types`, `site-offers`, `export-markets`, `fx`, `featured-rotation`, `vehicle-photos`, …) |
| Hooks | `hooks/` (`use-inventory-deals`, `use-fx-rates`, `use-live-clock`, …) |
| Migrations | `supabase/migrations/` (through Phase **65**) |
| Edge Functions | `supabase/functions/*` |
| One-off import scripts | `scripts/import-japan-stock-vehicles.mjs`, `scripts/import-whatsapp-parts*.mjs`, `scripts/import-dubai-whatsapp-sep20-stock.mjs` |

Most catalog/ERP pages are Client Components talking to PostgREST with the anon/authenticated JWT. RLS is the authorization backstop.

---

## 3. Public website

**Fact — routes**

`/`, `/parts`, `/parts/[slug]`, `/vehicles`, `/vehicles/[slug]`, `/machinery`, `/categories`, `/categories/[slug]`, `/about`, `/contact`, `/blog`, `/blog/[slug]`, `/reviews`, `/offers`, `/markets/[code]`, `/cart`, `/favorites`, `/banking`, `/cookie-policy`, `/offline`, `/verify/invoice/[code]`

**Fact — product UX (recent)**

- Deals in feature strip, mobile drawer, bottom nav, home featured strip
- Home featured: 8 parts / 4 vehicles, 10-minute time-bucketed rotation (`lib/featured-rotation.ts`)
- Inventory-linked deal % / sale price on cards + detail pages
- Export markets strip (PNG flags) → market policy pages
- Inquiry cart + heart favorites (localStorage)
- Dubai clock + AED FX strip (desktop dedicated; mobile compact)
- Colour system: ink/red surfaces (not flat white-only)
- PWA display name **Anshatradingco APP** + Install CTAs
- Auction-sheet vehicle photos excluded from public gallery (RLS + `lib/vehicle-photos.ts`)
- Heavy machinery & trucks browse at `/machinery` (`vehicle_class`)
- Tawk.to public chat widget when `NEXT_PUBLIC_TAWK_*` set; Phase 58 webhook Needs attention on `/admin/live-chat`
- Team Chat presence (Phase 60): online green dots + `last_seen_at` via `AdminPresenceProvider`
- Blog SEO metadata + Article JSON-LD; home testimonials + `/reviews` page
- GSC `verification.google`; `/favicon.ico` + default OG `/images/og-default.jpg`

**Gap**

- Push delivery depends on correctly set Edge VAPID secrets (often mis-set)
- No separate email newsletter subscription table

---

## 4. Admin / ERP

**Fact — nav areas (role-gated in layout + `proxy.ts`)**

Overview: dashboard, analytics, AI, audit-log (admin)  
Catalog: parts, vehicles, Machinery & trucks filter, categories, imports, suppliers  
Purchase/stock: purchase-orders, inventory/receive, **stock**, **parts/stock**, **stock/arrival-watch**, reservations, **auction-stock**  
Sales/finance: customers, invoices, remittances, bank-accounts, expenses, ledger, reports, vat-return  
Logistics: export-shipments, landed-cost  
Inbox: inquiries, **live-chat (admin+manager only)**, requests, chat, mail, email, whatsapp  
Marketing: blog, offers, campaigns, **subscribers**, **trade-config**, **configuration** (export masters)  
HR: `/admin/hr*` (ops manage; manager view)  
Team: payroll, users, profile

**Fact — admin chrome**

Live Pakistan + Dubai clocks and compact AED FX in the admin header. Responsive shell (`admin-shell` / `admin-table-scroll`); shared `NativeSelect` on Configuration / Reserve / Receive forms.

**Fact — vehicles / invoices / stock (Phases 54–65)**

- Auction sheet badge; clickable tag → lightbox of `is_auction_sheet` images
- `vehicle_class` / equipment category / operating hours; public `/machinery`
- Field agents: draft proforma only; accounts/ops approve sent
- A4 print: denser layout; verification code on face with QR
- Tawk Live chat: **admin + manager only**; Phase 58 webhook Needs attention
- Team Chat presence (Phase 60)
- Stock ops dual status + Arrival Watch (62); parts stock parity (63)
- Invoice unallocate-then-delete restores stock (64)
- Owned vs auction `stock_pool` (65)

**Gap**

- Bank feeds are CSV/manual stub only
- Campaigns are MVP (not full ESP)
- AI is grounded ops chat, not autonomous agents
- Manager HR is not location-scoped (v1)

---

## 5. Auth & roles

**Fact**

- Staff: Supabase email/password + `admin_profiles`
- Roles: `admin` | `staff` | `sales` | `freelancer` | `manager` | `accounts`
- Account-admin gates via `private.is_account_admin()` for sensitive RPCs/routes
- Ops gates via `private.is_ops_user()` (admin|staff)
- Field agents via `private.is_field_agent()` (sales|freelancer)
- Receivables via `private.can_manage_receivables()` (admin|staff|accounts)
- HR viewers via `private.is_hr_viewer()` (admin|staff|manager)
- Portal: `customer_profiles` separate from staff

See [Roles](./Roles.md).

**Recommendation**

Enable Supabase leaked-password protection (dashboard).

---

## 6. Database & migrations

**Fact**

- Additive migrations Phase 1 → **65** under `supabase/migrations/`
- Phase 53: payroll delete RPCs (account-admin)
- Phase 54: field agents / HR / catalog audit
- Phase 55: accounts role + draft proforma RBAC
- Phase 56: `vehicle_photos.is_auction_sheet`
- Phase 57: `vehicles.vehicle_class` / `equipment_category` / `operating_hours`
- Phase 58: Tawk webhook mirror tables
- Phase 60: Team Chat `last_seen_at` presence
- Phase 61/61b: export docs + Incoterms + reservation/invoice terms
- Phase 62–63: stock ops, export masters (+ seed), parts reserve/RLS, `export_shipment_parts`
- Phase 64: invoice unallocate-delete + stock restore RPCs
- Phase 65: `vehicles.stock_pool` owned vs auction
- Stock master remains `vehicles` / `parts` (no second catalog)

See [Database](./Database.md) for schema detail.

---

## 7. Edge Functions & secrets

| Function | Purpose |
|---|---|
| `admin-create-user` / `admin-update-user` | Staff user admin (roles include freelancer / manager / accounts) |
| `portal-create-access` | Enable customer portal login |
| `send-web-push` | Deno Web Push (`@negrel/webpush`) |
| `send-outbound-email` | Resend |
| `send-whatsapp` | Meta Cloud API |
| `remind-request-dues` | Request due reminders |
| `tawk-webhook` | Phase 58 Tawk → Needs attention (deploy `--no-verify-jwt`) |

**Gap — operational**

- `send-web-push` returns 500 when `VAPID_*` secrets are not valid URL-safe base64
- Resend / WhatsApp / AI keys are optional until configured

---

## 8. Security posture

**Fact**

- Admin/portal noindex + no-store headers
- SW never caches admin/api/portal
- Service role only on Edge / server routes / one-off import scripts, not `NEXT_PUBLIC_*`
- CORS on admin Edge functions origin-allowlisted
- Public vehicle photo policy excludes `is_auction_sheet = true`

**Recommendation**

Keep VAPID private key only in Supabase secrets; rotate if ever pasted into chat/logs.

---

## 9. Completion vs roadmap

See [CURRENT_STATE](./CURRENT_STATE.md) for the live % snapshot and [Roadmap](./Roadmap.md) for phase history.

Roughly **88–92%** of the chosen ERP + public + platform MVP is shipped. Remaining: secrets hygiene, bank live integration, deeper marketing automation, automated tests, manager location scope, native admin (explicitly out of scope).

---

## 10. Doc freshness

| Doc | Status after this audit |
|---|---|
| CURRENT_STATE.md | Checkpoint 2026-09-20 / Japan Aug ZIPs + Dubai WA Sep 20 / Phases 53–57 |
| Modules.md | Updated |
| Roadmap.md | Phases 53–57 + Japan/Dubai inventory batches + open later-platform list |
| Roles.md | Field / accounts / manager (already current) |
| User-Manual.md | Roles + HR + auction sheets + field/accounts flows |
| PWA.md | Prior VAPID guidance still valid |
| Deployment.md | Prior VAPID warning still valid |
| Architecture.md | Surfaces through Phase 56 |
| Database.md | Phase 53–56 entities |
| Security.md | Role helpers + auction-sheet RLS |
| Development.md | Import scripts note |
| API.md | Prior surface still accurate |
| README.md | Status table through Phase 56 |
| PROJECT-AUDIT.md | This file |

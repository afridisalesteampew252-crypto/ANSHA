# ANSHA System Audit

Documentation and performance verification: **2026-09-29**. This refresh covers the current repository documentation plus live query-plan verification for vehicle and parts listings; the broader product audit below remains the 2026-09-22 snapshot. No production secrets were read.

Legend: **Fact** | **Gap** | **Recommendation**

---

## 1. Technology stack

**Fact**

- Next.js 16 App Router (`proxy.ts` for admin/portal guards)
- React 19, TypeScript strict, Tailwind 3, Radix/shadcn-style UI
- Supabase Auth / Postgres / Storage / Edge Functions / Realtime
- Vercel hosting + Analytics/Speed Insights
- Customer Capacitor Android shell (`capacitor.config.ts`) loads `/mobile`; separate staff Capacitor Android shell (`capacitor.admin.config.ts`) loads `/admin/dashboard` (`docs/Mobile.md`, `docs/Admin-Android.md`)
- PWA: `app/manifest.ts`, `public/sw.js`, install + push components
- AI: Vercel AI SDK route `POST /api/ai/chat`
- FX proxy: `GET /api/fx` (cached open.er-api.com)
- Excel exports: `lib/export-excel.ts` + ExcelJS (reports, remittances, vehicles)
- Multi-currency display: `lib/money.ts` + `components/money-breakdown.tsx` (no FX mixing)
- Product JSON-LD: `lib/product-schema.ts` (valid offers.price; real aggregateRating/review)
- Home featured rotation: `lib/featured-rotation.ts` (10-minute buckets; no cron)
- CI: lint, typecheck, `verify:brands`, build (Node 24)
- Playwright is configured with partial E2E coverage; automated test breadth remains limited
- Public vehicle/parts listings use parameter-safe composite indexes, applied in migrations `20260928221630` and `20260928222037`; generic prepared plans were verified to use the indexes

---

## 2. Application structure

| Area | Location |
|---|---|
| Public routes | `app/(public)/` |
| Admin panel | `app/admin/(panel)/` |
| Portal | `app/portal/` |
| API | `app/api/{health,fx,ai/chat,cron/request-dues}` |
| Domain libs | `lib/` (`types`, `money`, `product-schema`, `export-excel`, `reports/*`, `stock-linked-invoice`, `freight-charges`, …) |
| Components | `components/` (incl. `money-breakdown.tsx`) |
| Hooks | `hooks/` (`use-inventory-deals`, `use-fx-rates`, `use-live-clock`, …) |
| Migrations | `supabase/migrations/` (through Phase **78** + post-78 DEFINER/security) |
| Edge Functions | `supabase/functions/*` |
| One-off import scripts | `scripts/import-japan-stock-vehicles.mjs`, `scripts/import-whatsapp-parts*.mjs`, `scripts/import-dubai-whatsapp-sep20-stock.mjs` |

Most catalog/ERP pages are Client Components talking to PostgREST with the anon/authenticated JWT. RLS is the authorization backstop.

---

## 3. Public website

**Fact — routes**

`/`, `/parts`, `/parts/[slug]`, `/vehicles`, `/vehicles/[slug]`, `/machinery`, `/categories`, `/categories/[slug]`, `/about`, `/contact`, `/blog`, `/blog/[slug]`, `/reviews`, `/offers`, `/markets/[code]`, `/cart`, `/favorites`, `/banking`, `/cookie-policy`, `/offline`, `/verify/invoice/[code]`

**Fact — product UX**

- Deals, featured rotation, inventory-linked deal pricing
- Export markets strip (70 destinations) → `/markets/[code]`
- Inquiry cart + favorites; Dubai clock + AED FX
- PWA **Anshatradingco APP**; auction sheets excluded from public gallery
- `/machinery`; Tawk widget; GSC verification + favicon/OG

**Gap**

- Push delivery depends on correctly set Edge VAPID secrets
- No separate email newsletter subscription table

---

## 4. Admin / ERP

**Fact — nav areas (role-gated in layout + `proxy.ts`)**

Overview: dashboard, analytics, AI, audit-log (admin)  
Catalog: parts, vehicles, auction-stock, categories, imports, suppliers  
Purchase/stock: purchase-orders, inventory/receive, stock, parts/stock, arrival-watch, reservations  
Sales/finance: customers, invoices, remittances, **commissions**, bank-accounts, expenses, ledger, **reports hub**, vat-return, **freight-charges**  
Logistics: export-shipments, landed-cost  
Inbox: inquiries, live-chat (admin+manager), requests, chat, mail, email, whatsapp  
Marketing: blog, offers, campaigns, subscribers, trade-config, configuration (export masters / yards / shipping companies)  
HR: `/admin/hr*`  
Team: payroll, users, profile

**Fact — recent ERP (Phases 69–78)**

- Remittances: office/shift on users; Unknown TTS auto-confirm; Allocate To Stocks; Excel/CSV export; multi-currency KPIs
- Commission claims on sold stock
- Config: `auction_yards`, `shipping_companies`, `freight_charges`
- Bulk reserve; customer auto ID (~48001+) + Actions; consignee fields
- Reports hub (7 ops + financial) + Excel; vehicles Export Excel
- Stock list invoice badges; SOA Buying clears on reservation release
- Clear reservation metadata when stock → available

**Gap**

- Bank feeds are CSV/manual stub only
- Campaigns are MVP (not full ESP)
- AI is grounded ops chat, not autonomous agents
- Manager HR is not location-scoped (inventory origins are)

---

## 5. Auth & roles

**Fact**

- Staff: Supabase email/password + `admin_profiles`
- Roles: `admin` | `staff` | `sales` | `freelancer` | `manager` | `accounts`
- Account-admin / ops / field-agent / receivables / HR helpers as in [Roles](./Roles.md)
- Portal: `customer_profiles` separate from staff

**Recommendation**

Enable Supabase leaked-password protection (dashboard).

---

## 6. Database & migrations

**Fact**

- Additive migrations Phase 1 → **78** under `supabase/migrations/`
- Phases 69–78: remittances module, allocate fix, clear reservation, SOA sync, commissions, remittance auto-confirm, yards, shipping companies, freight charges, bulk reserve, customer auto ID
- Stock master remains `vehicles` / `parts` (no second catalog)

See [Database](./Database.md).

---

## 7. Edge Functions & secrets

| Function | Purpose |
|---|---|
| `admin-create-user` / `admin-update-user` | Staff user admin (roles + office/shift + manager locations) |
| `portal-create-access` | Enable customer portal login |
| `send-web-push` | Deno Web Push |
| `send-outbound-email` | Resend |
| `send-whatsapp` | Meta Cloud API |
| `remind-request-dues` | Request due reminders |
| `tawk-webhook` | Phase 58 Tawk → Needs attention (deploy `--no-verify-jwt`) |

**Gap — operational**

- VAPID / Resend / WhatsApp / AI keys optional until configured

---

## 8. Security posture

**Fact**

- Admin/portal noindex + no-store headers
- SW never caches admin/api/portal
- Service role only on Edge / server routes / one-off import scripts, not `NEXT_PUBLIC_*`
- CORS on admin Edge functions origin-allowlisted
- Public vehicle photo policy excludes `is_auction_sheet = true`
- Commission writes via SECURITY DEFINER RPCs only

**Recommendation**

Keep VAPID private key only in Supabase secrets; rotate if ever pasted into chat/logs.

---

## 9. Completion vs roadmap

See [CURRENT_STATE](./CURRENT_STATE.md) (~**96–98%** of Phase 1–78 chosen MVP) and [Roadmap](./Roadmap.md).

Remaining: secrets hygiene, bank live integration, deeper marketing automation, broader automated tests, manager location-scoped HR approvals, and a native admin UI rewrite (the current staff APK is a WebView shell).

---

## 10. Doc freshness

| Doc | Status after this audit |
|---|---|
| CURRENT_STATE.md | Checkpoint 2026-09-29 / inventory query indexes verified; older SEO snapshot retained |
| Modules.md | Updated (SOA `#soa`, MoneyBreakdown, Product schema, Make Available) |
| Roadmap.md | Phases 72–78 Done + post-78 ship notes |
| Roles.md | Field / accounts / manager + commissions / freight / reports |
| User-Manual.md | Operator flows through post-78 SOA / Make Available |
| Deployment.md | Phase 72–78 + post-78 migration tables |
| Architecture.md | Customer and admin Android WebView shells, shared Supabase project |
| Database.md | Entities + DEFINER/security hardening |
| API.md | Commission / bulk reserve / remittance Phase 73 RPCs |
| Security.md | Advisor harden + Make Available DEFINER |
| README.md | Quick start, current Android shells, performance update |
| Performance.md | Live query-plan optimization and measurement caveat |
| Admin-Android.md | Separate staff APK and FCM setup |
| PROJECT-AUDIT.md | Focused docs refresh 2026-09-29; broad snapshot 2026-09-22 |

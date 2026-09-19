# ANSHA System Audit

Audit date: **2026-09-19** (refresh). Earlier 2026-09-18 snapshot is superseded.

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
| Domain libs | `lib/` (`types`, `site-offers`, `export-markets`, `fx`, …) |
| Hooks | `hooks/` (`use-inventory-deals`, `use-fx-rates`, `use-live-clock`, …) |
| Migrations | `supabase/migrations/` (through Phase 52) |
| Edge Functions | `supabase/functions/*` |

Most catalog/ERP pages are Client Components talking to PostgREST with the anon/authenticated JWT. RLS is the authorization backstop.

---

## 3. Public website

**Fact — routes**

`/`, `/parts`, `/parts/[slug]`, `/vehicles`, `/vehicles/[slug]`, `/categories`, `/categories/[slug]`, `/about`, `/contact`, `/blog`, `/blog/[slug]`, `/offers`, `/markets/[code]`, `/cart`, `/favorites`, `/banking`, `/cookie-policy`, `/offline`, `/verify/invoice/[code]`

**Fact — product UX (recent)**

- Deals in feature strip, mobile drawer, bottom nav, home featured strip
- Inventory-linked deal % / sale price on cards + detail pages
- Export markets strip (PNG flags) → market policy pages
- Inquiry cart + heart favorites (localStorage)
- Dubai clock + AED FX strip (desktop dedicated; mobile compact)
- Colour system: ink/red surfaces (not flat white-only)
- PWA display name **Anshatradingco APP** + Install CTAs

**Gap**

- Push delivery depends on correctly set Edge VAPID secrets (often mis-set)
- No separate email newsletter subscription table

---

## 4. Admin / ERP

**Fact — nav areas (ops vs sales gated in layout)**

Overview: dashboard, analytics, AI, audit-log  
Catalog: parts, vehicles, categories, imports, suppliers  
Purchase/stock: purchase-orders, inventory/receive, reservations  
Sales/finance: customers, invoices, remittances, bank-accounts, expenses, ledger, reports, vat-return  
Logistics: export-shipments, landed-cost  
Inbox: inquiries, requests, chat, mail, email, whatsapp  
Marketing: blog, offers, campaigns, **subscribers**, **trade-config**  
Team: payroll, users, profile

**Fact — admin chrome**

Live Pakistan + Dubai clocks and compact AED FX in the admin header.

**Gap**

- Bank feeds are CSV/manual stub only
- Campaigns are MVP (not full ESP)
- AI is grounded ops chat, not autonomous agents

---

## 5. Auth & roles

**Fact**

- Staff: Supabase email/password + `admin_profiles` (`admin` | `staff` | `sales`)
- Account-admin gates via `private.is_account_admin()` for sensitive RPCs/routes
- Ops gates via `private.is_ops_user()` (admin|staff)
- Sales allowlist in `proxy.ts` + nav + RLS
- Portal: `customer_profiles` separate from staff

**Recommendation**

Enable Supabase leaked-password protection (dashboard).

---

## 6. Database & migrations

**Fact**

- Additive migrations Phase 1 → **52** under `supabase/migrations/`
- Phase 51: offer inventory links (`vehicle_id`, `part_id`, discount/sale)
- Phase 52: `export_market_configs`, `site_trade_settings`
- Stock master remains `vehicles` / `parts` (no second catalog)

See [Database](./Database.md) for schema detail.

---

## 7. Edge Functions & secrets

| Function | Purpose |
|---|---|
| `admin-create-user` / `admin-update-user` | Staff user admin |
| `portal-create-access` | Enable customer portal login |
| `send-web-push` | Deno Web Push (`@negrel/webpush`) |
| `send-outbound-email` | Resend |
| `send-whatsapp` | Meta Cloud API |
| `remind-request-dues` | Request due reminders |

**Gap — operational**

- `send-web-push` returns 500 when `VAPID_*` secrets are not valid URL-safe base64
- Resend / WhatsApp / AI keys are optional until configured

---

## 8. Security posture

**Fact**

- Admin/portal noindex + no-store headers
- SW never caches admin/api/portal
- Service role only on Edge / server routes, not `NEXT_PUBLIC_*`
- CORS on admin Edge functions origin-allowlisted

**Recommendation**

Keep VAPID private key only in Supabase secrets; rotate if ever pasted into chat/logs.

---

## 9. Completion vs roadmap

See [CURRENT_STATE](./CURRENT_STATE.md) for the live % snapshot and [Roadmap](./Roadmap.md) for phase history.

Roughly **85–90%** of the chosen ERP + public + platform MVP is shipped. Remaining: secrets hygiene, bank live integration, deeper marketing automation, automated tests, native admin (explicitly out of scope).

---

## 10. Doc freshness

| Doc | Status after this audit |
|---|---|
| CURRENT_STATE.md | **New** checkpoint (~85–90% overall) |
| Modules.md | Updated |
| Roadmap.md | Updated (51–52 + product slices) |
| PWA.md | Updated |
| User-Manual.md | Updated (public + Marketing §5.8) |
| Deployment.md | VAPID warning clarified |
| Architecture.md | Surfaces + CURRENT_STATE link |
| Database.md | Phase 51–52 entities |
| API.md | `/api/fx` documented |
| README.md | Status table extended |
| PROJECT-AUDIT.md | This file |

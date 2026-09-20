# Current State

Verified checkpoint: **2026-09-21** (Phases **72–78** + remittance follow-ups on production `www.anshatradingco.com` / Supabase `ydrnilquojvalhgifest`). Prior checkpoint covered Phases **69–71** (remittances offices/shifts, allocate/unallocate, clear reservation, SOA sync).

Canonical site: https://www.anshatradingco.com  
Supabase: `ydrnilquojvalhgifest` (ap-southeast-2)  
Hosting: Vercel project `anshanew`

## Completion snapshot

| Area | Approx. done | Notes |
|---|---|---|
| Public catalog + SEO exporter site | **~97%** | Parts/vehicles/**machinery**/categories/blog+SEO/`/reviews`/offers/**70 export markets**; FOB/C&F/CIF quote strip; **GSC verification**; favicon/OG; cart & favorites; FX/clock; Deals; featured rotation; public Tawk widget |
| Staff ERP (purchase → GL → VAT/payroll) | **~99%** | Phases 28–38, 46–48, 50, 53–57, **61–71**, **72–78**: remittances (office/shift, Unknown TTS auto-confirm, **Allocate To Stocks**, Excel/CSV export); commission claims; bulk reserve; config yards / shipping companies / freight charges; reports hub (7 ops + financial) + Excel; vehicles Excel export; customer auto ID + Actions; multi-currency money breakdowns (no FX mixing); stock list invoice badges; SOA Buying clears on release |
| Ops communications (chat/mail/email/WA/AI/Tawk) | **~96%** | Team Chat presence (Phase 60); Tawk widget + Live chat Needs attention (**admin + manager**); Phase 58 webhook mirror |
| Marketing (offers, campaigns, PWA push, subscribers) | **~93%** | Phase 66 campaigns; subscribers Subscribe this device + Send test push; VAPID on Vercel + Edge. Still no open tracking / cron ESP |
| Customer portal | **~93%** | Invoices + SOA (**Buying details**) + **reservations** (`get_my_reservations`); no remittance UX for customers |
| PWA / Capacitor | **~88%** | **Anshatradingco APP**; install CTAs; push opt-in + staff test path; Capacitor shell docs |
| Automated tests | **~10%** | CI lint/typecheck/build/brands; no Vitest/Playwright suite |
| Docs (this set) | **~99%** | Audit refresh 2026-09-21 through Phase **78** |

**Overall product maturity (shipping ERP + public exporter):** roughly **96–98%** of the Phase 1–78 roadmap that was chosen and built. Core MVP is **shipped**. Remaining: Auth leaked-password toggle, bank live feeds, full ESP automation, HR location-scoped approvals, automated tests — not a greenfield rewrite.

## What exists now (high signal)

### Public
- Catalog: `/parts`, `/vehicles`, **`/machinery`**, categories, home finder, inquiry + part request
- Home featured parts (8) + vehicles (4): **10-minute deterministic rotation** (`lib/featured-rotation.ts`)
- Deals: `/offers`, inventory-linked discounts (`site_offers.vehicle_id` / `part_id`)
- Markets: `/markets/[code]` from **`lib/export-markets.ts` (70 destinations)** + admin Trade config
- Cart + favorites (localStorage); blog; banking; about; contact; invoice verify
- Testimonials on home + `/reviews`
- **SEO:** root `verification.google`; `/favicon.ico`; default OG `/images/og-default.jpg`
- **Incoterm quotes:** FOB / C&F / CIF when catalog columns are set
- PWA: manifest **Anshatradingco APP**, SW, install CTAs, push opt-in
- Header: live Dubai time + AED→USD/EUR/JPY/PKR via `/api/fx`
- Vehicle galleries hide auction-sheet photos; **Tawk.to** public widget when `NEXT_PUBLIC_TAWK_*` set

### Customer portal (`/portal`)
- **Reservations** (`/portal/reservations`) via `get_my_reservations`
- Invoices (non-draft) + SOA (`get_my_customer_soa`) with **Buying details** — unpaid reservation proformas cancel when stock returns to **available**

### Staff ERP (`/admin`)
- Catalog (parts / **owned vehicles** / **Auction stock** / Machinery filter), customers, reservations, invoices, remittances, commissions
- **Vehicles** = `stock_pool = owned`; **Auction stock** = `auction_third_party`; transfer actions between pools
- **Stock management** + **Parts stock** + **Arrival Watch** — dual payment/stock × shipment status
- **Bulk reserve** (Phase 77): select available vehicles/parts → `bulk_reserve_stock` (partial success OK)
- **Actions menus** on reserved/sold stock cards: open invoices, claim commission, transfer pool, etc.
- **Stock list invoice badges** — linked non-cancelled invoices from `invoice_items` (`lib/stock-linked-invoice.ts`)
- Purchase: suppliers, PO, GRN, supplier payments; Export shipments (DHL/RoRo/20ft/40ft + docs); Landed cost
- **Configuration**: export masters (`/admin/configuration`); **Yards** (`auction_yards`); **Shipping Companies**; **Freight charges** (ops + accounts write; manager read)
- **Reports hub** (`/admin/reports`): 7 operational reports + financial statements; Excel download (`lib/export-excel.ts` / `lib/reports/*`)
- **Vehicles Excel export** from owned/auction inventory lists
- Reservations: price/shipment/inspection/VAT terms; field-agent requester lock; `reserved_by` on vehicles **and parts**
- Invoices: Incoterm header/lines; VAT; A4 print; **Allocate remaining** / Unallocate; unallocate-then-delete restores stock
- **Customers (Phase 78):** auto `customer_code` from `customer_code_seq` (~**48001+**); consignee fields; row **Actions** menu (SOA, invoices, remittances, consignee, edit)
- **Multi-currency money breakdowns** (`lib/money.ts` `formatMoneyBreakdown`) — sums per currency; **no FX conversion / mixing**
- Bank accounts, expenses, VAT, payroll/EOS, GL + auto-post
- Requests hard-delete; Team Chat presence; Live chat (**admin + manager**); Marketing (blog, offers, campaigns, subscribers, trade config)
- Roles: `admin` | `staff` | `sales` | `freelancer` | `manager` | `accounts`
- Field agents: catalog lists, own-book customers, reserve, draft proforma, **commissions claim**, My remittances
- **Remittances (Phases 69–73):** dashboard (office filter), list/receive (**Allocate To Stocks** UI + allocate/unallocate), Unknown TTS (**auto-confirm** when linked to customer + agent), My remittances, **Excel/CSV export dropdown**; office/shift on **Users**
- **Commissions (Phase 72):** `/admin/commissions` — claim on sold stock; ops/accounts review/pay; manager view
- Clear reservation on available + SOA Buying sync when stock → available

### Inventory ops (data loads)

Live Supabase counts (ops snapshot): **~191** Japan vehicles; **~32** auction-sheet photos; **~2** Dubai vehicles; **~154** Dubai parts; **~16** Japan parts (key-fobs).

Japan Aug 2026 ZIP batches → `stock_origin=japan`, **`stock_pool=auction_third_party`**, published, ask-for-quote. Script: `scripts/import-japan-stock-vehicles.mjs`. WhatsApp/Dubai imports via `scripts/import-whatsapp-parts*.mjs`, `scripts/import-dubai-whatsapp-sep20-stock.mjs`.

### Edge Functions
`admin-create-user`, `admin-update-user`, `portal-create-access`, `send-web-push`, `send-outbound-email`, `send-whatsapp`, `remind-request-dues`, `tawk-webhook` (deploy with `--no-verify-jwt`)

### Migrations
Through **Phase 78**. Already applied on remote — app deploy ships code only.

| Migration | Scope |
|---|---|
| `20260921130000_phase_78_customer_auto_id.sql` | `customer_code_seq` (~48001+); consignee columns; prepare trigger |
| `20260921120000_phase_77_bulk_reserve_stock.sql` | `bulk_reserve_stock` |
| `20260921110000_phase_76_freight_charges.sql` | `freight_charges` |
| `20260921100000_phase_75_shipping_companies.sql` | `shipping_companies` |
| `20260921090000_phase_74_yards_config.sql` | `auction_yards` |
| `20260921070000_phase_73_remittance_auto_confirm.sql` | Known create → confirmed; link customer+agent → auto-confirm |
| `20260921060000_phase_72_commission_claims.sql` | `commission_claims` + claim/review RPCs |
| `20260921050000_soa_sync_on_reservation_release.sql` | Cancel unpaid reservation proformas; portal Buying |
| `20260921040000_clear_reservation_on_available.sql` | Null reservation metadata on available |
| `20260921030000_phase_71_allocate_unallocate_fix.sql` | SECURITY DEFINER unallocate |
| `20260921020000_phase_70_admin_profile_office_shift.sql` | Profile office/shift |
| `20260921010000` / `11000` Phase 69 | Remittance offices/shifts module |

Earlier phases (1–68) remain under `supabase/migrations/`.

## Known gaps / operator actions

1. **Google Search Console** — confirm ownership → Request indexing for key URLs.
2. **VAPID verify** — matching keys on Vercel + Edge; confirm via `/admin/subscribers` → Subscribe → Send test push. Do not commit `.env.local`.
3. **Supabase Auth leaked-password protection** — enable in dashboard.
4. **Optional secrets** — Resend, WhatsApp, AI Gateway/OpenAI if those UIs should send.
5. **Tawk webhook** — `TAWK_WEBHOOK_SECRET`, deploy `--no-verify-jwt`, dashboard webhooks → `…/functions/v1/tawk-webhook`. See `docs/Tawk.md`.
6. **Bank feeds** — CSV/manual only; no live Open Banking OAuth.
7. **Email newsletter list** — Marketing subscribers = `push_subscriptions` only.
8. **Automated E2E/unit tests** — still thin.
9. **Native admin app** — not built; Capacitor wraps public URL only.
10. **Manager HR location scope** — inventory scoped by `allowed_stock_origins`; HR shift locations remain global viewer.
11. **Edge functions** — keep `admin-create-user` / `admin-update-user` redeployed for `allowed_stock_origins` + remittance `office_id` / `shift_id`.

## Next recommended steps (safe order)

1. GSC verify + Request indexing.
2. `/admin/subscribers` Subscribe this device → Send test push.
3. Enable leaked-password protection.
4. Confirm Resend / WhatsApp / AI / Tawk webhook if in use.
5. Spot-check Phase 72–73: claim commission on sold stock; Unknown TTS link → auto-confirm; Allocate To Stocks; remittance Excel/CSV export.
6. Spot-check Phase 74–76: Configuration Yards / Shipping Companies / Freight charges CRUD.
7. Spot-check Phase 77–78: bulk reserve; new customer gets Customer ID ≥ 48001; Actions menu; multi-currency KPIs show separate currencies.
8. Spot-check reports hub Excel downloads; vehicles Export Excel.
9. Add Playwright smoke when ready for quality gates.

## Doc map

| Doc | Purpose |
|---|---|
| [Modules](./Modules.md) | Implemented module matrix |
| [Roadmap](./Roadmap.md) | Phase history + remaining platform ideas |
| [PROJECT-AUDIT](./PROJECT-AUDIT.md) | Stack / structure audit snapshot |
| [User-Manual](./User-Manual.md) | Operator how-to |
| [Roles](./Roles.md) | RBAC matrix |
| [Tawk](./Tawk.md) | Public widget + Live chat webhook |
| [PWA](./PWA.md) / [Mobile](./Mobile.md) | Installable app + Capacitor |
| [Deployment](./Deployment.md) | Vercel + Edge secrets |
| [Database](./Database.md) / [Security](./Security.md) | Data & authz |
| [API](./API.md) | Health/FX/AI + RPCs + Edge |
| [Architecture](./Architecture.md) | Surfaces and dependency direction |

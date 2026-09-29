## Catalog prices and freight (2026-09-29)

- Vehicle listings prioritize a positive FOB value and keep FOB synchronized with the legacy listing-price field; public cards/details show available FOB, C&F, and CIF terms.
- Admin bulk vehicle pricing supports FOB, C&F, and CIF, with inventory search and make/model/year/origin/currency/price-status filters.
- Vehicle make/model M³ configuration provides search and filters and stores dimensions in metres for future matching listings/imports.
- Freight charges distinguish RoRo rates per M³ from the total price of one 40-ft container.
- Freight calculator supports saved vehicle dimensions or manual L × W × H, plus type-to-search suggestions for configured countries and their ports.
- Operational steps: [Catalog Prices and Freight](./Catalog-Freight-Pricing.md). Public production status should be checked after the current pull request deploys.

# Current State

Verified checkpoint: **2026-09-29**. The public inventory listing indexes are applied to Supabase and verified with generic prepared-query plans. The prior SEO-01…SEO-10 validation is dated 2026-09-22; refer to the current Vercel production deployment before treating later site changes as live. Baseline: post–Phase **78** ops/SEO/security on `www.anshatradingco.com` / Supabase `ydrnilquojvalhgifest`.

Canonical site: https://www.anshatradingco.com  
Supabase: `ydrnilquojvalhgifest` (ap-southeast-2)  
Hosting: Vercel project `anshanew`

## Recent database performance fix (2026-09-29)

- Added `vehicles_public_listing_order_idx` and `parts_public_listing_order_idx` over `(is_published, stock_status, is_featured DESC, created_at DESC)`.
- Verified with forced generic prepared plans: both listing queries use their matching index and no longer sort by featured/date.
- Applied migrations `20260928221630_optimize_public_inventory_listing_indexes` and `20260928222037_make_public_listing_indexes_parameter_safe`.
- Query statistics viewed before the change were cumulative (reset 2026-09-09); collect new traffic before reporting a measured latency reduction.

## Completion snapshot

| Area | Approx. done | Notes |
|---|---|---|
| Public catalog + SEO exporter site | **~99%** | Parts/vehicles/**machinery**/categories/blog/`/reviews`/offers/**70 export markets**; Complete SEO Repair (robots+sitemap+facets noindex+markets empty noindex+shared metadata/schema/breadcrumbs/CWV); FOB/C&F/CIF; **GSC**; favicon/OG; Product JSON-LD rules (`lib/product-schema.ts`); cart & favorites; FX/clock; Deals; featured rotation; Tawk. Remaining: deploy + GSC human steps; no brand microsite; detail schema still client-hydrated |
| Staff ERP (purchase → GL → VAT/payroll) | **~99%** | Phases 28–38, 46–48, 50, 53–57, **61–71**, **72–78** + post-78: remittances; commissions; bulk reserve; config yards/shipping/freight; reports + Excel; customer auto ID + Actions; **MoneyBreakdown** KPIs (dashboard/analytics/invoices/SOA — All currencies, no FX mixing); stock invoice badges; Make Available clears reservation SOA (SECURITY DEFINER fix) |
| Ops communications (chat/mail/email/WA/AI/Tawk) | **~96%** | Team Chat presence (Phase 60); Tawk widget + Live chat Needs attention (**admin + manager**); Phase 58 webhook mirror; advisor harden on `tawk_webhook_receipts` + `touch_admin_last_seen` |
| Marketing (offers, campaigns, PWA push, subscribers) | **~93%** | Phase 66 campaigns; subscribers Subscribe this device + Send test push; VAPID on Vercel + Edge. Still no open tracking / cron ESP |
| Customer portal | **~98%** | Verified-email self-registration; safe exact-email CRM linking; stock catalog shortcuts; invoices + SOA, reservations, remittances; Tawk support; admin-approved account deletion |
| PWA / Capacitor | **~88%** | **Anshatradingco APP**; install CTAs; push opt-in + staff test path; Capacitor shell docs |
| Automated tests | **~10%** | CI lint/typecheck/build/brands; no Vitest/Playwright suite |
| Docs (this set) | **~99%** | Refreshed 2026-09-29; current state, architecture, performance, and APK docs aligned |

**Overall product maturity (shipping ERP + public exporter):** roughly **96–98%** of the Phase 1–78 roadmap that was chosen and built. Core MVP is **shipped**. Remaining: Auth leaked-password toggle, bank live feeds, full ESP automation, HR location-scoped approvals, automated tests — not a greenfield rewrite.

## What exists now (high signal)

### Public
- Catalog: `/parts`, `/vehicles`, **`/machinery`**, categories, home finder, inquiry + part request
- Home featured parts (8) + vehicles (4): **10-minute deterministic rotation** (`lib/featured-rotation.ts`)
- Deals: `/offers`, inventory-linked discounts (`site_offers.vehicle_id` / `part_id`)
- Markets: `/markets/[code]` from **`lib/export-markets.ts` (70 destinations)** + admin Trade config
- Cart + favorites (localStorage); blog; banking; about; contact; invoice verify
- Testimonials on home + `/reviews`
- **SEO (SEO-01…10):** `NEXT_PUBLIC_SITE_URL` + `lib/seo.ts`; robots disallow `/admin` `/portal` `/api`; sitemap includes markets when inventory exists; listing facet URLs `noindex,follow` + canonical hub; empty markets `noindex`; Organization/WebSite (root), Article/ItemList/BreadcrumbList helpers; GSC verification; `/favicon.ico`; default OG `/images/og-default.jpg`. Checklist: `docs/Deployment.md` → SEO section
- **Product JSON-LD:** `lib/product-schema.ts` — omit `offers` unless price+currency valid; real published testimonials only for `aggregateRating`/`review` (never invented). Vehicle/part detail graphs emit after client hydrate (pages are `'use client'`)
- **Incoterm quotes:** FOB / C&F / CIF when catalog columns are set
- PWA: manifest **Anshatradingco APP**, SW, install CTAs, push opt-in
- Header: live Dubai time + AED→USD/EUR/JPY/PKR via `/api/fx`
- Vehicle galleries hide auction-sheet photos; **Tawk.to** public widget when `NEXT_PUBLIC_TAWK_*` set

### Customer portal (`/portal`)
- **Reservations** (`/portal/reservations`) via `get_my_reservations`
- Invoices (non-draft) + SOA (`get_my_customer_soa`) with **Buying details** — unpaid reservation proformas cancel when stock returns to **available**
- Portal account KPIs use shared **`MoneyBreakdown`** (per-currency stack; All currencies = no FX mix)

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
- **Customers (Phase 78):** auto `customer_code` from `customer_code_seq` (~**48001+**); consignee fields; row **Actions** menu (SOA, invoices, remittances, consignee, edit) — SOA deep-link `#soa`
- **Customer SOA UI:** `/admin/customers/[id]#soa` — statement KPIs + allocate remittance→invoice; **MoneyBreakdown** for multi-currency totals
- **Dashboard / analytics / invoices list:** shared `components/money-breakdown.tsx` with currency filter (**All** stacks each currency; never converts)
- **Multi-currency helpers:** `lib/money.ts` `formatMoneyBreakdown` / `currencyEntries` — sums per currency; **no FX conversion / mixing**
- Bank accounts, expenses, VAT, payroll/EOS, GL + auto-post
- Requests hard-delete; Team Chat presence; Live chat (**admin + manager**); Marketing (blog, offers, campaigns, subscribers, trade config)
- Roles: `admin` | `staff` | `sales` | `freelancer` | `manager` | `accounts`
- Field agents: catalog lists, own-book customers, reserve, draft proforma, **commissions claim**, My remittances
- **Remittances (Phases 69–73):** dashboard (office filter), list/receive (**Allocate To Stocks** UI + allocate/unallocate), Unknown TTS (**auto-confirm** when linked to customer + agent), My remittances, **Excel/CSV export dropdown**; office/shift on **Users**
- **Commissions (Phase 72):** `/admin/commissions` — claim on sold stock; ops/accounts review/pay; manager view
- Clear reservation on available + SOA Buying sync when stock → available — **Make Available** works via SECURITY DEFINER on `private.sync_catalog_sold_state` / `clear_reservation_buying_documents`

### Inventory ops (data loads)

Live Supabase counts (ops snapshot): **~191** Japan vehicles; **~32** auction-sheet photos; **~2** Dubai vehicles; **~154** Dubai parts; **~16** Japan parts (key-fobs).

Japan Aug 2026 ZIP batches → `stock_origin=japan`, **`stock_pool=auction_third_party`**, published, ask-for-quote. Script: `scripts/import-japan-stock-vehicles.mjs`. WhatsApp/Dubai imports via `scripts/import-whatsapp-parts*.mjs`, `scripts/import-dubai-whatsapp-sep20-stock.mjs`. Singapore WhatsApp one-off (Lexus RX350 draft): `scripts/import-singapore-rx350-once.mjs`. Taiwan auction ZIP drafts: `scripts/import-taiwan-auction-stock.mjs` (local `_import_taiwan_stock*` media not in git).

### Edge Functions
`admin-create-user`, `admin-update-user`, `portal-create-access`, `send-web-push`, `send-outbound-email`, `send-whatsapp`, `remind-request-dues`, `tawk-webhook` (deploy with `--no-verify-jwt`)

### Migrations
Through **Phase 78** plus post-78 Make Available + security advisor migrations. **Already applied on remote** for Make Available + security hardening — app deploy ships code + docs only; do not re-apply if present in `schema_migrations`.

| Migration | Scope |
|---|---|
| `20260928221630_optimize_public_inventory_listing_indexes.sql` | Initial partial indexes for featured-first public vehicle/parts listing queries; superseded by the parameter-safe follow-up below |
| `20260928222037_make_public_listing_indexes_parameter_safe.sql` | Replaces the partial indexes with composite indexes that work with parameterized generic plans |
| `20260922020000_security_advisor_hardening.sql` | `purchase_order_sequences` RLS + deny; `tawk_webhook_receipts` explicit deny; revoke anon on `touch_admin_last_seen`; drop duplicate vehicles reserved_customer index |
| `20260922010000_fix_sync_catalog_sold_state_security_definer.sql` | `private.sync_catalog_sold_state` + `clear_reservation_buying_documents` SECURITY DEFINER (Make Available permission fix) |
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

1. **Google Search Console** — after SEO deploy READY: confirm ownership → re-submit `sitemap.xml` if crawl URLs changed → Request indexing for key URLs. Tag Assistant: confirm GTM hits `/metrics` (see `docs/Deployment.md`).
2. **VAPID verify** — matching keys on Vercel + Edge; confirm via `/admin/subscribers` → Subscribe → Send test push. Do not commit `.env.local`.
3. **Supabase Auth leaked-password protection** — enable in dashboard.
4. **Optional secrets** — Resend, WhatsApp, AI Gateway/OpenAI if those UIs should send.
5. **Tawk webhook** — `TAWK_WEBHOOK_SECRET`, deploy `--no-verify-jwt`, dashboard webhooks → `…/functions/v1/tawk-webhook`. See `docs/Tawk.md`.
6. **Bank feeds** — CSV/manual only; no live Open Banking OAuth.
7. **Email newsletter list** — Marketing subscribers = `push_subscriptions` only.
8. **Automated E2E/unit tests** — still thin.
9. **Native admin rewrite** — not built. The separate Admin APK is a Capacitor WebView for `/admin/dashboard`, not a standalone native ERP; see [Admin-Android](./Admin-Android.md).
10. **Manager HR location scope** — inventory scoped by `allowed_stock_origins`; HR shift locations remain global viewer.
11. **Edge functions** — keep `admin-create-user` / `admin-update-user` redeployed for `allowed_stock_origins` + remittance `office_id` / `shift_id`.

## Next recommended steps (safe order)

1. Deploy Complete SEO Repair → GSC sitemap re-submit (if needed) + Request indexing → Tag Assistant for `/metrics` gateway.
2. `/admin/subscribers` Subscribe this device → Send test push.
3. Enable leaked-password protection.
4. Confirm Resend / WhatsApp / AI / Tawk webhook if in use.
5. Spot-check Phase 72–73: claim commission on sold stock; Unknown TTS link → auto-confirm; Allocate To Stocks; remittance Excel/CSV export.
6. Spot-check Phase 74–76: Configuration Yards / Shipping Companies / Freight charges CRUD.
7. Spot-check Phase 77–78: bulk reserve; new customer gets Customer ID ≥ 48001; Actions menu → `#soa`; multi-currency KPIs stack currencies (All).
8. Spot-check **Make Available** on reserved stock (no permission error; SOA Buying clears).
9. Spot-check public part/vehicle JSON-LD (offers only when price valid; ratings only when published reviews exist).
10. Spot-check reports hub Excel downloads; vehicles Export Excel.
11. Add Playwright smoke when ready for quality gates.

## Doc map

| Doc | Purpose |
|---|---|
| [Modules](./Modules.md) | Implemented module matrix |
| [Roadmap](./Roadmap.md) | Phase history + remaining platform ideas |
| [PROJECT-AUDIT](./PROJECT-AUDIT.md) | Stack / structure audit snapshot |
| [User-Manual](./User-Manual.md) | Operator how-to |
| [Roles](./Roles.md) | RBAC matrix |
| [Tawk](./Tawk.md) | Public widget + Live chat webhook |
| [PWA](./PWA.md) / [Mobile](./Mobile.md) | Customer PWA and Android shell |
| [Admin-Android](./Admin-Android.md) | Staff APK setup and FCM |
| [Deployment](./Deployment.md) | Vercel + Edge secrets |
| [Database](./Database.md) / [Security](./Security.md) | Data & authz |
| [API](./API.md) | Health/FX/AI + RPCs + Edge |
| [Architecture](./Architecture.md) | Surfaces and dependency direction |


## Customer self-service portal (2026-09-23)

- New customers can register at `/portal` with email verification.
- `ensure_customer_portal_profile` links a single exact, unclaimed CRM email match; otherwise it creates an isolated customer record. Ambiguous matches are flagged `review_required` and never expose another customer's history.
- Portal Stock links to published parts, vehicles, and machinery. Reservations, invoices, remittances, buying details, and per-currency SOA remain protected by customer RLS.
- Tawk live chat now loads in the portal, using the existing public widget configuration.
- Portal Settings provides in-app deletion requests; `/account-deletion` is the public web deletion resource required for store listings.
- Only an active admin can approve a deletion. The Edge Function deletes the Supabase Auth user and anonymizes customer PII; transaction records may remain only for legal, tax, fraud-prevention, or audit obligations.
- Migration: `20260923010000_customer_self_service_portal.sql`.
- Edge Function: `portal-delete-account` (JWT required).

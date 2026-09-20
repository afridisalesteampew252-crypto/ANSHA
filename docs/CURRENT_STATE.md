# Current State

Verified checkpoint: **2026-09-21** (Phase **69** remittances module — dashboard with office-wise breakdown, list/receive, My remittances, Unknown TTS, Offices/Shifts masters, tagged-receiver RLS; Phase **68** hard-delete export shipments + workspace request tickets; Phases **66–67** + VAPID ops path; portal reservations; Phases **64–65** invoice unallocate-delete + owned/auction stock pools; Phase 63 parts stock ops; Phase 62 stock ops + export masters + VAT; Phase 61/61b Incoterms; Phase 58 Tawk + Phase 60 presence; Japan Aug ZIP + Dubai WA Sep 20 stock; SEO/GSC + Phase 57 machinery).

Canonical site: https://www.anshatradingco.com  
Supabase: `ydrnilquojvalhgifest` (ap-southeast-2)  
Hosting: Vercel project `anshanew`

## Completion snapshot

| Area | Approx. done | Notes |
|---|---|---|
| Public catalog + SEO exporter site | **~96%** | Parts/vehicles/**machinery**/categories/blog+SEO/`/reviews`/offers/markets; FOB/C&F/CIF quote strip when set; **GSC verification meta**; favicon/OG; cart & favorites; FX/clock; Deals; featured rotation; public Tawk widget |
| Staff ERP (purchase → GL → VAT/payroll) | **~98%** | Phases 28–38, 46–48, 50, 53–57, **61/61b**, **62–65**, **66** manager location inventory; **68** export/request hard-delete; **69** remittances module (offices/shifts, Unknown TTS, My remittances RLS); owned vs auction pools; invoice unallocate-delete; stock dashboards; export masters; field-agent RLS; VAT Yes/No; doc-driven shipment status |
| Ops communications (chat/mail/email/WA/AI/Tawk) | **~96%** | Team Chat presence (Phase 60); Tawk widget + Live chat Needs attention (**admin + manager**); Phase 58 webhook mirror |
| Marketing (offers, campaigns, PWA push, subscribers) | **~93%** | Phase 66 campaigns (edit/audience/links/Resend test+segment/`sent_count`); subscribers Subscribe this device + Send test push; VAPID keys on Vercel + Edge (this deploy bakes `NEXT_PUBLIC_VAPID_PUBLIC_KEY`). Still no open tracking / cron ESP |
| Customer portal | **~92%** | Invoices + SOA + **reservations** (`/portal/reservations`, `get_my_reservations` Phase 67); no remittance UX for customers |
| PWA / Capacitor | **~88%** | **Anshatradingco APP**; install CTAs; push opt-in + staff test path; graceful no-op when VAPID unset; Capacitor shell docs |
| Automated tests | **~10%** | CI lint/typecheck/build/brands; no Vitest/Playwright suite |
| Docs (this set) | **~99%** | Audit refresh 2026-09-21 + Phases 66–69 + VAPID |

**Overall product maturity (shipping ERP + public exporter):** roughly **94–96%** of the Phase 1–69 roadmap that was chosen and built. Core MVP is **shipped**. Remaining: Auth leaked-password toggle, bank live feeds, full ESP automation, HR location-scoped approvals, automated tests — not a greenfield rewrite.

## What exists now (high signal)

### Public
- Catalog: `/parts`, `/vehicles`, **`/machinery`** (trucks + heavy equipment), categories, home finder, inquiry + part request
- Home featured parts (8) + vehicles (4): **10-minute deterministic rotation** over published/available inventory (`lib/featured-rotation.ts`). Admin `is_featured` still sets badges and boosts pool membership; no cron / no DB flag writes.
- Deals: `/offers`, inventory-linked discounts on cards + detail (`site_offers.vehicle_id` / `part_id`)
- Markets: `/markets/[code]` + admin Trade config (rates / freight / import policy)
- Cart + favorites (localStorage inquiry list)
- Blog (`/blog`, `/blog/[slug]` SEO metadata + Article JSON-LD), banking, about, contact, invoice verify
- Testimonials on home + `/reviews` (DB-backed + static fallback; footer + sitemap)
- **SEO / Search:** root `verification.google` (Search Console HTML tag); stable `/favicon.ico` + `/icons/favicon-48.png`; default OG `/images/og-default.jpg` on home + listing layouts; helpers in `lib/seo.ts`
- **Incoterm quotes (Phase 61):** public part/vehicle detail show FOB / C&F / CIF when catalog columns are set (`IncotermQuoteStrip`)
- Invoice verify (`/verify/invoice/[code]`): shows document `price_term` + `shipment_term` and per-line price term when present (Phase 61b)
- PWA: manifest **Anshatradingco APP**, SW, install CTAs, push opt-in (`lib/pwa-push-subscribe.ts`); client helpers no-op when `NEXT_PUBLIC_VAPID_PUBLIC_KEY` unset
- Header: live Dubai time + AED→USD/EUR/JPY/PKR via `/api/fx`
- Vehicle galleries hide auction-sheet photos (`vehicle_photos.is_auction_sheet`); public RLS excludes them
- **Tawk.to** public chat widget (`components/public/tawk-to-chat.tsx`) when `NEXT_PUBLIC_TAWK_PROPERTY_ID` + `NEXT_PUBLIC_TAWK_WIDGET_ID` are set

### Customer portal (`/portal`)
- **Reservations** (`/portal/reservations`) — own reserved vehicles/parts + open/proforma-linked sold rows via `get_my_reservations` (Phase 67)
- Invoices (non-draft) + account statement SOA (`get_my_customer_soa`)

### Staff ERP (`/admin`)
- Catalog (parts / **owned vehicles** / **Auction stock** / **Machinery & trucks** filter), customers, reservations, invoices, remittances (Phase 69 module below)
- **Vehicles** (`/admin/vehicles`) = `stock_pool = owned` only; **Auction stock** (`/admin/auction-stock`) = `auction_third_party`; transfer actions move units between pools (Japan-origin defaults to auction until purchased into owned)
- **Stock management** (`/admin/stock`) + **Parts stock** (`/admin/parts/stock`) + **Arrival Watch** (`/admin/stock/arrival-watch`) — dual columns: payment/stock status × shipment view status; vehicle stock ops load **owned** pool only (`lib/stock-ops.ts`, `lib/parts-stock-ops-data.ts`)
- Purchase: suppliers, PO, GRN, supplier payments
- **Export shipments** (`/admin/export-shipments`) — modes **DHL / RoRo / 20ft / 40ft**; PDF/image docs: BOL, export certificate, waybill, courier (one each) + **per-country inspection certificates**; Phase 62 **export master selects** (country/ports/vessel/voyage) + **document-driven status** (BOL → shipped/sailed, waybill/surrendered → delivered/arrived); Phase 63 **`export_shipment_parts`** + `part_ids` on create; Phase 68 **hard-delete** (`delete_export_shipment`: draft/cancelled free; account-admin `p_force` otherwise)
- **Configuration** (`/admin/configuration`) — CRUD for `export_master_options`; Trade config remains at `/admin/trade-config`
- Landed cost
- Catalog Incoterm sell quotes: `price_fob` / `price_cf` / `price_cif` on parts & vehicles (admin create/edit + public strip)
- Reservations: **price term** (FOB/C&F/CIF), **shipment term**, **inspection Yes/No**, Phase 62–63 **VAT Yes/No**, requester name/role (sales/freelancer locked to own profile), ETD/ETA; `reserved_by` on vehicles **and parts**
- Invoices (Phase 61b/62/64): header `price_term` + `shipment_term`; optional per-line `price_term`; `vat_applicable`; A4 print + verify show terms; **delete** requires remittance unallocate first (`unallocate_invoice_remittances` / `unallocate_and_delete_invoice`); delete restores linked reserved/sold stock to **available**
- Bank accounts (+ CSV feed stub), expenses, VAT return, payroll/EOS, GL + reports + auto-post
- Requests (Phase 68 hard-delete ticket via `delete_workspace_request`; intake rows kept), chat, mail, notifications
- **Team Chat** (`/admin/chat`) — green online dots + last-seen labels (Phase 60: Realtime presence channel `workspace-presence`, `admin_profiles.last_seen_at`, `touch_admin_last_seen`, `AdminPresenceProvider`)
- **Live chat** (`/admin/live-chat`) — Needs attention list + open-count badge + Tawk open shortcuts; **`admin` + `manager` only** (`canAccessLiveChat`; nav + `proxy.ts`). Not staff / sales / freelancer / accounts. Reply in Tawk dashboard; dismiss clears ANSHA only. Setup: `docs/Tawk.md`.
- Marketing: blog (Write/HTML/Preview), offers, campaigns (edit + audience + segment + `sent_count`), **PWA subscribers** (Subscribe this device + Send test push), trade config
- Analytics, AI assistant, audit log (admin SELECT), WhatsApp, outbound email
- Admin chrome: Pakistan + Dubai clocks + FX strip; **responsive shell** (`admin-shell` / `admin-table-scroll`, mobile nav body lock); shared **`NativeSelect`** + SearchableSelect chevron polish on Configuration / Reserve / Receive Stock forms
- Roles: `admin` | `staff` | `sales` | `freelancer` | `manager` | `accounts` (account-admin gates; Phases 54–55, **66** manager locations)
- Field agents (`sales` / `freelancer`): catalog lists, own-book customers, reserve, **draft proforma only**; Phase 62–63 RLS — see **available** + **own `reserved_by`** vehicles **and parts** only
- **Remittances (Phase 69)** — finance (`ops`/`accounts`): `/admin/remittances/dashboard` (date-range KPIs + **office-wise** received/allocated/unallocated), `/admin/remittances` list/receive (office/shift/`received_by`; empty customer ⇒ **Unknown TTS**), `/admin/remittances/unknown` + `link_remittance`, `/admin/remittances/offices`, `/admin/remittances/shifts`. **My remittances** (`/admin/remittances/mine`) for any workspace user tagged as `received_by` (field agents + managers included; finance sees all). Tables `remittance_offices` / `remittance_shifts`; columns `received_by`, `office_id`, `shift_id`, `is_unknown`; status `unknown`; RPCs `create_remittance` (15-arg), `link_remittance`, `count_unknown_remittances`
- Accounts: receivables (approve draft→sent), full remittance module, related finance views — not full admin
- HR MVP: shift locations, Morning/Night assignments, attendance (`/admin/hr*`); manager = HR viewer + **location-scoped inventory/ops** (`allowed_stock_origins`)
- Catalog audit: part/vehicle activity in `audit_logs` (admin SELECT only)
- Vehicles: `stock_pool` (Phase 65); `vehicle_class` / `equipment_category` / `operating_hours` (Phase 57); auction-sheet badge + lightbox; redesigned admin cards/lists (Phase 63) shared by owned + auction lists
- Parts: redesigned `/admin/parts` cards/list (Phase 63); stock ops parity with vehicles
- A4 invoice print: denser layout; verification code on the document face (with QR); Phase 61b price/shipment terms in header

### Inventory ops (data loads, not schema phases)

Live Supabase counts (ops snapshot): **~191** Japan vehicles; **~32** auction-sheet photos (`is_auction_sheet`); **~2** Dubai vehicles; **~154** Dubai parts; **~16** Japan parts (key-fobs).

**Japan vehicle ZIP batches** (Aug 2026 folders → `stock_origin=japan`, **`stock_pool=auction_third_party`** after Phase 65 backfill, published, ask-for-quote, WebP, titles `{Make} {Model} {Year} {Color}`):

| ZIP | Vehicles | Notes |
|---|---|---|
| 17 Aug | **40** (435 photos) | **20 auction sheets** (`A.*`); Harrier / Roomy / Prado / Fit / CX-8 / Tank |
| 19 Aug | **50** (577 photos) | Alphard / Aqua / Stepwgn; MXPK chassis mapped to **Toyota Aqua** (not Raize) |
| 25 Aug | **~35** | First ZIP + Phase 56 auction-sheet flagging on admin cards |
| 26 Aug | **35** (409 photos) | VIN folders (e.g. CLA / Tiguan); no auction sheets in ZIP |
| 28 Aug | **29** (343 photos) | Alphard / Note / Prado / Fit; no auction sheets in ZIP |

Script: `scripts/import-japan-stock-vehicles.mjs` (+ one-off batch runners under `scripts/tmp/` when used; do not commit large extracts).

**WhatsApp / Dubai parts & stock:**
- Warehouse + Dubai parts batches: `scripts/import-whatsapp-parts.mjs`, `scripts/import-whatsapp-parts-dubai.mjs`
- Japan key-fob / car-electronics: `scripts/import-whatsapp-parts-keys.mjs` (**16** Japan parts)
- Dubai WhatsApp Sep 20 vehicles+parts: `scripts/import-dubai-whatsapp-sep20-stock.mjs` (**2** vehicles — Corolla Fielder Hybrid + Hilux GR Sport; **2** new parts — Volk forged wheel + STI engine-bay; Aptany wheel skipped as duplicate)

### Edge Functions
`admin-create-user`, `admin-update-user`, `portal-create-access`, `send-web-push`, `send-outbound-email`, `send-whatsapp`, `remind-request-dues`, `tawk-webhook` (Phase 58; deploy with `--no-verify-jwt`)

### Migrations
Through **Phase 69**. Phase 69: remittance offices/shifts, `received_by` / `is_unknown`, tagged SELECT RLS, `create_remittance` / `link_remittance` / `count_unknown_remittances` (`20260921010000_phase_69_remittance_module_offices_shifts.sql`); drop ambiguous 14-arg overload (`20260921011000_phase_69_drop_create_remittance_14arg.sql`). Phase 68: `delete_export_shipment` + `delete_workspace_request` (`20260920260000_phase_68_export_request_delete.sql`). Phase 67: portal own-reservation RLS + `get_my_reservations` (`20260920250000_phase_67_portal_reservations.sql`). Phase 66: `marketing_campaigns.sent_count`; `admin_profiles.allowed_stock_origins` + manager RLS helpers (`20260920240000_phase_66_marketing_manager_locations.sql`). Phase 65: `vehicles.stock_pool` (`owned`|`auction_third_party`); Japan backfill (`20260920230000_phase_65_vehicle_stock_pool.sql`). Phase 64: `unallocate_invoice_remittances`, `delete_invoice_safely`, `unallocate_and_delete_invoice` (`20260920220000_phase_64_invoice_unallocate_delete_stock_restore.sql`). Phase 63: parts stock ops + field-agent parts RLS + `export_shipment_parts` (`20260920210000_phase_63_parts_stock_ops_sales_scope.sql`). Export master seed: `20260920210000_seed_export_master_options.sql`. Phase 62: vehicle assignment + export masters + VAT. Phase 61/61b: export docs + Incoterms. Earlier: Phase 60 presence; Phase 58 Tawk; Phase 53–57. **Migrations already applied on remote** — app deploy ships code only. See `supabase/migrations/`.

## Known gaps / operator actions

1. **Google Search Console** — confirm ownership via HTML tag in `app/layout.tsx` (`verification.google`), then **Request indexing** for key URLs. Favicon in SERPs can take days.
2. **VAPID verify** — matching keys are already on Vercel (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`) and Supabase Edge (`VAPID_*`). This production deploy bakes the public key into the browser bundle. Confirm via `/admin/subscribers` → Subscribe this device → Send test push (`Push sent to N`). Client/send helpers no-op cleanly if the public key is ever unset. Do not commit `.env.local`.
3. **Supabase Auth leaked-password protection** — enable in dashboard (not code).
4. **Optional secrets** — Resend, WhatsApp, AI Gateway/OpenAI if those UIs should send.
5. **Tawk webhook (Phase 58)** — confirm `TAWK_WEBHOOK_SECRET`, function deploy `--no-verify-jwt`, and Tawk dashboard webhooks → `…/functions/v1/tawk-webhook`. Empty Needs attention usually means the dashboard webhook step — see `docs/Tawk.md`.
6. **Bank feeds** — CSV/manual only; no live Open Banking OAuth.
7. **Email newsletter list** — Marketing subscribers = `push_subscriptions` only. Campaign email segment uses `customers.email` + country.
8. **Automated E2E/unit tests** — still thin.
9. **Native admin app** — not built; Capacitor wraps public URL only.
10. **Manager HR location scope** — inventory/ops scoped by `allowed_stock_origins` (Phase 66); HR shift locations remain a global viewer (approvals deferred).
11. **Edge functions** — after this ship, ensure `admin-create-user` / `admin-update-user` are redeployed so Users UI persists `allowed_stock_origins`.

## Next recommended steps (safe order)

1. In Google Search Console: verify ownership → Request indexing (home, `/parts`, `/vehicles`, `/machinery`, `/blog`, `/reviews`).
2. After this deploy: `/admin/subscribers` Subscribe this device → Send test push; spot-check Deals/blog optional push.
3. Enable leaked-password protection.
4. Confirm Resend / WhatsApp / AI keys if those channels are in use.
5. Verify Tawk webhook end-to-end (test chat → Needs attention row).
6. Spot-check Phase 66: campaigns edit/audience/segment; Users assign manager stock locations; manager sees only assigned origins.
7. Spot-check Phase 67: portal customer with reserved stock → `/portal/reservations` list + invoice links.
8. Spot-check Phase 68: delete draft/cancelled export shipment; delete a test request ticket (intake kept); account-admin force-delete only when needed.
9. Spot-check Phase 69: seed Offices/Shifts; receive with office + tagged user; Unknown TTS → link customer; dashboard office breakdown; field agent **My remittances** only.
10. Spot-check Team Chat presence; Phase 61–65 stock/invoice/auction flows as needed.
11. Add Playwright smoke for public catalog + admin login when ready for quality gates.

## Doc map

| Doc | Purpose |
|---|---|
| [Modules](./Modules.md) | Implemented module matrix |
| [Roadmap](./Roadmap.md) | Phase history + remaining platform ideas |
| [PROJECT-AUDIT](./PROJECT-AUDIT.md) | Stack / structure audit snapshot |
| [User-Manual](./User-Manual.md) | Operator how-to |
| [Roles](./Roles.md) | RBAC matrix (admin/staff/field/accounts/manager) |
| [Tawk](./Tawk.md) | Public widget + Phase 58 webhook / Live chat |
| [PWA](./PWA.md) / [Mobile](./Mobile.md) | Installable app + Capacitor |
| [Deployment](./Deployment.md) | Vercel + Edge secrets |
| [Database](./Database.md) / [Security](./Security.md) | Data & authz |

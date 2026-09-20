# Current State

Verified checkpoint: **2026-09-20** (Phases **64–65**: invoice unallocate-delete + stock restore; `vehicles.stock_pool` owned vs auction stock + `/admin/auction-stock`; Phase 63 parts stock ops + reserve/RLS + export_shipment_parts + redesigned catalog lists; Phase 62 stock ops + export masters + VAT; Phase 61/61b Incoterms; Phase 58 Tawk + Phase 60 presence; Japan Aug ZIP + Dubai WA Sep 20 stock; SEO/GSC + Phase 57 machinery).

Canonical site: https://www.anshatradingco.com  
Supabase: `ydrnilquojvalhgifest` (ap-southeast-2)  
Hosting: Vercel project `anshanew`

## Completion snapshot

| Area | Approx. done | Notes |
|---|---|---|
| Public catalog + SEO exporter site | **~96%** | Parts/vehicles/**machinery**/categories/blog+SEO/`/reviews`/offers/markets; FOB/C&F/CIF quote strip when set; **GSC verification meta**; favicon/OG; cart & favorites; FX/clock; Deals; featured rotation; public Tawk widget |
| Staff ERP (purchase → GL → VAT/payroll) | **~97%** | Phases 28–38, 46–48, 50, 53–57, **61/61b**, **62–65**; owned vs auction vehicle pools; invoice unallocate-delete; vehicle + parts stock dashboards; export masters; field-agent reservation RLS; VAT Yes/No; doc-driven shipment status |
| Ops communications (chat/mail/email/WA/AI/Tawk) | **~96%** | Team Chat presence (Phase 60); Tawk widget + Live chat Needs attention (**admin + manager**); Phase 58 webhook mirror |
| Marketing (offers, campaigns, PWA push, subscribers) | **~80%** | Push **Edge VAPID secrets** often invalid until re-set correctly |
| Customer portal | **~75%** | Invoices + SOA; no remittance UX for customers |
| PWA / Capacitor | **~85%** | Named **Anshatradingco APP**; install CTAs; Capacitor shell docs; SW precaches favicon |
| Automated tests | **~10%** | CI lint/typecheck/build/brands; no Vitest/Playwright suite |
| Docs (this set) | **~99%** | Audit refresh 2026-09-20 (Phases 53–65 + stock loads + SEO/GSC) |

**Overall product maturity (shipping ERP + public exporter):** roughly **90–95%** of the Phase 1–65 roadmap that was chosen and built. Remaining work is polish, secrets hygiene, bank live feeds, deeper ESP/automation, manager location scope, and test coverage — not a greenfield rewrite.

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
- PWA: manifest **Anshatradingco APP**, SW, install CTAs, push opt-in
- Header: live Dubai time + AED→USD/EUR/JPY/PKR via `/api/fx`
- Vehicle galleries hide auction-sheet photos (`vehicle_photos.is_auction_sheet`); public RLS excludes them
- **Tawk.to** public chat widget (`components/public/tawk-to-chat.tsx`) when `NEXT_PUBLIC_TAWK_PROPERTY_ID` + `NEXT_PUBLIC_TAWK_WIDGET_ID` are set

### Staff ERP (`/admin`)
- Catalog (parts / **owned vehicles** / **Auction stock** / **Machinery & trucks** filter), customers, reservations, invoices, remittances
- **Vehicles** (`/admin/vehicles`) = `stock_pool = owned` only; **Auction stock** (`/admin/auction-stock`) = `auction_third_party`; transfer actions move units between pools (Japan-origin defaults to auction until purchased into owned)
- **Stock management** (`/admin/stock`) + **Parts stock** (`/admin/parts/stock`) + **Arrival Watch** (`/admin/stock/arrival-watch`) — dual columns: payment/stock status × shipment view status; vehicle stock ops load **owned** pool only (`lib/stock-ops.ts`, `lib/parts-stock-ops-data.ts`)
- Purchase: suppliers, PO, GRN, supplier payments
- **Export shipments** (`/admin/export-shipments`) — modes **DHL / RoRo / 20ft / 40ft**; PDF/image docs: BOL, export certificate, waybill, courier (one each) + **per-country inspection certificates**; Phase 62 **export master selects** (country/ports/vessel/voyage) + **document-driven status** (BOL → shipped/sailed, waybill/surrendered → delivered/arrived); Phase 63 **`export_shipment_parts`** + `part_ids` on create
- **Configuration** (`/admin/configuration`) — CRUD for `export_master_options`; Trade config remains at `/admin/trade-config`
- Landed cost
- Catalog Incoterm sell quotes: `price_fob` / `price_cf` / `price_cif` on parts & vehicles (admin create/edit + public strip)
- Reservations: **price term** (FOB/C&F/CIF), **shipment term**, **inspection Yes/No**, Phase 62–63 **VAT Yes/No**, requester name/role (sales/freelancer locked to own profile), ETD/ETA; `reserved_by` on vehicles **and parts**
- Invoices (Phase 61b/62/64): header `price_term` + `shipment_term`; optional per-line `price_term`; `vat_applicable`; A4 print + verify show terms; **delete** requires remittance unallocate first (`unallocate_invoice_remittances` / `unallocate_and_delete_invoice`); delete restores linked reserved/sold stock to **available**
- Bank accounts (+ CSV feed stub), expenses, VAT return, payroll/EOS, GL + reports + auto-post
- Requests, chat, mail, notifications
- **Team Chat** (`/admin/chat`) — green online dots + last-seen labels (Phase 60: Realtime presence channel `workspace-presence`, `admin_profiles.last_seen_at`, `touch_admin_last_seen`, `AdminPresenceProvider`)
- **Live chat** (`/admin/live-chat`) — Needs attention list + open-count badge + Tawk open shortcuts; **`admin` + `manager` only** (`canAccessLiveChat`; nav + `proxy.ts`). Not staff / sales / freelancer / accounts. Reply in Tawk dashboard; dismiss clears ANSHA only. Setup: `docs/Tawk.md`.
- Marketing: blog (Write/HTML/Preview), offers, campaigns, **PWA subscribers**, trade config
- Analytics, AI assistant, audit log (admin SELECT), WhatsApp, outbound email
- Admin chrome: Pakistan + Dubai clocks + FX strip
- Roles: `admin` | `staff` | `sales` | `freelancer` | `manager` | `accounts` (account-admin gates; Phases 54–55)
- Field agents (`sales` / `freelancer`): catalog lists, own-book customers, reserve, **draft proforma only**; Phase 62–63 RLS — see **available** + **own `reserved_by`** vehicles **and parts** only
- Accounts: receivables (approve draft→sent), remittances, related finance views — not full admin
- HR MVP: shift locations, Morning/Night assignments, attendance (`/admin/hr*`); manager = HR viewer
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
Through **Phase 65**. Phase 65: `vehicles.stock_pool` (`owned`|`auction_third_party`); Japan rows backfilled to auction (`20260920230000_phase_65_vehicle_stock_pool.sql`). Phase 64: `unallocate_invoice_remittances`, `delete_invoice_safely` (restore reserved/sold stock), `unallocate_and_delete_invoice` (`20260920220000_phase_64_invoice_unallocate_delete_stock_restore.sql`). Phase 63: parts `reserved_by` + reservation VAT/ETD/ETA/requester; field-agent scoped parts SELECT; reserve/proforma/release RPCs for parts; `export_shipment_parts` + `create_export_shipment` `part_ids`; requester_role includes `freelancer` (`20260920210000_phase_63_parts_stock_ops_sales_scope.sql`). Export master seed: `20260920210000_seed_export_master_options.sql` (+ `scripts/seed-export-masters.sql`). Phase 62: vehicle assignment + export masters + VAT + stock ops. Phase 61/61b: export docs + Incoterms. Earlier: Phase 60 presence; Phase 58 Tawk; Phase 53–57. **Migrations already applied on remote** — app deploy ships code only. See `supabase/migrations/`.

## Known gaps / operator actions

1. **Google Search Console** — after this deploy, confirm ownership via the HTML tag already in `app/layout.tsx` (`verification.google`), then **Request indexing** for key URLs. Favicon in SERPs can take days to update.
2. **VAPID Edge secrets** — push fails with invalid base64 if secrets were set with placeholders. Re-set real pair matching Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (see `docs/Deployment.md` / `docs/PWA.md`).
3. **Supabase Auth leaked-password protection** — enable in dashboard (not code).
4. **Optional secrets** — Resend, WhatsApp, AI Gateway/OpenAI if those UIs should send.
5. **Tawk webhook (Phase 58)** — code + migration + Edge function are in-repo. Confirm Supabase secret `TAWK_WEBHOOK_SECRET`, function deploy `--no-verify-jwt`, and Tawk dashboard Webhooks (Chat Start / Chat End / New ticket) point at `…/functions/v1/tawk-webhook`. If Needs attention stays empty, the dashboard webhook step is the usual gap — see `docs/Tawk.md`.
6. **Bank feeds** — CSV/manual only; no live Open Banking OAuth.
7. **Email newsletter list** — Marketing subscribers = `push_subscriptions` only (no separate email list table).
8. **Automated E2E/unit tests** — still thin.
9. **Native admin app** — not built; Capacitor wraps public URL only.
10. **Manager location scope** — HR viewer is global in v1; location-scoped approvals deferred.

## Next recommended steps (safe order)

1. In Google Search Console: verify ownership → Request indexing (home, `/parts`, `/vehicles`, `/machinery`, `/blog`, `/reviews`).
2. Fix VAPID Edge secrets and verify Deals push toast (`Push sent to N`).
3. Enable leaked-password protection.
4. Confirm Resend / WhatsApp / AI keys if those channels are in use.
5. Verify Tawk webhook end-to-end (test chat → Needs attention row); rotate Tawk account password if it was ever shared in chat.
6. Spot-check Team Chat presence: two admin sessions → green dots + last-seen when one leaves.
7. Spot-check Phase 61: export shipment PDF uploads; reservation price/shipment/inspection; invoice print + verify terms; public FOB/C&F/CIF strip.
8. Spot-check Phase 62: `/admin/stock` + Arrival Watch; Configuration export masters; field-agent only sees own reserved units; VAT Yes/No on reserve/proforma; BOL/waybill auto-advancing shipment status.
9. Spot-check Phase 63: `/admin/parts/stock`; reserve/release parts; field-agent parts RLS; export shipment with parts; locked requester fields for sales/freelancer; redesigned `/admin/parts` + `/admin/vehicles`.
10. Spot-check Phase 64: invoice delete blocked while allocations exist; Unallocate then Delete (or Unallocate & delete); linked vehicle/part returns to available.
11. Spot-check Phase 65: `/admin/vehicles` shows owned only; `/admin/auction-stock` shows Japan/third-party auction; transfer to owned / mark auction; stock ops stay owned-only.
12. Add Playwright smoke for public catalog + admin login when ready for quality gates.

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

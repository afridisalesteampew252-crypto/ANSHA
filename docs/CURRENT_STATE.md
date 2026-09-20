# Current State

Verified checkpoint: **2026-09-20** (SEO favicon + default OG + Google Search Console verification; Phase 57 machinery + Tawk widget; blog/`/reviews`).

Canonical site: https://www.anshatradingco.com  
Supabase: `ydrnilquojvalhgifest` (ap-southeast-2)  
Hosting: Vercel project `anshanew`

## Completion snapshot

| Area | Approx. done | Notes |
|---|---|---|
| Public catalog + SEO exporter site | **~96%** | Parts/vehicles/**machinery**/categories/blog+SEO/`/reviews`/offers/markets; **GSC verification meta**; `/favicon.ico` + brand icons; default OG `/images/og-default.jpg`; cart & favorites; FX/clock; Deals; featured rotation; public Tawk widget |
| Staff ERP (purchase → GL → VAT/payroll) | **~94%** | Phases 28–38, 46–48, 50, 53–57; field agents + accounts + HR |
| Ops communications (chat/mail/email/WA/AI/Tawk) | **~88%** | Tawk public widget + admin Live chat (**admin + manager only**); **Phase 58 webhook mirror = later** (not activated this ship) |
| Marketing (offers, campaigns, PWA push, subscribers) | **~80%** | Push **Edge VAPID secrets** often invalid until re-set correctly |
| Customer portal | **~75%** | Invoices + SOA; no remittance UX for customers |
| PWA / Capacitor | **~85%** | Named **Anshatradingco APP**; install CTAs; Capacitor shell docs; SW precaches favicon |
| Automated tests | **~10%** | CI lint/typecheck/build/brands; no Vitest/Playwright suite |
| Docs (this set) | **~99%** | Audit refresh 2026-09-20 (SEO/GSC + Phases 53–57 + Tawk widget + inventory + blog/reviews) |

**Overall product maturity (shipping ERP + public exporter):** roughly **88–93%** of the Phase 1–57 roadmap that was chosen and built. Remaining work is polish, secrets hygiene, bank live feeds, deeper ESP/automation, manager location scope, and test coverage — not a greenfield rewrite.

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
- PWA: manifest **Anshatradingco APP**, SW, install CTAs, push opt-in
- Header: live Dubai time + AED→USD/EUR/JPY/PKR via `/api/fx`
- Vehicle galleries hide auction-sheet photos (`vehicle_photos.is_auction_sheet`); public RLS excludes them
- **Tawk.to** public chat widget (`components/public/tawk-to-chat.tsx`) when `NEXT_PUBLIC_TAWK_PROPERTY_ID` + `NEXT_PUBLIC_TAWK_WIDGET_ID` are set

### Staff ERP (`/admin`)
- Catalog (parts / vehicles / **Machinery & trucks** filter), customers, reservations, invoices, remittances
- Purchase: suppliers, PO, GRN, supplier payments
- Export shipments, landed cost
- Bank accounts (+ CSV feed stub), expenses, VAT return, payroll/EOS, GL + reports + auto-post
- Requests, chat, mail, notifications
- **Live chat** (`/admin/live-chat`) — Tawk agent inbox shortcuts; **`admin` + `manager` only** (`canAccessLiveChat`; nav + `proxy.ts`). Not staff / sales / freelancer / accounts. **Webhook “Needs attention” mirror = later** (Phase 58 not activated).
- Marketing: blog (Write/HTML/Preview), offers, campaigns, **PWA subscribers**, trade config
- Analytics, AI assistant, audit log (admin SELECT), WhatsApp, outbound email
- Admin chrome: Pakistan + Dubai clocks + FX strip
- Roles: `admin` | `staff` | `sales` | `freelancer` | `manager` | `accounts` (account-admin gates; Phases 54–55)
- Field agents (`sales` / `freelancer`): catalog lists, own-book customers, reserve, **draft proforma only**
- Accounts: receivables (approve draft→sent), remittances, related finance views — not full admin
- HR MVP: shift locations, Morning/Night assignments, attendance (`/admin/hr*`); manager = HR viewer
- Catalog audit: part/vehicle activity in `audit_logs` (admin SELECT only)
- Vehicles: `vehicle_class` / `equipment_category` / `operating_hours` (Phase 57); auction-sheet badge + lightbox
- A4 invoice print: denser layout; verification code on the document face (with QR)

### Inventory ops (data loads, not schema phases)
- Japan stock ZIP: `scripts/import-japan-stock-vehicles.mjs` — **~35** chassis folders; SEO Make/Model/Year/Color; WebP photos; `A.*` → `is_auction_sheet` (report ~12 created / ~23 already present)
- WhatsApp parts: warehouse batch + Dubai Sep 20 batch (`scripts/import-whatsapp-parts*.mjs`) + **Japan key-fob / car-electronics** batch (`scripts/import-whatsapp-parts-keys.mjs`, **16** Japan-stock parts created; qty 1, price 0, `ask_for_quote`, SEO WebP)

### Edge Functions
`admin-create-user`, `admin-update-user`, `portal-create-access`, `send-web-push`, `send-outbound-email`, `send-whatsapp`, `remind-request-dues`

### Migrations
Through **Phase 57** (`vehicles.vehicle_class` / `equipment_category` / `operating_hours`). Also Phase 53–56 (payroll deletes, field agents/HR, accounts/proforma, auction sheets). See `supabase/migrations/`.

## Known gaps / operator actions

1. **Google Search Console** — after this deploy, confirm ownership via the HTML tag already in `app/layout.tsx` (`verification.google`), then **Request indexing** for key URLs. Favicon in SERPs can take days to update.
2. **VAPID Edge secrets** — push fails with invalid base64 if secrets were set with placeholders. Re-set real pair matching Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (see `docs/Deployment.md` / `docs/PWA.md`).
3. **Supabase Auth leaked-password protection** — enable in dashboard (not code).
4. **Optional secrets** — Resend, WhatsApp, AI Gateway/OpenAI if those UIs should send.
5. **Tawk webhook (Phase 58)** — **later**; code may exist unstaged/local — do not treat as live until migration + Edge secret + dashboard webhook are done.
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
5. **Later:** activate Tawk webhook mirror (Phase 58) when ready — see deferred notes in `docs/Deployment.md`.
6. Add Playwright smoke for public catalog + admin login when ready for quality gates.

## Doc map

| Doc | Purpose |
|---|---|
| [Modules](./Modules.md) | Implemented module matrix |
| [Roadmap](./Roadmap.md) | Phase history + remaining platform ideas |
| [PROJECT-AUDIT](./PROJECT-AUDIT.md) | Stack / structure audit snapshot |
| [User-Manual](./User-Manual.md) | Operator how-to |
| [Roles](./Roles.md) | RBAC matrix (admin/staff/field/accounts/manager) |
| [PWA](./PWA.md) / [Mobile](./Mobile.md) | Installable app + Capacitor |
| [Deployment](./Deployment.md) | Vercel + Edge secrets |
| [Database](./Database.md) / [Security](./Security.md) | Data & authz |

# Current State

Verified checkpoint: **2026-09-19** (production tip around `cc7902e` / later main).

Canonical site: https://www.anshatradingco.com  
Supabase: `ydrnilquojvalhgifest` (ap-southeast-2)  
Hosting: Vercel project `anshanew`

## Completion snapshot

| Area | Approx. done | Notes |
|---|---|---|
| Public catalog + SEO exporter site | **~90%** | Parts/vehicles/categories/blog/offers/markets; cart & favorites; FX/clock; Deals in nav |
| Staff ERP (purchase → GL → VAT/payroll) | **~92%** | Phases 28–38, 46–48, 50 in place; sales RBAC allowlist |
| Ops communications (chat/mail/email/WA/AI) | **~85%** | Secrets may still need Resend / WhatsApp / AI keys |
| Marketing (offers, campaigns, PWA push, subscribers) | **~80%** | Push **Edge VAPID secrets** often invalid until re-set correctly |
| Customer portal | **~75%** | Invoices + SOA; no remittance UX for customers |
| PWA / Capacitor | **~85%** | Named **Anshatradingco APP**; install CTAs; Capacitor shell docs |
| Automated tests | **~10%** | CI lint/typecheck/build/brands; no Vitest/Playwright suite |
| Docs (this set) | **~98%** | Audit refresh 2026-09-19 (CURRENT_STATE + linked docs) |

**Overall product maturity (shipping ERP + public exporter):** roughly **85–90%** of the Phase 1–52 roadmap that was chosen and built. Remaining work is polish, secrets hygiene, bank live feeds, deeper ESP/automation, and test coverage — not a greenfield rewrite.

## What exists now (high signal)

### Public
- Catalog: `/parts`, `/vehicles`, categories, home finder, inquiry + part request
- Deals: `/offers`, inventory-linked discounts on cards + detail (`site_offers.vehicle_id` / `part_id`)
- Markets: `/markets/[code]` + admin Trade config (rates / freight / import policy)
- Cart + favorites (localStorage inquiry list)
- Blog, banking, about, contact, invoice verify
- PWA: manifest **Anshatradingco APP**, SW, install CTAs, push opt-in
- Header: live Dubai time + AED→USD/EUR/JPY/PKR via `/api/fx`

### Staff ERP (`/admin`)
- Catalog, customers, reservations, invoices, remittances
- Purchase: suppliers, PO, GRN, supplier payments
- Export shipments, landed cost
- Bank accounts (+ CSV feed stub), expenses, VAT return, payroll/EOS, GL + reports + auto-post
- Requests, chat, mail, notifications
- Marketing: blog (Write/HTML/Preview), offers, campaigns, **PWA subscribers**, trade config
- Analytics, AI assistant, audit log, WhatsApp, outbound email
- Admin chrome: Pakistan + Dubai clocks + FX strip
- Roles: `admin` | `staff` | `sales` | `freelancer` | `manager` (+ account-admin gates; Phase 54 field agents + HR)
- HR MVP: shift locations, Morning/Night assignments, attendance (`/admin/hr*`)
- Catalog audit: part/vehicle activity in `audit_logs` (admin SELECT only)

### Edge Functions
`admin-create-user`, `admin-update-user`, `portal-create-access`, `send-web-push`, `send-outbound-email`, `send-whatsapp`, `remind-request-dues`

### Migrations
Through **Phase 56** (`vehicle_photos.is_auction_sheet` — Japan auction sheets admin-only). See `supabase/migrations/`.

## Known gaps / operator actions

1. **VAPID Edge secrets** — push fails with invalid base64 if secrets were set with placeholders. Re-set real pair matching Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (see `docs/Deployment.md` / `docs/PWA.md`).
2. **Supabase Auth leaked-password protection** — enable in dashboard (not code).
3. **Optional secrets** — Resend, WhatsApp, AI Gateway/OpenAI if those UIs should send.
4. **Bank feeds** — CSV/manual only; no live Open Banking OAuth.
5. **Email newsletter list** — Marketing subscribers = `push_subscriptions` only (no separate email list table).
6. **Automated E2E/unit tests** — still thin.
7. **Native admin app** — not built; Capacitor wraps public URL only.

## Next recommended steps (safe order)

1. Fix VAPID Edge secrets and verify Deals push toast (`Push sent to N`).
2. Enable leaked-password protection.
3. Confirm Resend / WhatsApp / AI keys if those channels are in use.
4. Batch public/admin UX only after secrets are healthy (save Vercel build minutes).
5. Add Playwright smoke for public catalog + admin login when ready for quality gates.

## Doc map

| Doc | Purpose |
|---|---|
| [Modules](./Modules.md) | Implemented module matrix |
| [Roadmap](./Roadmap.md) | Phase history + remaining platform ideas |
| [PROJECT-AUDIT](./PROJECT-AUDIT.md) | Stack / structure audit snapshot |
| [User-Manual](./User-Manual.md) | Operator how-to |
| [PWA](./PWA.md) / [Mobile](./Mobile.md) | Installable app + Capacitor |
| [Deployment](./Deployment.md) | Vercel + Edge secrets |
| [Database](./Database.md) / [Roles](./Roles.md) / [Security](./Security.md) | Data & authz |

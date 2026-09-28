# Architecture

ANSHA Trading is a single Next.js 16 App Router application backed by one Supabase project. Production data lives in that project. This document describes the running system, not a target rewrite.

## Surfaces

- Public website: `app/(public)/` — catalog, content, contact, banking, invoice QR verify
- Staff ERP: `app/admin/` — login plus operations workspace
- Customer portal: `app/portal/` — profile/settings, customer stock, invoices, remittances, per-currency SOA, reservations, and support (RLS-scoped)
- Web Push: `push_subscriptions` + Edge Function `send-web-push` (Phase 24)
- Outbound email: `outbound_email_log` + Edge Function `send-outbound-email` / Resend (Phase 39)
- Marketing campaigns: `marketing_campaigns` + `/admin/campaigns` Send now → push/email/offer hooks (Phase 49)
- Deals / inventory offers: `site_offers` with vehicle/part links (Phase 51) — `/admin/offers`, public cards via `use-inventory-deals`
- Trade / markets: `export_market_configs` + `site_trade_settings` (Phase 52) — `/admin/trade-config`, public `/markets/[code]`
- Field agents / HR / accounts (Phases 54–55): roles `sales`|`freelancer`|`manager`|`accounts`; HR `/admin/hr*`; draft proforma workflow
- Auction sheets (Phase 56): `vehicle_photos.is_auction_sheet` — public RLS hides; admin badge + lightbox
- Heavy machinery & trucks (Phase 57): `vehicles.vehicle_class` + public `/machinery` + admin class filters (`lib/vehicle-class.ts`)
- Remittances module (Phases 69–73): offices/shifts on users; Unknown TTS auto-confirm; Allocate To Stocks; Excel/CSV export
- Commissions (Phase 72): `commission_claims` + `/admin/commissions`
- Config masters (Phases 74–76): `auction_yards`, `shipping_companies`, `freight_charges`
- Bulk reserve (Phase 77): `bulk_reserve_stock` from catalog lists
- Customer auto ID (Phase 78): `customer_code_seq` (~48001+) + consignee fields
- Reports hub: `/admin/reports` (7 operational + financial) + Excel (`lib/reports/*`, `lib/export-excel.ts`)
- Multi-currency display: `lib/money.ts` + `components/money-breakdown.tsx` (All currencies stack; no FX mixing) on dashboard, analytics, invoices, admin SOA `#soa`, portal account
- Product JSON-LD: `lib/product-schema.ts` (valid `offers.price`; real aggregateRating/review only)
- Make Available / SOA clear: `private.sync_catalog_sold_state` SECURITY DEFINER (post-78)
- Home featured rotation: `lib/featured-rotation.ts` (10-minute buckets; 8 parts / 4 vehicles)
- Tawk.to: public widget + admin Live chat Needs attention (**admin + manager only**; Phase 58 webhook mirror)
- PWA subscribers admin: `/admin/subscribers` (ops) over `push_subscriptions`
- WhatsApp Cloud API: `whatsapp_message_log` + Edge Function `send-whatsapp` (Phase 40)
- AI ops assistant: `/admin/ai` + `POST /api/ai/chat` (Vercel AI SDK; server `AI_GATEWAY_API_KEY` / `OPENAI_API_KEY`) (Phase 42)
- Customer Android APK: Capacitor shell loads `/mobile`; staff Admin APK: separate Capacitor shell loads `/admin/dashboard`; both use the same Next.js deployment and Supabase project. Native FCM setup is documented separately in `docs/Mobile.md` and `docs/Admin-Android.md`
- Shared backend: Supabase Auth, PostgreSQL, Storage, Realtime, Edge Functions

Live status and completion %: [CURRENT_STATE.md](./CURRENT_STATE.md). Module matrix: [Modules.md](./Modules.md).

The public site is an installable PWA (Phase 22) on this same database. The customer and staff APKs are separate Capacitor shells that load their respective web routes; they do not create a second frontend or database. Portal and mobile data remain protected by the same Supabase Auth, RLS, and role checks.

## Request path

```
Browser or customer/admin Capacitor WebView
  → Next.js (Vercel)  [customer: /mobile; staff: /admin/dashboard]
    → proxy.ts for /admin/:path*
    → RSC / Client Components / GET /api/health / GET /api/fx / POST /api/ai/chat
    → Supabase JS (publishable/anon key) or Edge Function (service role, admin-only)
      → PostgreSQL / Storage / Auth / Realtime
```

## Dependency direction

- UI (`app/`, `components/`) may call `lib/supabase` and domain helpers
- Domain helpers (`lib/stock.ts`, `lib/catalog-image.ts`, `lib/site-config.ts`, `lib/vehicle-lifecycle.ts`, `lib/workspace-requests.ts`, `lib/chat-links.ts`, `lib/featured-rotation.ts`, `lib/vehicle-photos.ts`, `lib/vehicle-class.ts`, `lib/money.ts`, `lib/product-schema.ts`, `lib/export-excel.ts`, `lib/reports/*`, `lib/stock-linked-invoice.ts`, `lib/freight-charges.ts`) must not import UI
- Privileged Auth administration stays in `supabase/functions/*`
- Schema changes stay in `supabase/migrations/`
- Do not add a second ORM or a second database for a new surface

## Rendering

- Root and public layouts are Server Components
- Most catalog and admin pages are Client Components (`'use client'`) querying PostgREST
- Invoice verification is a Server Component calling `rpc('verify_invoice')`
- There are no Server Actions

## Session

`lib/supabase/client.ts` and `lib/supabase/server.ts` create SSR cookie clients. `proxy.ts` refreshes session cookies, requires `admin_profiles` membership for admin routes, and preserves cookies on redirects.

## Hosting

GitHub `main` deploys to Vercel. Preview deployments follow the GitHub integration. Canonical host is `www.anshatradingco.com`.

## Explicit non-goals of the current architecture

- Not a microservices split
- Not a separate admin SPA repo
- Not a fully native admin UI or offline-first native database
- Not Netlify-hosted

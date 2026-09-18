# Architecture

ANSHA Trading is a single Next.js 16 App Router application backed by one Supabase project. Production data lives in that project. This document describes the running system, not a target rewrite.

## Surfaces

- Public website: `app/(public)/` — catalog, content, contact, banking, invoice QR verify
- Staff ERP: `app/admin/` — login plus operations workspace
- Customer portal: `app/portal/` — login plus read-only invoices (Phase 23)
- Web Push: `push_subscriptions` + Edge Function `send-web-push` (Phase 24)
- Shared backend: Supabase Auth, PostgreSQL, Storage, Realtime, Edge Functions

Native Capacitor apps are not implemented. The public site is an installable PWA (Phase 22) on this same database. Portal and native wrappers must keep using this same database.

## Request path

```
Browser
  → Next.js (Vercel)
    → proxy.ts for /admin/:path*
    → RSC / Client Components / GET /api/health
    → Supabase JS (publishable/anon key) or Edge Function (service role, admin-only)
      → PostgreSQL / Storage / Auth / Realtime
```

## Dependency direction

- UI (`app/`, `components/`) may call `lib/supabase` and domain helpers
- Domain helpers (`lib/stock.ts`, `lib/catalog-image.ts`, `lib/site-config.ts`, `lib/vehicle-lifecycle.ts`, `lib/workspace-requests.ts`, `lib/chat-links.ts`) must not import UI
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
- Not Netlify-hosted

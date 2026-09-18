# PRD

## Product (current)

ANSHA Trading is a live global vehicle and automotive-parts exporter site plus a staff operations workspace.

Canonical public site: `https://www.anshatradingco.com`.

### Public outcomes

- Search and browse published parts and vehicles
- Submit inquiries and part-sourcing requests
- Read blog/about/contact
- View official banking details
- Verify invoice authenticity by QR UUID

### Staff outcomes

- Manage catalog, customers, invoices, remittances, imports
- Internal chat, mail, and notifications
- Assign request tickets (intake, BL, inspection, shipping) with due dates and private ticket files
- Link team chat conversations to vehicles, customers, invoices, and requests
- Provision staff users (admin role)

### Out of current product

Native admin rewrite, AI automation, WhatsApp Business API, outbound email.

Customer portal first slice is live (Phase 23): login + own invoices only. Public catalog is installable as a PWA (Phase 22) with Web Push for insights and deals (Phase 24). Capacitor shell MVP wraps the public production URL for iOS/Android (Phase 44); see `docs/Mobile.md`. Staff ERP remains online-only and is not cached offline.

## Users

- Anonymous buyers/importers
- Staff (`admin_profiles`)
- Admin staff (user management)

Customers in `customers` are CRM records, not logins.

## Constraints

- Production data must be preserved
- One business database
- Incremental change; no full rewrite
- Documented in `docs/Rules.md`

## Later vision (not committed scope)

Unified platform: public website + staff ERP + customer portal + PWA/native wrappers + notifications + export operations + AI, still on this Supabase project. See `docs/Roadmap.md`.

# PRD

## Product (current)

ANSHA Trading is a live global vehicle and automotive-parts exporter site plus a staff ERP and customer portal on one Next.js + Supabase stack.

Canonical public site: `https://www.anshatradingco.com`.  
Live checkpoint: [CURRENT_STATE.md](./CURRENT_STATE.md). Module matrix: [Modules.md](./Modules.md).

### Public outcomes

- Search and browse published **available** parts, vehicles, and machinery
- Submit inquiries and part-sourcing requests; cart/favorites (localStorage)
- Deals, markets (70 destinations), blog, reviews, about/contact
- View official banking details; verify invoice authenticity by QR UUID
- Installable PWA (**Anshatradingco APP**) with optional Web Push; Tawk widget when configured

### Staff outcomes

- Catalog (owned vs auction pools), purchase (PO/GRN), stock ops, export shipments, landed cost
- Customers (auto Customer ID), reservations (incl. bulk), invoices, remittances, commissions
- Finance: bank, expenses, GL, VAT, payroll/EOS, **reports hub** (7 ops + financial) + Excel
- Configuration: export masters, yards, shipping companies, freight charges
- Inbox: inquiries, requests, Team Chat (+ presence), mail, email, WhatsApp, Live chat (admin+manager)
- Marketing: blog, offers, campaigns, PWA subscribers, trade config
- HR MVP; role-gated workspace (`admin`|`staff`|`sales`|`freelancer`|`manager`|`accounts`)
- AI ops assistant (optional keys); audit log (admin)

### Customer portal outcomes

- Login via `customer_profiles`; own reservations, non-draft invoices, SOA (incl. Buying details)

### Out of current product

- Native admin rewrite (Capacitor wraps **public** URL only)
- Live Open Banking OAuth (CSV bank import stub only)
- Full ESP automation (open/click tracking, drip cron)
- Separate email newsletter list
- Automated E2E/unit test suite

## Users

- Anonymous buyers/importers
- Staff (`admin_profiles` with roles above)
- Portal customers (`customer_profiles` → `customers`)

CRM `customers` are not logins until portal access is enabled by an admin.

## Constraints

- Single Supabase project (`spmnxwhwsgpaoiklezex`); no second database for a new surface
- RLS is the API; no Server Actions
- Forward-only migrations; never reset production
- Secrets never in `NEXT_PUBLIC_*` or docs


## Catalog pricing and freight estimator (current capability)

- Public vehicle pages display FOB as the listing price and any available C&F/CIF terms.
- Staff can edit vehicle term prices in bulk and maintain reusable make/model M³ specifications.
- Staff can configure freight routes and estimate RoRo by M³ or divide a 40-ft total among 6 small, 4 large, or 3 XL vehicles.
- The calculator suggests configured destination countries and country-specific ports; M³ class is automatic by default and manually overridable.

See [Catalog Prices and Freight](./Catalog-Freight-Pricing.md).

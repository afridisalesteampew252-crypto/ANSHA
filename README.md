# ANSHA

ANSHA is a global automotive parts and vehicle catalog with a public website and a protected internal management dashboard.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-svw4brde)

## Technology

- Next.js, React, TypeScript, and Tailwind CSS
- Supabase Database, Auth, and Storage
- Vercel hosting
- GitHub source control

## Project status

| Phase | Scope | Status |
|---|---|---|
| 1 | Supabase authorization and storage hardening | Complete |
| 2 | Server-side admin authentication and route protection | Next |
| 3 | Dependency modernization, CI, and quality gates | Planned |
| 4 | Global SEO and exporter schema for parts and vehicles | Planned |
| 5 | Catalog, inquiries, media, and bulk import/export workflows | Planned |
| 6 | Vercel environments, deployments, domains, and runtime validation | Blocked by connector access |
| 7 | Final testing, performance, SEO validation, backups, and launch | Planned |

## Phase 1 completion

Completed on 2026-09-15.

- Restricted vehicle, vehicle-photo, blog, category, customer-request, and media-management operations to approved users in `admin_profiles`.
- Limited anonymous vehicle and vehicle-photo queries to published inventory.
- Protected customer part-request details from ordinary authenticated users.
- Restricted vehicle and blog Storage writes to approved staff.
- Limited uploads to JPEG, PNG, WebP, GIF, and AVIF images with a 10 MiB maximum.
- Fixed the remaining mutable trigger-function search path.
- Removed direct execution permission from internal trigger functions.
- Applied and verified migration `phase_1_security_authorization_hardening` on the linked Supabase project.

Manual security action still required: enable leaked-password protection in Supabase Auth settings.

## Environment variables

Create a local `.env.local` file. Never commit real credentials.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Only public/publishable Supabase keys belong in browser variables. Never expose a Supabase secret or service-role key through a `NEXT_PUBLIC_` variable.

## Database migrations

Database changes must be added under `supabase/migrations/`, tested transactionally, applied to the linked Supabase project, verified with read-only queries, and committed with the phase documentation.

Latest migration:

```text
supabase/migrations/20260915203819_phase_1_security_authorization_hardening.sql
```

## Planned global SEO and exporter schema

Phase 4 will add structured data for:

- Vehicle makes, models, variants, chassis and engine codes
- OEM, manufacturer, interchange, and supersession part numbers
- Part-to-vehicle compatibility
- Export markets, countries, ports, shipping methods, and availability
- Search-friendly landing pages and canonical slugs
- SEO titles, descriptions, indexing controls, and redirects
- Schema.org Product, Vehicle, Organization, Breadcrumb, and Article JSON-LD
- XML sitemaps for parts, vehicles, categories, brands, countries, and blog posts
- Bulk CSV/Excel import and export mappings
- Search aliases, misspellings, and normalized manufacturer names

The schema and pages will target useful buyer searches such as OEM part number, chassis code, engine code, make/model/year, used auto parts exporter, and vehicle exporter by destination market.

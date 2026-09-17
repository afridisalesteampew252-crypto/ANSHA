# Phase 13 — Public Catalog Redesign

## Scope

This phase redesigns the public-facing ANSHA TRADING website in place. It is an original implementation informed by modern automotive catalog patterns. No third-party theme code, content, product data, brand assets, or proprietary components are copied.

## Existing-system audit

The redesign preserves:

- Supabase project, tables, storage, RLS, Auth, and Edge Functions
- Admin Panel and all administrative workflows
- Existing public URLs, dynamic slugs, SEO routes, and canonical domain
- Parts, vehicles, categories, manufacturers, inquiries, request forms, and blog data
- Existing catalog filters and WhatsApp inquiry actions
- Light/dark theme support

Production data was inspected read-only. At the start of this phase the public catalog contained 12 published parts with photos, six active inventory brands, 12 categories, one published article, and no published vehicles. The redesigned empty states therefore direct customers to real sourcing workflows instead of displaying invented products.

## Design direction

The visual system remains specific to ANSHA:

- Black, white, and ANSHA red palette
- Three-level desktop automotive header
- Compatibility-led catalog finder
- Dense category and manufacturer discovery
- Higher-information inventory cards
- Export-oriented trust and service messaging
- Responsive filters and phone-first navigation
- Honest loading and empty states
- Reduced-motion and keyboard-focus support

## Changed public surfaces

- Global public header and navigation
- Homepage
- Parts catalog
- Vehicle showroom
- Category directory
- Shared part and vehicle cards
- Public responsive design tokens and utilities
- Mobile bottom navigation

## Explicitly unchanged

- Database schema and production records
- Authentication and authorization
- Admin layout and admin functionality
- API and Edge Function contracts
- Storage bucket structure
- Import, inquiry, communications, and invoicing workflows

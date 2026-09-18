# Database

PostgreSQL on the active Supabase project `ANSHA` (`ydrnilquojvalhgifest`) is the system of record. All application features share this database.

## Rules

- Forward-only migrations in `supabase/migrations/`
- Prefer `ADD COLUMN` and new tables over `DROP COLUMN` / `DROP TABLE`
- Do not reset production
- RLS must remain enabled on exposed tables
- Test migrations off production before apply
- Production has both `20260909192712_001_initial_schema` and `20260909194958_001_initial_schema` recorded as applied. Keep both files. Deleting either would desync git from `schema_migrations`.

Latest migration in the repository: `20260917180500_phase_17_advisor_indexes.sql`.

## Entity groups

### Identity

`admin_profiles` — PK `id` = `auth.users.id`. Columns: `full_name`, `role` (`admin`|`staff`), `email`, `avatar_url`, `created_at`.

### Catalog

- `categories` — name/slug unique, `sort_order`, optional `image_url`
- `parts` — unique `part_code`/`slug`, pricing, publish flags, SEO/export arrays (Phase 4), `stock_origin`, `stock_status`, `sold_at`, `sold_by`
- `part_photos`, `part_compatibility`
- `vehicles` — unique `slug`; unique chassis/stock numbers where indexed; same stock fields as parts
- `vehicle_photos`

### Public intake

- `inquiries` — optional `part_id`, status `new|read|responded|closed`
- `part_requests` — sourcing request, status `new|reviewed|fulfilled|closed`

### Content

- `blog_categories`, `blog_posts` (`draft|published|archived`)

### CRM and imports

- `customers` — `customer_code`, contact fields, `is_active`, optional `avatar_url`
- `import_jobs`, `import_rows` — Excel/ZIP audit

### Communications

- `chat_conversations` (`direct`|`group`), `chat_participants`, `chat_messages`, `chat_attachments`
- `internal_mail`, `internal_mail_recipients`, `internal_mail_attachments`
- `admin_notifications`

Chat rows are not foreign-keyed to vehicles, invoices, or customers.

### Finance

- `invoice_company_settings`, `invoice_sequences`
- `invoices` — sequential `invoice_number`, document types, tax/payment totals, QR verification fields (Phase 14), provider submission fields
- `invoice_items` — optional `part_id` / `vehicle_id` / `inventory_reference`
- `invoice_payments`
- `remittance_sequences`, `remittances`, `remittance_documents`, `remittance_allocations`
- `supplier_invoices` — private file metadata

Triggers recalculate invoice balances and sync remittance-linked payments. Do not bypass them with ad-hoc SQL in the app.

## Stock model (vehicles and parts)

`stock_origin`: `japan`, `dubai`, `singapore`, `china`, `thailand`, `taiwan`.

`stock_status`: `available`, `reserved`, `sold`.

`private.sync_catalog_sold_state` stamps `sold_at`/`sold_by` on transition to `sold` and clears them otherwise.

This is not an auction/yard/port lifecycle. Any lifecycle addition must be additive.

## Indexes

Covering indexes exist for published catalog, FKs, search trigrams, finance lookups, and chat/mail. Supabase performance advisors report many unused indexes; treat that as low-traffic evidence, not a drop list.

## Type generation

Hand-written `lib/types.ts` covers public tables through Phase 17. Generated types are not checked in. New modules must extend `lib/types.ts` to match migrations.

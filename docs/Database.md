# Database

PostgreSQL on the active Supabase project `ANSHA` (`ydrnilquojvalhgifest`) is the system of record. All application features share this database.

## Rules

- Forward-only migrations in `supabase/migrations/`
- Prefer `ADD COLUMN` and new tables over `DROP COLUMN` / `DROP TABLE`
- Do not reset production
- RLS must remain enabled on exposed tables
- Test migrations off production before apply
- Production has both `20260909192712_001_initial_schema` and `20260909194958_001_initial_schema` recorded as applied. Keep both files. Deleting either would desync git from `schema_migrations`.

Latest migration in the repository: `20260918110000_phase_24_pwa_push.sql`.

## Entity groups

### Identity

`admin_profiles` — PK `id` = `auth.users.id`. Columns: `full_name`, `role` (`admin`|`staff`), `email`, `avatar_url`, `created_at`.

`customer_profiles` — PK `id` = `auth.users.id`, unique `customer_id` → `customers`. Portal identity only; never place portal users in `admin_profiles`.

### Catalog

- `categories` — name/slug unique, `sort_order`, optional `image_url`
- `parts` — unique `part_code`/`slug`, pricing, publish flags, SEO/export arrays (Phase 4), `stock_origin`, `stock_status`, `sold_at`, `sold_by`
- `part_photos`, `part_compatibility`
- `vehicles` — unique `slug`; unique chassis/stock numbers where indexed; same stock fields as parts; `lifecycle_stage` (`unassigned`|`auction`|`yard`|`port`|`sold`)
- `vehicle_photos`
- `vehicle_lifecycle_events` — append-only stage changes and workflow events (BL, inspection, RORO, etc.)

### Public marketing (Phase 24)

- `push_subscriptions` — Web Push endpoints (`endpoint` unique), `notify_insights` / `notify_deals`
- `site_offers` — published deals/offers with `href`, `summary`, `published_at`
### Public intake

- `inquiries` — optional `part_id`, status `new|read|responded|closed`
- `part_requests` — sourcing request, status `new|reviewed|fulfilled|closed`

### Staff requests

- `workspace_requests` — assignable tickets (`inquiry`|`part_request`|`bl`|`inspection`|`shipping`|`other`) with status `open|in_progress|waiting|done|cancelled`, optional assignee/due date, optional links to intake/vehicle/customer
- `workspace_request_events` — append-only opened/status/assignment/due/note/title/attachment history
- `workspace_request_attachments` — private file metadata for ticket documents (storage prefix `requests/{request_id}/` in `internal-files`)

Intake rows stay as submitted. One ticket per inquiry and per part request (unique indexes). Mutations go through RPCs `create_workspace_request`, `update_workspace_request`, `record_workspace_request_event`, `register_workspace_request_attachment`, and `delete_workspace_request_attachment`.

### Content

- `blog_categories`, `blog_posts` (`draft|published|archived`)

### CRM and imports

- `customers` — `customer_code`, contact fields, `is_active`, optional `avatar_url`
- `import_jobs`, `import_rows` — Excel/ZIP audit

### Communications

- `chat_conversations` (`direct`|`group`), `chat_participants`, `chat_messages`, `chat_attachments`
- `chat_conversation_links` — optional links from a conversation to vehicle/customer/inquiry/invoice/request
- `internal_mail`, `internal_mail_recipients`, `internal_mail_attachments`
- `admin_notifications`

Chat stays one product. Links are additive metadata; mutations go through `link_chat_conversation` / `unlink_chat_conversation`.

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

`lifecycle_stage` (vehicles only): `unassigned`, `auction`, `yard`, `port`, `sold`.

Recommended operational path: Auction → Yard → Port → Sold. Commercial `stock_status` remains independent. Moving lifecycle to `sold` via `transition_vehicle_lifecycle` also sets `stock_status = sold`. Workflow actions (BL, inspection, RORO, etc.) are rows in `vehicle_lifecycle_events`, not free-text status fields.

`private.sync_catalog_sold_state` stamps `sold_at`/`sold_by` on transition to `sold` and clears them otherwise.

This is not an auction/yard/port rewrite of availability. Lifecycle was added beside stock.

## Indexes

Covering indexes exist for published catalog, FKs, search trigrams, finance lookups, and chat/mail. Supabase performance advisors report many unused indexes; treat that as low-traffic evidence, not a drop list.

## Type generation

Hand-written `lib/types.ts` covers public tables through Phase 24. Generated types are not checked in. New modules must extend `lib/types.ts` to match migrations.

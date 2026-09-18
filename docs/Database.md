# Database

PostgreSQL on the active Supabase project `ANSHA` (`ydrnilquojvalhgifest`) is the system of record. All application features share this database.

## Rules

- Forward-only migrations in `supabase/migrations/`
- Prefer `ADD COLUMN` and new tables over `DROP COLUMN` / `DROP TABLE`
- Do not reset production
- RLS must remain enabled on exposed tables
- Test migrations off production before apply
- Production has both `20260909192712_001_initial_schema` and `20260909194958_001_initial_schema` recorded as applied. Keep both files. Deleting either would desync git from `schema_migrations`.

Latest migration in the repository includes Phase 37 payroll (`20260918260000_phase_37_payroll.sql`); parallel Phase 34/35/36/38 migrations may also be present.

## Entity groups

### Identity

`admin_profiles` — PK `id` = `auth.users.id`. Columns: `full_name`, `role` (`admin`|`staff`|`sales`), `email`, `avatar_url`, `is_active`, `created_at`.

`customer_profiles` — PK `id` = `auth.users.id`, unique `customer_id` → `customers`. Portal identity only; never place portal users in `admin_profiles`.

### Catalog

- `categories` — name/slug unique, `sort_order`, optional `image_url`
- `parts` — unique `part_code`/`slug`, pricing, publish flags, SEO/export arrays (Phase 4), `stock_origin`, `stock_status`, `sold_at`, `sold_by`; Phase 28 cost: `purchase_price`, `purchase_currency`, `purchase_date`, `supplier_id`, `supplier_invoice_id`, `landed_cost`, `reserved_customer_id`
- `part_photos`, `part_compatibility`
- `vehicles` — unique `slug`; unique chassis/stock numbers where indexed; same stock fields as parts; `lifecycle_stage` (`unassigned`|`auction`|`yard`|`port`|`sold`); Phase 28 cost/reservation columns as on parts
- `vehicle_photos`
- `suppliers` — master (`supplier_code`, TRN, country, currency, …); ops RLS
- `purchase_orders` / `purchase_order_lines` — PO number, VAT, terms; match snapshot vs GRN/supplier invoices/payments
- `supplier_payments` / `supplier_payment_allocations` — AP payments allocated to PO or supplier invoice file
- `inventory_receipts` / `inventory_receipt_lines` — GRN into existing vehicle/part rows; optional `supplier_invoice_id` and `purchase_order_id`
- `export_shipments` / `export_shipment_vehicles` — booking/BL header (EXP- numbers) + vehicle lines; ops RLS; status hooks into lifecycle events
- `landed_cost_packs` / `landed_cost_charges` / `landed_cost_allocations` — import charge packs (LC- numbers); post rolls into stock `landed_cost`; ops RLS
- `bank_accounts` / `bank_transactions` — ops bank ledger (BNK-/BTXN-); reconcile flags; ops RLS
- `expense_categories` / `expenses` — operating expenses (OPEX- numbers); draft/posted/cancelled; optional soft `bank_account_id`; ops RLS
- `vat_return_periods` — optional saved VAT return pack snapshots (date range + jsonb summary); ops RLS; RPCs `get_vat_return_summary` / `save_vat_return_period`
- `employees` / `leave_requests` / `payroll_runs` / `payroll_lines` — HR-lite payroll (PR- numbers); leave pending/approved/rejected; optional soft `bank_account_id`; ops RLS; EOS estimate RPC is planning-only
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
- `bank_accounts` / `bank_transactions` — ops bank ledger (BNK-/BTXN-); opening balance + manual in/out; reconcile flags; optional remittance/supplier_payment/expense links; ops RLS

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

Hand-written `lib/types.ts` covers public tables through Phase 37 (payroll) and other concurrent ERP phases as they land. Generated types are not checked in. New modules must extend `lib/types.ts` to match migrations.

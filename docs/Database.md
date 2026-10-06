# Database

PostgreSQL on the active Supabase project `ANSHA` (`spmnxwhwsgpaoiklezex`) is the system of record. All application features share this database.

## Rules

- Forward-only migrations in `supabase/migrations/`
- Prefer `ADD COLUMN` and new tables over `DROP COLUMN` / `DROP TABLE`
- Do not reset production
- RLS must remain enabled on exposed tables
- Test migrations off production before apply
- Production has both `20260909192712_001_initial_schema` and `20260909194958_001_initial_schema` recorded as applied. Keep both files. Deleting either would desync git from `schema_migrations`.

Latest migrations in the repository include Phases **72–78** (commission claims, remittance auto-confirm, auction yards, shipping companies, freight charges, bulk reserve, customer auto ID) plus Phases 69–71 remittances / allocate / clear-reservation / SOA sync, plus post-78 **Make Available SECURITY DEFINER** and **security advisor hardening**. These are **already applied on production** — keep the files so git matches `schema_migrations`. Earlier ERP phases remain under `supabase/migrations/`.

Key recent files: `20260922010000_fix_sync_catalog_sold_state_security_definer.sql`, `20260922020000_security_advisor_hardening.sql`, `20260921060000_phase_72_commission_claims.sql`, `20260921070000_phase_73_remittance_auto_confirm.sql`, `20260921090000_phase_74_yards_config.sql`, `20260921100000_phase_75_shipping_companies.sql`, `20260921110000_phase_76_freight_charges.sql`, `20260921120000_phase_77_bulk_reserve_stock.sql`, `20260921130000_phase_78_customer_auto_id.sql`, plus `20260921050000_soa_sync_on_reservation_release.sql` and `20260921040000_clear_reservation_on_available.sql`.

## Entity groups

### Identity

`admin_profiles` — PK `id` = `auth.users.id`. Columns: `full_name`, `role` (`admin`|`staff`|`sales`|`freelancer`|`manager`|`accounts`), `email`, `avatar_url`, `is_active`, `created_at`, Phase 60 `last_seen_at` (UTC heartbeat for Team Chat offline labels), Phase 66 `allowed_stock_origins` (`text[]` for managers; empty = no inventory), Phase 70 `office_id` / `shift_id` (FK → remittance picklists). RPC `touch_admin_last_seen()` — **authenticated** workspace users only (anon EXECUTE revoked; migration `20260922020000_security_advisor_hardening.sql`).

`customer_profiles` — PK `id` = `auth.users.id`, unique `customer_id` → `customers`. Portal identity only; never place portal users in `admin_profiles`. Phase 67: portal customers SELECT own reserved/sold stock (`reserved_customer_id`) + photos; RPC `get_my_reservations()` (sanitized list with linked non-draft invoices).

### Catalog

- `categories` — name/slug unique, `sort_order`, optional `image_url`
- `parts` — unique `part_code`/`slug`, pricing, publish flags, SEO/export arrays (Phase 4), `stock_origin`, `stock_status`, `sold_at`, `sold_by`; Phase 28 cost: `purchase_price`, `purchase_currency`, `purchase_date`, `supplier_id`, `supplier_invoice_id`, `landed_cost`, `reserved_customer_id`; Phase 61 Incoterm quotes `price_fob`/`price_cf`/`price_cif`; reservation terms `reservation_price_term`/`reservation_shipment_term`/`reservation_inspection_required` (61b); Phase 63 `reserved_by` + VAT/ETD/ETA/requester columns (parity with vehicles Phase 62); field-agent SELECT scoped to available + own reserved rows
- `part_photos`, `part_compatibility`
- `vehicles` — unique `slug`; unique chassis/stock numbers where indexed; same stock fields as parts; `lifecycle_stage` (`unassigned`|`auction`|`yard`|`port`|`sold`); Phase 28 cost/reservation columns as on parts; Phase 57 `vehicle_class` (`passenger`\|`commercial_truck`\|`heavy_machinery`, default `passenger`), optional `equipment_category`, optional `operating_hours`; Phase 61/61b same Incoterm + reservation term columns as parts; Phase 62 `reserved_by`, `reservation_vat_applicable`, `reservation_etd`/`reservation_eta`, `reservation_requester_name`/`reservation_requester_role`; Phase 65 `stock_pool` (`owned`\|`auction_third_party`, default `owned`; Japan-origin backfilled to `auction_third_party`); field-agent SELECT scoped to available + own reserved rows
- `vehicle_photos` — includes `is_auction_sheet` (Phase 56; Japanese auction sheets / typically `A.*`); public SELECT policy requires `is_auction_sheet = false`
- `suppliers` — master (`supplier_code`, TRN, country, currency, …); ops RLS
- `purchase_orders` / `purchase_order_lines` — PO number, VAT, terms; match snapshot vs GRN/supplier invoices/payments
- `supplier_payments` / `supplier_payment_allocations` — AP payments allocated to PO or supplier invoice file
- `inventory_receipts` / `inventory_receipt_lines` — GRN into existing vehicle/part rows; optional `supplier_invoice_id` and `purchase_order_id`
- `export_shipments` / `export_shipment_vehicles` / `export_shipment_parts` — booking/BL header (EXP- numbers) + vehicle lines + Phase 63 part lines; ops RLS; status hooks into lifecycle events; Phase 61 `mode` ∈ `dhl`|`roro`|`container_20ft`|`container_40ft`; Phase 62 document-driven status automation; `create_export_shipment` accepts `part_ids`; Phase 68 `delete_export_shipment(uuid, boolean)` (ops draft/cancelled; account-admin `p_force`; cascades children + storage)
- `export_shipment_documents` — Phase 61 PDF/image metadata (`bill_of_lading`|`export_certificate`|`waybill`|`courier`|`inspection_certificate`); inspection rows require `country_code`; single-slot unique index for non-inspection types; storage bucket `export-shipment-documents`; ops RLS
- `export_master_options` — Phase 62 Configuration masters (`destination_country`|`loading_port`|`destination_port`|`vessel`|`voyage`); workspace read; ops write
- `auction_yards` — Phase 74 Configuration | Yards (`auction_name`, `port`, `yard`, `tentative_days`); workspace read; ops write
- `shipping_companies` — Phase 75 Configuration | Shipping Companies (`company_name` + `vessel_name` pairs); workspace read; ops write
- `freight_charges` — Phase 76 route/mode rates (`source_*` / `destination_*`, `shipment_type` dhl|roro|container_20ft|container_40ft, `freight_charge`, currency, contact fields); workspace read; receivables write (`can_manage_receivables`)
- `landed_cost_packs` / `landed_cost_charges` / `landed_cost_allocations` — import charge packs (LC- numbers); post rolls into stock `landed_cost`; ops RLS
- `bank_accounts` / `bank_transactions` �?? ops bank ledger (BNK-/BTXN-); reconcile flags; ops RLS
- `bank_feed_connections` - Phase 50 feed placeholders (`manual`|`pending_provider`); not live Open Banking; ops RLS
- `expense_categories` / `expenses` �?? operating expenses (OPEX- numbers); draft/posted/cancelled; optional soft `bank_account_id`; ops RLS
- `expense_attachments` — invoice/receipt files per expense (PDF/JPG/PNG/WEBP, ≤10 MB, ≤25 per expense) stored in private bucket `internal-files` under `expenses/<expense_id>/`; SELECT via `private.can_manage_receivables()` (same as `expenses`); writes only via `register_expense_attachment` / `delete_expense_attachment` (audit `attachment_add` / `attachment_remove` on entity `expense`); additive storage policies `expense_files_*`; cancelled expenses read-only
- `vat_return_periods` �?? optional saved VAT return pack snapshots (date range + jsonb summary); ops RLS; RPCs `get_vat_return_summary` / `save_vat_return_period`
- `employees` / `leave_requests` / `payroll_runs` / `payroll_lines` / `eos_estimate_logs` — HR-lite payroll (PR- numbers); leave balance days + optional deduct on annual approve; UAE-oriented indicative EOS calculator (ops RLS). EOS is planning-only — not legal advice / not labour-law compliance.
- `gl_accounts` / `gl_journals` / `gl_journal_lines` — chart of accounts + journals (JE- numbers); draft/posted/reversed; `source_module`/`source_id` for auto-post idempotency (Phase 46); ops RLS; report RPCs `gl_trial_balance` / `gl_profit_and_loss` / `gl_balance_sheet`
- `ai_chat_threads` / `ai_chat_messages` ? ops AI assistant history; owner-scoped RLS; grounding via `get_ai_ops_grounding`
- `get_ops_analytics_summary(from,to)` ? Phase 41 jsonb KPIs (sales/AR, stock, requests; ops also remittances + open POs + GRNs). Workspace-executable; sales scoped to own book
- `audit_logs` — append-only activity log (actor, action, entity_type, entity_id, metadata); writes via `private.write_audit_log`; triggers on invoice status, vehicle/part catalog activity (Phase 54), remittance allocations; **admin SELECT only** (Phase 54)
- `shift_locations` / `shift_assignments` / `attendance_records` — HR MVP (Phase 54); ops write; `is_hr_viewer()` SELECT
- `vehicle_lifecycle_events` — append-only stage changes and workflow events (BL, inspection, RORO, etc.)
- `vehicle_lifecycle_event_attachments` — private file metadata for lifecycle event documents (storage prefix `vehicles/{vehicle_id}/lifecycle/{event_id}/` in `internal-files`)

### Public marketing (Phase 24 + 51–52)

- `push_subscriptions` — Web Push endpoints (`endpoint` unique), `notify_insights` / `notify_deals`
- `site_offers` — published deals/offers with `href`, `summary`, `published_at`; Phase 51 adds optional `vehicle_id` / `part_id`, `discount_percent`, `sale_price` (display-only on public cards; does not rewrite ERP stock price)
- `export_market_configs` — per-country export market policy / notes (Phase 52); drives `/markets/[code]` together with static catalog in `lib/export-markets.ts` (**70** destinations)
- `site_trade_settings` — FX reference rates + freight notes (Phase 52); admin `/admin/trade-config`

### Marketing campaigns (Phase 49 + 66)

- `marketing_campaigns` — ops-only: `name`, `channel` (`push`|`email`|`offer`), `status` (`draft`|`scheduled`|`sent`), `payload` jsonb (audience countries/origins, blog/vehicle/part links), `sent_at`, `sent_count` (Phase 66 — delivery count only, no opens). Send hooks: `send-web-push` / `send-outbound-email` (test + country segment). Not full ESP; `scheduled` is a label only.

### Manager location scope (Phase 66)

- `admin_profiles.allowed_stock_origins` — `text[]` of `stock_origin` values for `role = manager`. Empty = no inventory rows. Helpers: `private.is_location_manager()`, `private.manager_stock_origins()`, `private.can_access_stock_origin(text)`. RLS filters vehicles/parts; managers get SELECT on export shipments linked to in-scope inventory.

### Public intake

- `inquiries` �?? optional `part_id`, status `new|read|responded|closed`
- `part_requests` �?? sourcing request, status `new|reviewed|fulfilled|closed`

### Staff requests

- `workspace_requests` �?? assignable tickets (`inquiry`|`part_request`|`bl`|`inspection`|`shipping`|`other`) with status `open|in_progress|waiting|done|cancelled`, optional assignee/due date, optional links to intake/vehicle/customer
- `workspace_request_events` �?? append-only opened/status/assignment/due/note/title/attachment history
- `workspace_request_attachments` �?? private file metadata for ticket documents (storage prefix `requests/{request_id}/` in `internal-files`)

Intake rows stay as submitted. One ticket per inquiry and per part request (unique indexes). Mutations go through RPCs `create_workspace_request`, `update_workspace_request`, `record_workspace_request_event`, `register_workspace_request_attachment`, `delete_workspace_request_attachment`, and Phase 68 `delete_workspace_request` (hard-delete ticket; events/attachments/reminders CASCADE; storage cleaned best-effort; linked `inquiries` / `part_requests` kept).

### Content

- `blog_categories`, `blog_posts` (`draft|published|archived`)

### CRM and imports

- `customers` — `customer_code` (Phase 78: default from `customer_code_seq`, human range ~48001+; existing codes preserved), contact fields, `is_active`, optional `avatar_url`, optional consignee fields (`consignee_name` / `company` / `phone` / `email` / `address` / `country` / `notes`); BEFORE INSERT trigger `private.prepare_customer`
- `import_jobs`, `import_rows` — Excel/ZIP audit
- `commission_claims` — Phase 72 sales commission on sold vehicles/parts (`pending`|`approved`|`paid`|`rejected`); claimant SELECT own; ops/accounts/manager SELECT; writes via `claim_stock_commission` / `review_commission_claim` only
- `bulk_reserve_stock(vehicle_ids, part_ids, …)` — Phase 77 SECURITY DEFINER; loops `reserve_vehicle_stock` / `reserve_part_stock`; returns succeeded/failed arrays (partial success kept)

### Communications

- `chat_conversations` (`direct`|`group`), `chat_participants`, `chat_messages`, `chat_attachments`
- `chat_conversation_links` — optional links from a conversation to vehicle/customer/inquiry/invoice/request
- `internal_mail`, `internal_mail_recipients`, `internal_mail_attachments`
- `whatsapp_message_log` — Cloud API send log (E.164 phone, text/template, Meta message id, status); ops RLS; Edge Function `send-whatsapp` (Phase 40)
- `tawk_chat_sessions` / `tawk_ticket_events` / `tawk_webhook_receipts` — Phase 58 Tawk webhook mirror for `/admin/live-chat` Needs attention; sessions/events RLS `private.can_access_live_chat()` (admin|manager); `tawk_webhook_receipts` is service-role-only (explicit deny policies for anon/authenticated; Edge `tawk-webhook` bypasses RLS)
- `admin_notifications`

Chat stays one product. Links are additive metadata; mutations go through `link_chat_conversation` / `unlink_chat_conversation`. Presence (Phase 60) is Realtime channel `workspace-presence` plus `last_seen_at` heartbeats — not a second chat product.

### Finance

- `invoice_company_settings`, `invoice_sequences`
- `invoices` — sequential `invoice_number`, document types, tax/payment totals, QR verification fields (Phase 14), provider submission fields; Phase 61b `price_term` (`fob`|`cf`|`cif`) + `shipment_term` (`dhl`|`roro`|`container_20ft`|`container_40ft`); Phase 62 `vat_applicable` (default true)
- `invoice_items` — optional `part_id` / `vehicle_id` / `inventory_reference`; Phase 61b optional `price_term`
- Phase 64 delete path: `unallocate_invoice_remittances(invoice_id)` reverses remittance allocations (receivables access); `delete_invoice_safely` refuses while allocations/payments remain, then calls `private.restore_invoice_linked_stock` (reserved/sold linked vehicles/parts → `available`, reservation fields cleared; sold parts quantity restored); `unallocate_and_delete_invoice` chains both. App helpers: `lib/invoice-delete.ts`.
- Phase 71 allocate/unallocate fix: `unallocate_invoice_remittances` / `reverse_remittance_allocation` are **SECURITY DEFINER** (still require receivables); `invoice_payments` DELETE RLS allows any receivables manager (was creator-or-admin only — broke unallocate for other finance staff). `sync_remittance_payment` accepts status `unknown`. Migration `20260921030000_phase_71_allocate_unallocate_fix.sql` (applied remote).
- `invoice_payments`
- `remittance_sequences`, `remittances`, `remittance_documents`, `remittance_allocations`
- Phase 69 remittance module: `remittance_offices` / `remittance_shifts` (workspace SELECT; receivables write — picklists, not HR); `remittances.received_by`, `office_id`, `shift_id`, `is_unknown`; status includes `unknown`; RLS SELECT = receivables **or** `received_by = auth.uid()`; RPCs `create_remittance(..., p_received_by, p_office_id, p_shift_id)` (null customer ⇒ unknown; office/shift default from profile), `link_remittance`, `count_unknown_remittances`; `allocate_remittance` requires receivables and refuses unknown. Migrations `20260921010000_phase_69_remittance_module_offices_shifts.sql`, `20260921011000_phase_69_drop_create_remittance_14arg.sql`.
- Phase 70: `admin_profiles.office_id` / `shift_id` → remittance picklists; Users UI assigns them; remittance dashboard filters by `remittances.office_id`. Migration `20260921020000_phase_70_admin_profile_office_shift.sql`.
- Phase 73 remittance confirmation: known create (customer set) defaults to **confirmed**; unknown stays unconfirmed; `link_remittance` requires customer + agent (`received_by`) and **auto-confirms**; trigger also confirms when an unknown row gains both. Migration `20260921070000_phase_73_remittance_auto_confirm.sql`.
- Clear reservation on available: `private.sync_catalog_sold_state` nulls `reserved_*` / `reservation_*` whenever parts/vehicles transition to `available`; release RPCs still clear explicitly; one-shot UPDATE cleans stale available rows. Migration `20260921040000_clear_reservation_on_available.sql` (applied remote).
- Make Available fix: `private.sync_catalog_sold_state` and `private.clear_reservation_buying_documents` are **SECURITY DEFINER** (search_path locked; EXECUTE revoked from PUBLIC/anon/authenticated) so workspace status updates can cancel unpaid reservation proformas without `permission denied`. Migration `20260922010000_fix_sync_catalog_sold_state_security_definer.sql` (applied remote).
- SOA reservation sync: on stock → `available`, `private.clear_reservation_buying_documents` cancels unpaid open reservation proformas (no payments/allocations) so customer Buying clears; field-agent invoice trigger allows that system cancel via `ansha.clearing_reservation_soa`; portal `get_my_customer_soa` returns `buying` (active reserved stock + open invoice lines). Migration `20260921050000_soa_sync_on_reservation_release.sql` (applied remote).
- `supplier_invoices` — private file metadata
- `bank_accounts` / `bank_transactions` — ops bank ledger (BNK-/BTXN-); opening balance + manual in/out; reconcile flags; optional remittance/supplier_payment/expense links; ops RLS
- `purchase_order_sequences` — PO number counters; RLS enabled + deny-all for authenticated; no direct client access (`next_po_number()` SECURITY DEFINER only). Hardened in `20260922020000_security_advisor_hardening.sql` (applied remote).

Triggers recalculate invoice balances and sync remittance-linked payments. Do not bypass them with ad-hoc SQL in the app.

App money display: `lib/money.ts` `formatMoneyBreakdown` / `currencyEntries` list per-currency totals without converting; UI uses `components/money-breakdown.tsx` (**All currencies** stacks each code — no FX mixing).

## Stock model (vehicles and parts)

`stock_origin`: `japan`, `dubai`, `singapore`, `china`, `thailand`, `taiwan`.

`stock_pool` (vehicles only, Phase 65): `owned` (purchased ANSHA inventory — `/admin/vehicles` + stock ops) or `auction_third_party` (third-party auction/yard listings — `/admin/auction-stock`). Japan-origin uploads default to `auction_third_party` until transferred to owned. Distinct from `lifecycle_stage` (operational path) and from auction-sheet photos (`is_auction_sheet`).

`stock_status`: `available`, `reserved`, `sold`.

`lifecycle_stage` (vehicles only): `unassigned`, `auction`, `yard`, `port`, `sold`.

Recommended operational path: Auction → Yard → Port → Sold. Commercial `stock_status` remains independent. Moving lifecycle to `sold` via `transition_vehicle_lifecycle` also sets `stock_status = sold`. Non-recommended stage jumps are blocked unless an account admin passes `p_force` with a reason in notes (Phase 47). Workflow actions (BL, inspection, RORO, etc.) are rows in `vehicle_lifecycle_events`, not free-text status fields. Event documents live in `vehicle_lifecycle_event_attachments`.

`private.sync_catalog_sold_state` (SECURITY DEFINER) stamps `sold_at`/`sold_by` on transition to `sold` and clears them otherwise; on → `available` it calls `private.clear_reservation_buying_documents` and nulls reservation fields.

This is not an auction/yard/port rewrite of availability. Lifecycle was added beside stock. `stock_pool` separates owned inventory UI from third-party auction listings without changing `stock_status`.

## Indexes

Covering indexes exist for published catalog, FKs, search trigrams, finance lookups, and chat/mail. Supabase performance advisors report many unused indexes; treat that as low-traffic evidence, not a drop list.

## Type generation

Hand-written `lib/types.ts` / `lib/ops-analytics.ts` cover public tables through Phase **78**, including Phase 72 `CommissionClaim`, Phase 74–76 `AuctionYard` / `ShippingCompany` / `FreightCharge`, Phase 69–70 remittance offices/shifts + profile office, Phase 65 `stock_pool`, Phase 57 `vehicle_class`. `AdminRole` includes `freelancer` | `manager` | `accounts`. Helpers: `lib/vehicle-class.ts`, `lib/trade-terms.ts`, `lib/stock-ops.ts`, `lib/export-masters.ts`, `lib/vehicle-sales-status.ts`, `lib/stock.ts` (`STOCK_POOLS`), `lib/invoice-delete.ts`, `lib/money.ts`, `lib/product-schema.ts`, `components/money-breakdown.tsx`, `lib/export-excel.ts`, `lib/reports/*`, `lib/stock-linked-invoice.ts`, `lib/freight-charges.ts`.


## Vehicle model specifications and public price synchronization

Migration `20260929211103_public_fob_listing_price_and_model_specs_filters.sql` normalizes saved make/model matching, keeps positive FOB values synchronized with the legacy `vehicles.price` listing field, and enables public price visibility when a positive export term is saved. `vehicle_model_specs` stores make/model keys, optional `length_m`, `width_m`, and `height_m`, plus `volume_m3`; vehicle weight is not used by the freight calculation. `bulk_update_vehicle_prices` accepts `price_fob`, `price_cf`, and `price_cif`; FOB writes also update `price`. See [Catalog Prices and Freight](./Catalog-Freight-Pricing.md) for operator workflows.

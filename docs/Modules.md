# Modules

End-user how-to: [User Manual](./User-Manual.md).

Only modules that exist in the repository are listed as implemented. Later ERP ideas are marked not built.

## Implemented

| Module | Public | Staff | Data |
|---|---|---|---|
| Dashboard | no | `/admin/dashboard` | counts, charts; enriched via `get_ops_analytics_summary` |
| Analytics | no | `/admin/analytics` | date-range KPIs (sales/stock/purchase/requests); sales get own-book subset |
| AI assistant | no | `/admin/ai` (ops) | `ai_chat_threads` / `ai_chat_messages` + `get_ai_ops_grounding` + `POST /api/ai/chat` |
| Parts catalog | `/parts` (+ FOB/C&F/CIF quote strip when set) | `/admin/parts` (redesigned cards; purchase cost + Incoterm sell quotes on edit) | `parts` (+ `price_fob`/`price_cf`/`price_cif`, Phase 63 `reserved_by` + `reservation_*`), photos, compatibility, cost columns |
| Vehicles catalog | `/vehicles` (no auction sheets; Incoterm strip; auction listings labeled); `/machinery` (trucks + heavy equipment) | `/admin/vehicles` (**owned** pool only), `/admin/auction-stock` (**auction_third_party**), shared inventory UI + transfer actions; `/admin/vehicles/[id]` lifecycle + attachments + purchase/reserve + Incoterm quotes; class fields; auction-sheet badge/lightbox | `vehicles` (`stock_pool` owned\|auction_third_party Phase 65; `vehicle_class`, `equipment_category`, `operating_hours`, Incoterm + reservation term columns), `vehicle_photos` (`is_auction_sheet`), lifecycle tables, cost columns |
| Categories | `/categories` | `/admin/categories` | `categories` |
| Suppliers | no | `/admin/suppliers`, SOA `/admin/suppliers/[id]` (ops) | `suppliers`, payments, allocations |
| Purchase orders | no | `/admin/purchase-orders` (ops) | `purchase_orders`, `purchase_order_lines` |
| Receive stock (GRN) | no | `/admin/inventory/receive` (ops; polished form + `NativeSelect`) | `inventory_receipts`, `inventory_receipt_lines` |
| Stock management | no | `/admin/stock`, `/admin/parts/stock`, `/admin/stock/arrival-watch` (ops; dual payment×shipment status; vehicle rows = owned pool) | vehicles (owned) + parts + linked invoices/shipments via `lib/stock-ops*`, `lib/parts-stock-ops-data.ts` (Phase 62–63) |
| Export shipments | no | `/admin/export-shipments` (ops; modes DHL/RoRo/20ft/40ft; PDF docs; export master selects; doc-driven status; vehicles + parts) | `export_shipments`, `export_shipment_vehicles`, `export_shipment_parts` (Phase 63), `export_shipment_documents` (Phase 61–62; storage bucket `export-shipment-documents`); `export_master_options` |
| Landed cost | no | `/admin/landed-cost` (ops) | `landed_cost_packs`, `landed_cost_charges`, `landed_cost_allocations` |
| Bank accounts | no | `/admin/bank-accounts` (ops + accounts views) | `bank_accounts`, `bank_transactions`, `bank_feed_connections` + CSV import |
| Expenses | no | `/admin/expenses` (ops + accounts) | `expense_categories`, `expenses` |
| General ledger | no | `/admin/ledger` (ops + accounts SELECT views) | `gl_accounts`, `gl_journals`, `gl_journal_lines` (Phase 46 auto-post from remittance/expense/invoice/supplier payment) |
| Financial reports | no | `/admin/reports` (ops + accounts) | trial balance / P&L / balance sheet RPCs |
| VAT return | no | `/admin/vat-return` (ops + accounts) | `vat_return_periods` + `get_vat_return_summary` |
| Payroll | no | /admin/payroll (ops) | employees, leave_requests, payroll_runs, payroll_lines, eos_estimate_logs |
| Audit log | no | `/admin/audit-log` (**admin only**) | `audit_logs` (append-only; invoice status, part/vehicle catalog activity, remittance allocate) |
| HR / workforce | no | `/admin/hr`, `/admin/hr/locations`, `/admin/hr/shifts`, `/admin/hr/attendance` (ops manage; manager view + own attendance) | `shift_locations`, `shift_assignments`, `attendance_records` |
| Blog | `/blog`, `/blog/[slug]` (SEO + JSON-LD) | `/admin/blog` (Write / HTML / Preview) | `blog_*` |
| Reviews / testimonials | `/reviews` (+ home strip) | — | static `lib/content/testimonials.ts` |
| Inquiries | forms on public pages | `/admin/inquiries` | `inquiries` |
| Part requests | `PartRequestForm` on public pages | queued on `/admin/requests` | `part_requests` |
| Requests | no | `/admin/requests`, `/admin/requests/[id]` | `workspace_requests`, events, attachments, due reminders |
| Customer portal | `/portal` | `/portal/reservations`, `/portal/invoices`, `/portal/account` | `customer_profiles` + own reserved stock RLS + `get_my_reservations` + own invoices + sanitized SOA RPC |
| Customers | no | `/admin/customers`, SOA `[id]` (+ enable portal) | `customers`, invoices, remittances, allocations |
| Reserve stock | no | `/admin/reservations` (field agents + ops; vehicles + parts; price/shipment/inspection/VAT Yes/No; sales/freelancer requester locked; own-book RLS; polished form + `NativeSelect`) | reserve + proforma RPCs; `reserved_by` + `reservation_*` on vehicles (Phase 62) and parts (Phase 63) |
| Invoices | `/verify/invoice/[code]` (shows price/shipment terms) | `/admin/invoices` (field agents: draft proforma; accounts/ops: full + approve sent; header + line Incoterm; VAT applicable; A4 print shows terms; Phase 64 unallocate-then-delete + stock restore to available) | `invoices*` (+ `price_term`/`shipment_term`/`vat_applicable`); `invoice_items.price_term` (Phase 61b–62); RPCs `unallocate_invoice_remittances`, `delete_invoice_safely`, `unallocate_and_delete_invoice` |
| Supplier invoices | no | `/admin/invoices/supplier` (ops + accounts) | `supplier_invoices` |
| Remittances | no | `/admin/remittances` (ops + accounts) | `remittances*` |
| Users | `/admin` login | `/admin/users` (manager stock locations), `/admin/profile` | Auth + `admin_profiles` (+ Phase 66 `allowed_stock_origins`) |
| Bulk import | no | `/admin/imports` | `import_jobs`, `import_rows` |
| Team chat | no | `/admin/chat` (+ entity filters; online dots + last-seen) | `chat_*`, `chat_conversation_links`, Realtime; Phase 60 `admin_profiles.last_seen_at`, `touch_admin_last_seen`, presence channel `workspace-presence` via `AdminPresenceProvider` |
| Internal mail | no | `/admin/mail` | `internal_mail*` |
| Outbound email | no | `/admin/email` (ops) | `outbound_email_log` + Edge `send-outbound-email` |
| Marketing campaigns | no | `/admin/campaigns` (ops) | `marketing_campaigns` + send hooks; Phase 66 audience/links/`sent_count` |
| Manager location scope | no | Users assign `allowed_stock_origins`; manager catalog/stock/reservations/export read | `admin_profiles.allowed_stock_origins` + RLS helpers |
| PWA subscribers | no | `/admin/subscribers` (ops; Subscribe this device + Send test push; idle UI when VAPID unset) | `push_subscriptions` + `lib/pwa-push-subscribe.ts` |
| Trade config | `/markets/[code]` | `/admin/trade-config` (ops) | `export_market_configs`, `site_trade_settings` |
| Configuration (export masters) | no | `/admin/configuration` (ops; search + inactive filter; seeded countries/ports) | `export_master_options` (Phase 62) + seed `20260920210000_seed_export_master_options.sql` |
| WhatsApp | no | `/admin/whatsapp` (ops) | `whatsapp_message_log` + Edge `send-whatsapp` |
| Live chat (Tawk) | public widget on site layout | `/admin/live-chat` (**admin + manager only**; Needs attention) | `NEXT_PUBLIC_TAWK_*`; Phase 58 `tawk_chat_sessions` / `tawk_ticket_events` / `tawk_webhook_receipts`; Edge `tawk-webhook` — `docs/Tawk.md` |
| Notifications | no | header center | `admin_notifications` |
| Banking page | `/banking` | footer link | static `lib/banking-details.ts` |
| Company pages | `/`, `/about`, `/contact` | — | static + catalog queries; home featured rotation via `lib/featured-rotation.ts` |
| Cart / favorites | `/cart`, `/favorites` | — | browser localStorage inquiry list |
| Markets / FX | header clock+FX, `/markets/[code]` | trade-config | `/api/fx` + market policies |
| Health | `/api/health` | — | REST ping |
| PWA | **Anshatradingco APP** install + Web Push | offers / blog / campaigns notify | `push_subscriptions`, `site_offers`, `/sw.js`, `send-web-push` |
| Capacitor shell | store-ready WebView wrapper (public URL) | generate `android`/`ios` locally | `capacitor.config.ts`, `native/www`, `docs/Mobile.md` |
| Offers / deals | `/offers` (+ nav Deals) | `/admin/offers` | `site_offers` (+ inventory link, discount/sale) |

## Not implemented

Native admin rewrite.

Live Open Banking OAuth (CSV bank import stub only).

Separate email newsletter list (Marketing subscribers = PWA push rows only).

Vehicle lifecycle events remain the operational log. Request tickets add assignment and due dates without replacing that log or intake tables. Public catalog lists only `is_published` stock with `stock_status = available`. Auction-sheet photos are admin-only. Purchase orders support 3-way match vs GRN, supplier invoice files, and supplier payments.

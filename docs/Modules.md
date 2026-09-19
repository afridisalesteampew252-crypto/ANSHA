# Modules

End-user how-to: [User Manual](./User-Manual.md).

Only modules that exist in the repository are listed as implemented. Later ERP ideas are marked not built.

## Implemented

| Module | Public | Staff | Data |
|---|---|---|---|
| Dashboard | no | `/admin/dashboard` | counts, charts; enriched via `get_ops_analytics_summary` |
| Analytics | no | `/admin/analytics` | date-range KPIs (sales/stock/purchase/requests); sales get own-book subset |
| AI assistant | no | `/admin/ai` (ops) | `ai_chat_threads` / `ai_chat_messages` + `get_ai_ops_grounding` + `POST /api/ai/chat` |
| Parts catalog | `/parts` | `/admin/parts` (+ purchase cost on edit) | `parts`, photos, compatibility, cost columns |
| Vehicles catalog | `/vehicles` | `/admin/vehicles`, `/admin/vehicles/[id]` lifecycle + attachments + purchase/reserve | `vehicles`, photos, `vehicle_lifecycle_events`, `vehicle_lifecycle_event_attachments`, cost columns |
| Categories | `/categories` | `/admin/categories` | `categories` |
| Suppliers | no | `/admin/suppliers`, SOA `/admin/suppliers/[id]` (ops) | `suppliers`, payments, allocations |
| Purchase orders | no | `/admin/purchase-orders` (ops) | `purchase_orders`, `purchase_order_lines` |
| Receive stock (GRN) | no | `/admin/inventory/receive` (ops) | `inventory_receipts`, `inventory_receipt_lines` |
| Export shipments | no | `/admin/export-shipments` (ops) | `export_shipments`, `export_shipment_vehicles` |
| Landed cost | no | `/admin/landed-cost` (ops) | `landed_cost_packs`, `landed_cost_charges`, `landed_cost_allocations` |
| Bank accounts | no | `/admin/bank-accounts` (ops) | `bank_accounts`, `bank_transactions`, `bank_feed_connections` + CSV import |
| Expenses | no | `/admin/expenses` (ops) | `expense_categories`, `expenses` |
| General ledger | no | `/admin/ledger` (ops) | `gl_accounts`, `gl_journals`, `gl_journal_lines` (Phase 46 auto-post from remittance/expense/invoice/supplier payment) |
| Financial reports | no | `/admin/reports` (ops) | trial balance / P&L / balance sheet RPCs |
| VAT return | no | `/admin/vat-return` (ops) | `vat_return_periods` + `get_vat_return_summary` |
| Payroll | no | /admin/payroll (ops) | employees, leave_requests, payroll_runs, payroll_lines, eos_estimate_logs |
| Audit log | no | `/admin/audit-log` (**admin only**) | `audit_logs` (append-only; invoice status, part/vehicle catalog activity, remittance allocate) |
| HR / workforce | no | `/admin/hr`, `/admin/hr/locations`, `/admin/hr/shifts`, `/admin/hr/attendance` (ops manage; manager view + own attendance) | `shift_locations`, `shift_assignments`, `attendance_records` |
| Blog | `/blog` | `/admin/blog` (Write / HTML / Preview) | `blog_*` |
| Inquiries | forms on public pages | `/admin/inquiries` | `inquiries` |
| Part requests | `PartRequestForm` on public pages | queued on `/admin/requests` | `part_requests` |
| Requests | no | `/admin/requests`, `/admin/requests/[id]` | `workspace_requests`, events, attachments, due reminders |
| Customer portal | `/portal` | `/portal/invoices`, `/portal/account` | `customer_profiles` + own invoices + sanitized SOA RPC |
| Customers | no | `/admin/customers`, SOA `[id]` (+ enable portal) | `customers`, invoices, remittances, allocations |
| Reserve vehicle | no | `/admin/reservations` (field agents + ops) | reserve + proforma RPC |
| Invoices | `/verify/invoice/[code]` | `/admin/invoices` (sales: customer invoices only) | `invoices*` |
| Supplier invoices | no | `/admin/invoices/supplier` | `supplier_invoices` |
| Remittances | no | `/admin/remittances` | `remittances*` |
| Users | `/admin` login | `/admin/users`, `/admin/profile` | Auth + `admin_profiles` |
| Bulk import | no | `/admin/imports` | `import_jobs`, `import_rows` |
| Team chat | no | `/admin/chat` (+ entity filters) | `chat_*`, `chat_conversation_links`, Realtime |
| Internal mail | no | `/admin/mail` | `internal_mail*` |
| Outbound email | no | `/admin/email` (ops) | `outbound_email_log` + Edge `send-outbound-email` |
| Marketing campaigns | no | `/admin/campaigns` (ops) | `marketing_campaigns` + send hooks to push/email/offer |
| PWA subscribers | no | `/admin/subscribers` (ops) | `push_subscriptions` (deals/insights topics) |
| Trade config | `/markets/[code]` | `/admin/trade-config` (ops) | `export_market_configs`, `site_trade_settings` |
| WhatsApp | no | `/admin/whatsapp` (ops) | `whatsapp_message_log` + Edge `send-whatsapp` |
| Notifications | no | header center | `admin_notifications` |
| Banking page | `/banking` | footer link | static `lib/banking-details.ts` |
| Company pages | `/`, `/about`, `/contact` | — | static + catalog queries |
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

Vehicle lifecycle events remain the operational log. Request tickets add assignment and due dates without replacing that log or intake tables. Public catalog lists only `is_published` stock with `stock_status = available`. Purchase orders support 3-way match vs GRN, supplier invoice files, and supplier payments.

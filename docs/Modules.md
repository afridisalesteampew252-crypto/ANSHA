# Modules

Only modules that exist in the repository are listed as implemented. Later ERP ideas are marked not built.

## Implemented

| Module | Public | Staff | Data |
|---|---|---|---|
| Dashboard | no | `/admin/dashboard` | counts, charts; enriched via `get_ops_analytics_summary` |
| Analytics | no | `/admin/analytics` | date-range KPIs (sales/stock/purchase/requests); sales get own-book subset |
| AI assistant | no | `/admin/ai` (ops) | `ai_chat_threads` / `ai_chat_messages` + `get_ai_ops_grounding` + `POST /api/ai/chat` |
| Parts catalog | `/parts` | `/admin/parts` (+ purchase cost on edit) | `parts`, photos, compatibility, cost columns |
| Vehicles catalog | `/vehicles` | `/admin/vehicles`, `/admin/vehicles/[id]` lifecycle + purchase/reserve | `vehicles`, photos, `vehicle_lifecycle_events`, cost columns |
| Categories | `/categories` | `/admin/categories` | `categories` |
| Suppliers | no | `/admin/suppliers`, SOA `/admin/suppliers/[id]` (ops) | `suppliers`, payments, allocations |
| Purchase orders | no | `/admin/purchase-orders` (ops) | `purchase_orders`, `purchase_order_lines` |
| Receive stock (GRN) | no | `/admin/inventory/receive` (ops) | `inventory_receipts`, `inventory_receipt_lines` |
| Export shipments | no | `/admin/export-shipments` (ops) | `export_shipments`, `export_shipment_vehicles` |
| Landed cost | no | `/admin/landed-cost` (ops) | `landed_cost_packs`, `landed_cost_charges`, `landed_cost_allocations` |
| Bank accounts | no | `/admin/bank-accounts` (ops) | `bank_accounts`, `bank_transactions` |
| Expenses | no | `/admin/expenses` (ops) | `expense_categories`, `expenses` |
| General ledger | no | `/admin/ledger` (ops) | `gl_accounts`, `gl_journals`, `gl_journal_lines` (Phase 46 auto-post from remittance/expense/invoice/supplier payment) |
| Financial reports | no | `/admin/reports` (ops) | trial balance / P&L / balance sheet RPCs |
| VAT return | no | `/admin/vat-return` (ops) | `vat_return_periods` + `get_vat_return_summary` |
| Payroll | no | /admin/payroll (ops) | employees, leave_requests, payroll_runs, payroll_lines |
| Audit log | no | `/admin/audit-log` (ops) | `audit_logs` (append-only; invoice status, vehicle stock, remittance allocate) |
| Blog | `/blog` | `/admin/blog` | `blog_*` |
| Inquiries | forms on public pages | `/admin/inquiries` | `inquiries` |
| Part requests | `PartRequestForm` on public pages | queued on `/admin/requests` | `part_requests` |
| Requests | no | `/admin/requests`, `/admin/requests/[id]` | `workspace_requests`, events, attachments, due reminders |
| Customer portal | `/portal` | `/portal/invoices`, `/portal/account` | `customer_profiles` + own invoices + sanitized SOA RPC |
| Customers | no | `/admin/customers`, SOA `[id]` (+ enable portal) | `customers`, invoices, remittances, allocations |
| Reserve vehicle | no | `/admin/reservations` (sales + ops) | reserve + proforma RPC |
| Invoices | `/verify/invoice/[code]` | `/admin/invoices` (sales: customer invoices only) | `invoices*` |
| Supplier invoices | no | `/admin/invoices/supplier` | `supplier_invoices` |
| Remittances | no | `/admin/remittances` | `remittances*` |
| Users | `/admin` login | `/admin/users`, `/admin/profile` | Auth + `admin_profiles` |
| Bulk import | no | `/admin/imports` | `import_jobs`, `import_rows` |
| Team chat | no | `/admin/chat` (+ entity filters) | `chat_*`, `chat_conversation_links`, Realtime |
| Internal mail | no | `/admin/mail` | `internal_mail*` |
| Outbound email | no | `/admin/email` (ops) | `outbound_email_log` + Edge `send-outbound-email` |
| Marketing campaigns | no | `/admin/campaigns` (ops) | `marketing_campaigns` + send hooks to push/email/offer |
| WhatsApp | no | `/admin/whatsapp` (ops) | `whatsapp_message_log` + Edge `send-whatsapp` |
| Notifications | no | header center | `admin_notifications` |
| Banking page | `/banking` | footer link | static `lib/banking-details.ts` |
| Company pages | `/`, `/about`, `/contact` | — | static + catalog queries |
| Health | `/api/health` | — | REST ping |
| PWA | installable public shell + Web Push | admin offers / blog notify | `push_subscriptions`, `site_offers`, `/sw.js`, `send-web-push` |
| Capacitor shell | store-ready WebView wrapper (public URL) | generate `android`/`ios` locally | `capacitor.config.ts`, `native/www`, `docs/Mobile.md` |
| Offers | `/offers` | `/admin/offers` | `site_offers` |

## Not implemented

Native admin rewrite.

Vehicle lifecycle events remain the operational log. Request tickets add assignment and due dates without replacing that log or intake tables. Public catalog lists only `is_published` stock with `stock_status = available`. Purchase orders support 3-way match vs GRN, supplier invoice files, and supplier payments.

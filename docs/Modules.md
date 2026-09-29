# Modules

End-user how-to: [User Manual](./User-Manual.md).

Only modules that exist in the repository are listed as implemented. Later ERP ideas are marked not built.

## Implemented

| Module | Public | Staff | Data |
|---|---|---|---|
| Dashboard | no | `/admin/dashboard` | counts, charts; enriched via `get_ops_analytics_summary`; money KPIs via **MoneyBreakdown** (All currencies) |
| Analytics | no | `/admin/analytics` | date-range KPIs (sales/stock/purchase/requests); sales get own-book subset; money KPIs via **MoneyBreakdown** |
| AI assistant | no | `/admin/ai` (ops) | `ai_chat_threads` / `ai_chat_messages` + `get_ai_ops_grounding` + `POST /api/ai/chat` |
| Parts catalog | `/parts` (+ FOB/C&F/CIF quote strip when set; Product JSON-LD via `lib/product-schema.ts`) | `/admin/parts` (cards/list; **bulk reserve**; **Actions** on reserved/sold incl. claim commission; linked **invoice badges**; edit covers identity/OEM, reservation/VAT, SEO, Incoterm quotes; **Invoices & documents**; requester badges only when reserved) | `parts` (+ Incoterm quotes, Phase 63 `reserved_by` + `reservation_*`), photos, compatibility, cost columns; RPC `bulk_reserve_stock` |
| Vehicles catalog | `/vehicles` (no auction sheets; Incoterm strip; auction listings labeled; Product JSON-LD); `/machinery` (trucks + heavy equipment) | `/admin/vehicles` (**owned**), `/admin/auction-stock` (**auction_third_party**); shared inventory UI + transfer; **bulk reserve**; **Export Excel**; **Actions** menus; invoice badges; detail lifecycle + **Invoices & documents**; auction-sheet badge/lightbox | `vehicles` (`stock_pool`; `vehicle_class`; Incoterm + reservation columns), `vehicle_photos` (`is_auction_sheet`); `bulk_reserve_stock`; `lib/export-excel.ts` |
| Categories | `/categories` | `/admin/categories` | `categories` |
| Suppliers | no | `/admin/suppliers`, SOA `/admin/suppliers/[id]` (ops) | `suppliers`, payments, allocations |
| Purchase orders | no | `/admin/purchase-orders` (ops) | `purchase_orders`, `purchase_order_lines` |
| Receive stock (GRN) | no | `/admin/inventory/receive` (ops; polished form + `NativeSelect`) | `inventory_receipts`, `inventory_receipt_lines` |
| Stock management | no | `/admin/stock`, `/admin/parts/stock`, `/admin/stock/arrival-watch` (ops; dual payment×shipment status; vehicle rows = owned pool) | vehicles (owned) + parts + linked invoices/shipments via `lib/stock-ops*`, `lib/parts-stock-ops-data.ts` (Phase 62–63) |
| Export shipments | no | `/admin/export-shipments` (ops; modes DHL/RoRo/20ft/40ft; PDF docs; export master selects; doc-driven status; vehicles + parts; Phase 68 hard-delete draft/cancelled or account-admin force) | `export_shipments`, `export_shipment_vehicles`, `export_shipment_parts` (Phase 63), `export_shipment_documents` (Phase 61–62; storage bucket `export-shipment-documents`); `export_master_options`; RPC `delete_export_shipment` |
| Landed cost | no | `/admin/landed-cost` (ops) | `landed_cost_packs`, `landed_cost_charges`, `landed_cost_allocations` |
| Bank accounts | no | `/admin/bank-accounts` (ops + accounts views) | `bank_accounts`, `bank_transactions`, `bank_feed_connections` + CSV import |
| Expenses | no | `/admin/expenses` (ops + accounts) | `expense_categories`, `expenses` |
| General ledger | no | `/admin/ledger` (ops + accounts SELECT views) | `gl_accounts`, `gl_journals`, `gl_journal_lines` (Phase 46 auto-post from remittance/expense/invoice/supplier payment) |
| Reports hub | no | `/admin/reports` (ops + accounts): hub + 7 operational reports + financial statements; Excel download | `lib/reports/catalog.ts`; GL RPCs for financial; remittance/invoice/stock queries for ops reports; `lib/export-excel.ts` |
| VAT return | no | `/admin/vat-return` (ops + accounts) | `vat_return_periods` + `get_vat_return_summary` |
| Payroll | no | /admin/payroll (ops) | employees, leave_requests, payroll_runs, payroll_lines, eos_estimate_logs |
| Audit log | no | `/admin/audit-log` (**admin only**) | `audit_logs` (append-only; invoice status, part/vehicle catalog activity, remittance allocate) |
| HR / workforce | no | `/admin/hr`, `/admin/hr/locations`, `/admin/hr/shifts`, `/admin/hr/attendance` (ops manage; manager view + own attendance) | `shift_locations`, `shift_assignments`, `attendance_records` |
| Blog | `/blog`, `/blog/[slug]` (SEO + JSON-LD) | `/admin/blog` (Write / HTML / Preview) | `blog_*` |
| Reviews / testimonials | `/reviews` (+ home strip) | — | static `lib/content/testimonials.ts` |
| Inquiries | forms on public pages | `/admin/inquiries` | `inquiries` |
| Part requests | `PartRequestForm` on public pages | queued on `/admin/requests` | `part_requests` |
| Requests | no | `/admin/requests`, `/admin/requests/[id]` (Phase 68 hard-delete ticket; intake kept) | `workspace_requests`, events, attachments, due reminders; RPC `delete_workspace_request` |
| Customer portal | `/portal` self-registration; `/account-deletion` public deletion resource | `/portal/catalog`, `/portal/reservations`, `/portal/invoices`, `/portal/account`, `/portal/settings`; Tawk support | Verified-email safe CRM linking; `customer_profiles`; deletion requests + admin approval; own reserved stock RLS; `get_my_reservations`; own invoices + SOA RPC |
| Customers | no | `/admin/customers` (auto **Customer ID** ~48001+; row **Actions** → `#soa`; consignee fields), SOA `[id]#soa` (+ enable portal; **Buying details**; allocate remittance→invoice; **MoneyBreakdown**) | `customers` (`customer_code` seq; `consignee_*`); invoices, remittances, allocations |
| Reserve stock | no | `/admin/reservations` + catalog **bulk reserve** (field agents + ops; vehicles + parts; price/shipment/inspection/VAT; sales/freelancer requester locked) | reserve + proforma RPCs; `bulk_reserve_stock`; release / **Make Available** clears unpaid reservation proformas (`private.clear_reservation_buying_documents` via SECURITY DEFINER `sync_catalog_sold_state`) |
| Commissions | no | `/admin/commissions` (field agents claim; ops/accounts review/pay; manager view); **Claim commission** on sold stock Actions | `commission_claims`; RPCs `claim_stock_commission`, `review_commission_claim` (Phase 72) |
| Invoices | `/verify/invoice/[code]` (shows price/shipment terms) | `/admin/invoices` (field agents: draft proforma; accounts/ops: full + approve sent; header + line Incoterm; VAT; A4 print; Phase 64 unallocate-then-delete; Phase 71 allocate from invoice detail) | `invoices*` (+ `price_term`/`shipment_term`/`vat_applicable`); `invoice_items.price_term`; unallocate/delete RPCs |
| Supplier invoices | no | `/admin/invoices/supplier` (ops + accounts) | `supplier_invoices` |
| Remittances | no | `/admin/remittances` (ops + accounts): **Dashboard** (office filter; multi-currency KPIs without FX mixing), list/receive (**Allocate To Stocks**, allocate/unallocate, **Excel/CSV export**), **Unknown TTS** (auto-confirm on link customer+agent), **My remittances**. Office/shift on **Users** | `remittance_offices`/`remittance_shifts`; profile `office_id`/`shift_id`; `remittances` (+ `received_by`, `is_unknown`); RPCs `create_remittance`, `link_remittance`, `allocate_remittance`, `reverse_remittance_allocation` (Phases 69–73) |
| Users | `/admin` login | `/admin/users` (manager stock locations + remittance office/shift), `/admin/profile` | Auth + `admin_profiles` (+ Phase 66 `allowed_stock_origins`, Phase 70 `office_id`/`shift_id`) |
| Bulk import | no | `/admin/imports` | `import_jobs`, `import_rows` |
| Team chat | no | `/admin/chat` (+ entity filters; online dots + last-seen) | `chat_*`, `chat_conversation_links`, Realtime; Phase 60 `admin_profiles.last_seen_at`, `touch_admin_last_seen`, presence channel `workspace-presence` via `AdminPresenceProvider` |
| Internal mail | no | `/admin/mail` | `internal_mail*` |
| Outbound email | no | `/admin/email` (ops) | `outbound_email_log` + Edge `send-outbound-email` |
| Marketing campaigns | no | `/admin/campaigns` (ops) | `marketing_campaigns` + send hooks; Phase 66 audience/links/`sent_count` |
| Manager location scope | no | Users assign `allowed_stock_origins`; manager catalog/stock/reservations/export read | `admin_profiles.allowed_stock_origins` + RLS helpers |
| PWA subscribers | no | `/admin/subscribers` (ops; Subscribe this device + Send test push; idle UI when VAPID unset) | `push_subscriptions` + `lib/pwa-push-subscribe.ts` |
| Trade config | `/markets/[code]` (**70** destinations in `lib/export-markets.ts`) | `/admin/trade-config` (ops) | `export_market_configs`, `site_trade_settings` |
| Configuration (export masters) | no | `/admin/configuration` (ops; search + inactive filter; seeded countries/ports) | `export_master_options` (Phase 62) + seed |
| Yards | no | `/admin/configuration/yards` (ops) | `auction_yards` (Phase 74) |
| Shipping companies | no | `/admin/configuration/shipping-companies` (ops) | `shipping_companies` (Phase 75) |
| Freight charges | no | `/admin/freight-charges` (ops + accounts write; manager read) | `freight_charges` (Phase 76) |
| WhatsApp | no | `/admin/whatsapp` (ops) | `whatsapp_message_log` + Edge `send-whatsapp` |
| Live chat (Tawk) | public widget on site layout | `/admin/live-chat` (**admin + manager only**; Needs attention) | `NEXT_PUBLIC_TAWK_*`; Phase 58 `tawk_chat_sessions` / `tawk_ticket_events` / `tawk_webhook_receipts`; Edge `tawk-webhook` — `docs/Tawk.md` |
| Notifications | no | header center | `admin_notifications` |
| Banking page | `/banking` | footer link | static `lib/banking-details.ts` |
| Company pages | `/`, `/about`, `/contact` | — | static + catalog queries; home featured rotation via `lib/featured-rotation.ts` |
| Cart / favorites | `/cart`, `/favorites` | — | browser localStorage inquiry list |
| Markets / FX | header clock+FX, `/markets/[code]` (70 markets) | trade-config | `/api/fx` + `lib/export-markets.ts` + market policies |
| Health | `/api/health` | — | REST ping |
| PWA | **Anshatradingco APP** install + Web Push | offers / blog / campaigns notify | `push_subscriptions`, `site_offers`, `/sw.js`, `send-web-push` |
| Capacitor shells | Customer app loads `/mobile`; separate staff app loads `/admin/dashboard` | Android projects are generated for APK builds; customer iOS shell is optional | `capacitor.config.ts`, `capacitor.admin.config.ts`, `docs/Mobile.md`, `docs/Admin-Android.md` |
| Offers / deals | `/offers` (+ nav Deals) | `/admin/offers` | `site_offers` (+ inventory link, discount/sale) |

## Not implemented

Native admin rewrite.

Live Open Banking OAuth (CSV bank import stub only).

Separate email newsletter list (Marketing subscribers = PWA push rows only).

Vehicle lifecycle events remain the operational log. Request tickets add assignment and due dates without replacing that log or intake tables. Public catalog lists only `is_published` stock with `stock_status = available`. Auction-sheet photos are admin-only. Purchase orders support 3-way match vs GRN, supplier invoice files, and supplier payments.


## Catalog price and freight configuration

- **Bulk vehicle prices** — `/admin/bulk-vehicle-prices`: search/filter and update selected vehicle FOB, C&F, or CIF prices. FOB is synchronized to the legacy listing price.
- **Vehicle make/model M³** — `/admin/vehicle-model-config`: configure searchable make/model dimensions and M³ values.
- **Freight calculator** — `/admin/freight-calculator`: estimate RoRo charges per M³ or compare the full configured price for a 40-ft container. Destination fields suggest active configured country/port pairs.
- **Freight charges** — `/admin/freight-charges`: create and maintain route and shipment-type rates.

Detailed workflow: [Catalog Prices and Freight](./Catalog-Freight-Pricing.md).

# Roadmap

Nothing below is scheduled until a module is chosen. Items are ordered from safest to largest. Each step must preserve production data.

## 0. Documentation

Audit and process docs under `docs/` (including Development, Deployment, Testing, Rules, Roadmap).

## 1. Safety

Done in code and deployed to project `ydrnilquojvalhgifest`: `admin-update-user` verifies the caller with the anon JWT (same as create-user); Edge Function CORS is origin-allowlisted, not `*`. Function versions: `admin-create-user` v6, `admin-update-user` v4.

Still needs your action or approval:

- Enable leaked-password protection in Supabase Auth (Authentication â Providers â Email â leaked password protection)
- Decide whether staff RLS should stay equal to admin for catalog/finance (not changed)

## 2. Housekeeping

Done: README latest-migration points at Phase 21; `lib/types.ts` covers public tables through Phase 21; CI runs `verify:brands`; `netlify.toml` removed; publishable keys removed from `vercel.json` (`next.config.js` no longer inlines them).

Not deleted: both `001_initial_schema` files â production `schema_migrations` records `20260909192712` and `20260909194958`. Removing either file would desync git from the live database.

Inactive Supabase project `kmngigxpqhiilcavmcmm` is already `INACTIVE`. Pause API rejected that status. Permanent delete remains a dashboard action.

## 3. Vehicle operational lifecycle (additive)

Done (Phase 18): `lifecycle_stage` on `vehicles`; append-only `vehicle_lifecycle_events`; RPCs `transition_vehicle_lifecycle` and `record_vehicle_lifecycle_event`; admin detail page `/admin/vehicles/[id]` with stage transitions, workflow events, and history. Existing `stock_origin` / `stock_status` preserved. Sold commercial stock was backfilled to lifecycle `sold`.

Later enhancements: document attachments on events, stricter transition rules, public stage display if needed.

## 4. Request workflows

Done (Phase 19): `inquiries` and `part_requests` remain intake. Staff tickets live in `workspace_requests` with assignment, due dates, and `workspace_request_events`. Admin queue is `/admin/requests`. Existing intake was backfilled. New website submissions open a ticket automatically.

Done (Phase 21): private ticket files on `/admin/requests/[id]` via `workspace_request_attachments` and `internal-files` prefix `requests/{request_id}/`. Intake tables unchanged. Chat/mail attachments stay in their modules.

Later: tighter due-date reminders.

Done (Phase 26): due-soon (24h) and overdue in-app notifications for active assignees. Ledger `workspace_request_due_reminders`, RPC `process_workspace_request_due_reminders`, Edge Function `remind-request-dues`, Vercel Cron `/api/cron/request-dues` once daily at 04:00 UTC (Hobby plan cannot use hourly crons). No outbound email in this slice.

## 5. Chat linking

Done (Phase 20): `chat_conversation_links` attaches existing conversations to vehicle/customer/inquiry/invoice/request IDs. RPCs `link_chat_conversation` / `unlink_chat_conversation`. Team Chat UI can link/unlink and filter via query params. No second chat product.

Done (Phase 23): customer portal first slice on the same database. `customer_profiles` links Auth users to CRM `customers` (never `admin_profiles`). Customers can sign in at `/portal` and read their own non-draft invoices. Admin enables access from the customer SOA page via Edge Function `portal-create-access`. Remittances, chat, and staff ERP stay staff-only.

Done (Phase 27): portal account statement at `/portal/account` via sanitized RPC `get_my_customer_soa` (confirmed remittances, allocations, outstanding KPIs). No remittance notes, documents, drafts, or allocate/reverse RPCs for customers.

Done (Phase 28): purchase-costed inventory on the existing `vehicles` / `parts` master â `suppliers`, cost columns, GRN (`inventory_receipts` + `create_inventory_receipt`), reserve/release RPCs, tax/commercial invoice stock apply via `create_invoice_v3`, public catalog filters `stock_status = available`. Ops-only purchase UI; sales can still reserve vehicles.

Done (Phase 29): purchase orders (`purchase_orders` / lines), confirm/cancel RPCs, GRN + supplier invoice PO links, match snapshot (ordered vs received vs invoiced; paid deferred). Admin `/admin/purchase-orders`; ops-only.

Done (Phase 30): supplier payments (`supplier_payments` / allocations), allocate to PO or supplier invoice file, PO `amount_paid` + paid match states, supplier SOA at `/admin/suppliers/[id]` with CSV/print export.

Done (Phase 31): `set_vehicle_public_listing` (publish only when available), sales `/admin/reservations` (reserve + proforma via `create_vehicle_reservation_proforma`), release-with-republish; sales may open customer invoices (not supplier invoice archive).

Also in this phase: public catalog image optimization (Next.js Image), category/home SEO metadata, faster homepage category counts, footer portal link.

Done (Phase 32): export shipments (`export_shipments` / `export_shipment_vehicles`, EXP- numbers), create/update/status/add/remove RPCs with soft lifecycle hooks (export_request / mode / BL events; optional move to port). Admin `/admin/export-shipments`; ops-only.

Done (Phase 33): landed-cost packs (`landed_cost_packs` / `charges` / `allocations`, LC- numbers). Ops allocate freight/duty/etc., redistribute equal|purchase_value|manual, post to set stock `landed_cost = COALESCE(purchase_price,0) + allocated` (replace per pack). Admin `/admin/landed-cost`; ops-only.

Done (Phase 34): bank account master (`bank_accounts` / `bank_transactions`, BNK-/BTXN- numbers). Manual in/out ledger, reconcile toggle, opening balance, optional remittance/supplier_payment/expense links. Admin `/admin/bank-accounts`; ops-only. Not Open Banking.

Done (Phase 35): operating expenses (`expense_categories` / `expenses`, OPEX- numbers). Create/update/post/cancel RPCs; optional soft `bank_account_id`; admin `/admin/expenses`; ops-only. No payroll.

Done (Phase 36): UAE VAT return pack â `get_vat_return_summary(from,to)` (output VAT from tax/commercial invoices, input VAT from purchase invoices + supplier invoices at PO/default 5% gross-inclusive), optional `vat_return_periods` snapshots via `save_vat_return_period`. Admin `/admin/vat-return` with CSV export; ops-only; reporting-first (no GL).

Done (Phase 37): payroll / leave / EOS MVP â `employees`, `leave_requests`, `payroll_runs` / `payroll_lines` (PR- numbers). Create/post/cancel runs; leave approve/reject; `estimate_employee_eos` (basic Ã years, estimate only â not legal advice). Admin `/admin/payroll`; ops-only. Optional soft `bank_account_id`; no bank auto-pay.

Done (Phase 38): general ledger MVP â `gl_accounts`, `gl_journals` / `gl_journal_lines` (JE- numbers), balanced post/reverse RPCs, seeded default chart, report RPCs (`gl_trial_balance`, `gl_profit_and_loss`, `gl_balance_sheet`). Admin `/admin/ledger` + `/admin/reports`; ops-only. Manual journals only; auto-post from bank/expense/invoice modules deferred (TODOs in docs).

Done (Phase 41): richer ops analytics — RPC `get_ops_analytics_summary(from,to)` (jsonb: tax/commercial sales by month, outstanding AR, stock by status/origin, open/overdue requests; ops also remittances + open POs + GRNs). Dashboard `/admin/dashboard` extended; optional `/admin/analytics` with date range. Sales get own-book safe subset (no remittances/PO/GRN). Recharts. Migration `20260918300000_phase_41_analytics.sql` applied live.

Done (Phase 40): WhatsApp Business Cloud API MVP — `whatsapp_message_log` (ops RLS), Edge Function `send-whatsapp` (Meta Graph), admin `/admin/whatsapp` (customer phone or E.164 paste, text/template, send log). Secrets `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`; UI shows setup when missing.

Done (Phase 42): AI ops assistant MVP — /admin/ai chat UI, POST /api/ai/chat (Vercel AI SDK + AI Gateway / OpenAI), grounding RPC get_ai_ops_grounding, optional history tables i_chat_threads / i_chat_messages (ops RLS). Never invents chassis/VIN numbers. Server env: AI_GATEWAY_API_KEY or OPENAI_API_KEY (+ optional AI_MODEL).

Done (Phase 43): audit-log MVP  `audit_logs` (append-only; ops SELECT), `private.write_audit_log(...)`, triggers on `invoices.status`, `vehicles.stock_status`, and `remittance_allocations` insert/delete. Admin `/admin/audit-log` with entity/actor/date filters.

Done (Phase 39): outbound email MVP — `outbound_email_log` (ops RLS, append-only), Edge Function `send-outbound-email` via Resend (`RESEND_API_KEY`), admin compose UI `/admin/email` with optional invoice verification-link stub. Not marketing campaigns.

## 7. Mobile / PWA

Done (Phase 22): installable PWA for the public catalog on the same Next.js app and Supabase project. Manifest, icons, service worker (`/sw.js`), offline fallback (`/offline`), and optional install prompt. Admin/API/auth responses are never cached.

Done (Phase 24): Web Push for new insights and deals/offers. `push_subscriptions` + `site_offers`, public opt-in prompt, `/offers`, admin Deals & Offers with optional push, blog âPWA push on publishâ, Edge Function `send-web-push` (VAPID). Staff must opt in per publish â no silent DB webhook.

Done (Phase 44): Capacitor native shell MVP — `capacitor.config.ts` (`com.anshatrading.app`) loads `https://www.anshatradingco.com` (or `CAPACITOR_SERVER_URL`) in an iOS/Android WebView. Config + `native/www` placeholder + npm scripts + `docs/Mobile.md`. Native `android/` / `ios/` are generated locally and gitignored. PWA unchanged; admin is not rewritten as native UI.

## 8. Later platform

Outbound email, AI automation â all against this PostgreSQL project.

Stop after the current module until the next one is approved.

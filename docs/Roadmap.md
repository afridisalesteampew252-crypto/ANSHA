# Roadmap

Nothing below is scheduled until a module is chosen. Items are ordered from safest to largest. Each step must preserve production data.

## 0. Documentation

Audit and process docs under `docs/` (including Development, Deployment, Testing, Rules, Roadmap).

## 1. Safety

Done in code and deployed to project `ydrnilquojvalhgifest`: `admin-update-user` verifies the caller with the anon JWT (same as create-user); Edge Function CORS is origin-allowlisted, not `*`. Function versions: `admin-create-user` v6, `admin-update-user` v4.

Still needs your action or approval:

- Enable leaked-password protection in Supabase Auth (Authentication ? Providers ? Email ? leaked password protection)
- Decide whether staff RLS should stay equal to admin for catalog/finance (not changed)

## 2. Housekeeping

Done: README latest-migration points at Phase 21; `lib/types.ts` covers public tables through Phase 21; CI runs `verify:brands`; `netlify.toml` removed; publishable keys removed from `vercel.json` (`next.config.js` no longer inlines them).

Not deleted: both `001_initial_schema` files ? production `schema_migrations` records `20260909192712` and `20260909194958`. Removing either file would desync git from the live database.

Inactive Supabase project `kmngigxpqhiilcavmcmm` is already `INACTIVE`. Pause API rejected that status. Permanent delete remains a dashboard action.

## 3. Vehicle operational lifecycle (additive)

Done (Phase 18): `lifecycle_stage` on `vehicles`; append-only `vehicle_lifecycle_events`; RPCs `transition_vehicle_lifecycle` and `record_vehicle_lifecycle_event`; admin detail page `/admin/vehicles/[id]` with stage transitions, workflow events, and history. Existing `stock_origin` / `stock_status` preserved. Sold commercial stock was backfilled to lifecycle `sold`.

Done (Phase 47): lifecycle hardening — private event attachments (`vehicle_lifecycle_event_attachments`, `internal-files` prefix `vehicles/{vehicle_id}/lifecycle/{event_id}/`); stricter transitions (recommended hop only unless account-admin `p_force` + reason notes); UI upload/list/remove per event on `/admin/vehicles/[id]`. Public stage display still deferred.

## 4. Request workflows

Done (Phase 19): `inquiries` and `part_requests` remain intake. Staff tickets live in `workspace_requests` with assignment, due dates, and `workspace_request_events`. Admin queue is `/admin/requests`. Existing intake was backfilled. New website submissions open a ticket automatically.

Done (Phase 21): private ticket files on `/admin/requests/[id]` via `workspace_request_attachments` and `internal-files` prefix `requests/{request_id}/`. Intake tables unchanged. Chat/mail attachments stay in their modules.

Later: tighter due-date reminders.

Done (Phase 26): due-soon (24h) and overdue in-app notifications for active assignees. Ledger `workspace_request_due_reminders`, RPC `process_workspace_request_due_reminders`, Edge Function `remind-request-dues`, Vercel Cron `/api/cron/request-dues` once daily at 04:00 UTC (Hobby plan cannot use hourly crons). No outbound email in this slice.

## 5. Chat linking

Done (Phase 20): `chat_conversation_links` attaches existing conversations to vehicle/customer/inquiry/invoice/request IDs. RPCs `link_chat_conversation` / `unlink_chat_conversation`. Team Chat UI can link/unlink and filter via query params. No second chat product.

Done (Phase 23): customer portal first slice on the same database. `customer_profiles` links Auth users to CRM `customers` (never `admin_profiles`). Customers can sign in at `/portal` and read their own non-draft invoices. Admin enables access from the customer SOA page via Edge Function `portal-create-access`. Remittances, chat, and staff ERP stay staff-only.

Done (Phase 27): portal account statement at `/portal/account` via sanitized RPC `get_my_customer_soa` (confirmed remittances, allocations, outstanding KPIs). No remittance notes, documents, drafts, or allocate/reverse RPCs for customers.

Done (Phase 28): purchase-costed inventory on the existing `vehicles` / `parts` master ? `suppliers`, cost columns, GRN (`inventory_receipts` + `create_inventory_receipt`), reserve/release RPCs, tax/commercial invoice stock apply via `create_invoice_v3`, public catalog filters `stock_status = available`. Ops-only purchase UI; sales can still reserve vehicles.

Done (Phase 29): purchase orders (`purchase_orders` / lines), confirm/cancel RPCs, GRN + supplier invoice PO links, match snapshot (ordered vs received vs invoiced; paid deferred). Admin `/admin/purchase-orders`; ops-only.

Done (Phase 30): supplier payments (`supplier_payments` / allocations), allocate to PO or supplier invoice file, PO `amount_paid` + paid match states, supplier SOA at `/admin/suppliers/[id]` with CSV/print export.

Done (Phase 31): `set_vehicle_public_listing` (publish only when available), sales `/admin/reservations` (reserve + proforma via `create_vehicle_reservation_proforma`), release-with-republish; sales may open customer invoices (not supplier invoice archive).

Also in this phase: public catalog image optimization (Next.js Image), category/home SEO metadata, faster homepage category counts, footer portal link.

Done (Phase 32): export shipments (`export_shipments` / `export_shipment_vehicles`, EXP- numbers), create/update/status/add/remove RPCs with soft lifecycle hooks (export_request / mode / BL events; optional move to port). Admin `/admin/export-shipments`; ops-only.

Done (Phase 33): landed-cost packs (`landed_cost_packs` / `charges` / `allocations`, LC- numbers). Ops allocate freight/duty/etc., redistribute equal|purchase_value|manual, post to set stock `landed_cost = COALESCE(purchase_price,0) + allocated` (replace per pack). Admin `/admin/landed-cost`; ops-only.

Done (Phase 34): bank account master (`bank_accounts` / `bank_transactions`, BNK-/BTXN- numbers). Manual in/out ledger, reconcile toggle, opening balance, optional remittance/supplier_payment/expense links. Admin `/admin/bank-accounts`; ops-only. Not Open Banking.

Done (Phase 50): bank feed readiness — `bank_feed_connections` (`manual`|`pending_provider` placeholders), CSV import UI wired to `import_bank_transactions_stub` (date,amount,description,reference), docs `Banking-Integrations.md`. No fake live bank OAuth.

Done (Phase 35): operating expenses (`expense_categories` / `expenses`, OPEX- numbers). Create/update/post/cancel RPCs; optional soft `bank_account_id`; admin `/admin/expenses`; ops-only. No payroll.

Done (Phase 36): UAE VAT return pack ? `get_vat_return_summary(from,to)` (output VAT from tax/commercial invoices, input VAT from purchase invoices + supplier invoices at PO/default 5% gross-inclusive), optional `vat_return_periods` snapshots via `save_vat_return_period`. Admin `/admin/vat-return` with CSV export; ops-only; reporting-first (no GL).

Done (Phase 37): payroll / leave / EOS MVP ? employees, leave_requests, payroll_runs / payroll_lines (PR- numbers). Create/post/cancel runs; leave approve/reject; rough EOS helper. Admin /admin/payroll; ops-only. Optional soft ank_account_id; no bank auto-pay.

Done (Phase 48): UAE-oriented EOS upgrade ? indicative 21/30 day-wage bands + resignation/termination multipliers; eos_estimate_logs stores calculator inputs/outputs; employees.leave_balance_days; approve annual leave can optionally deduct days. Admin /admin/payroll EOS tab upgraded. **Indicative only ? not legal advice / not compliance.** Migration 20260918360000_phase_48_payroll_eos.sql.

Done (Phase 38): general ledger MVP ? `gl_accounts`, `gl_journals` / `gl_journal_lines` (JE- numbers), balanced post/reverse RPCs, seeded default chart, report RPCs (`gl_trial_balance`, `gl_profit_and_loss`, `gl_balance_sheet`). Admin `/admin/ledger` + `/admin/reports`; ops-only.

Done (Phase 46): GL auto-posting ? SECURITY DEFINER helpers + AFTER triggers post balanced journals for remittance confirm/allocate (Dr 1000 Cr 1100), expense post (Dr 6000/hint Cr 1000 or AP 2000; reverse on cancel), tax/commercial invoice issue (Dr 1100 Cr 4000/+2100), supplier payment confirm (Dr 2000 Cr 1000). Idempotent via `source_module`+`source_id`. Migration `20260918340000_phase_46_gl_auto_post.sql`.

Done (Phase 41): richer ops analytics ? RPC `get_ops_analytics_summary(from,to)` (jsonb: tax/commercial sales by month, outstanding AR, stock by status/origin, open/overdue requests; ops also remittances + open POs + GRNs). Dashboard `/admin/dashboard` extended; optional `/admin/analytics` with date range. Sales get own-book safe subset (no remittances/PO/GRN). Recharts. Migration `20260918300000_phase_41_analytics.sql` applied live.

Done (Phase 40): WhatsApp Business Cloud API MVP ? `whatsapp_message_log` (ops RLS), Edge Function `send-whatsapp` (Meta Graph), admin `/admin/whatsapp` (customer phone or E.164 paste, text/template, send log). Secrets `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`; UI shows setup when missing.

Done (Phase 42): AI ops assistant MVP ? /admin/ai chat UI, POST /api/ai/chat (Vercel AI SDK + AI Gateway / OpenAI), grounding RPC get_ai_ops_grounding, optional history tables i_chat_threads / i_chat_messages (ops RLS). Never invents chassis/VIN numbers. Server env: AI_GATEWAY_API_KEY or OPENAI_API_KEY (+ optional AI_MODEL).

Done (Phase 43): audit-log MVP ? `audit_logs` (append-only; ops SELECT), `private.write_audit_log(...)`, triggers on `invoices.status`, `vehicles.stock_status`, and `remittance_allocations` insert/delete. Admin `/admin/audit-log` with entity/actor/date filters.

Done (Phase 39): outbound email MVP ? outbound_email_log (ops RLS, append-only), Edge Function send-outbound-email via Resend (RESEND_API_KEY), admin compose UI /admin/email with optional invoice verification-link stub.

Done (Phase 49): marketing campaigns MVP ? marketing_campaigns (name, channel push|email|offer, status draft|scheduled|sent, payload jsonb, sent_at; ops RLS), admin /admin/campaigns with Send now hooks into send-web-push / send-outbound-email / offer deals push. Not full ESP automation.

Done (Phase 51): inventory-linked offers — `site_offers.vehicle_id` / `part_id`, `discount_percent`, `sale_price`; public cards + detail show deal price; admin attach vehicle/part on `/admin/offers`. Migration `20260919010000_phase_51_offer_inventory_links.sql`.

Done (Phase 52): trade configuration — `export_market_configs` + `site_trade_settings`; public `/markets/[code]`; admin `/admin/trade-config`. Migration `20260919020000_phase_52_trade_config.sql`.

Also shipped (product slices, post-50): public cart/favorites; Dubai clock + AED FX (`/api/fx`); PNG export-market flags; mobile PWA overflow fixes; admin PK/Dubai clocks + FX; Marketing `/admin/subscribers`; PWA name **Anshatradingco APP** + install CTAs; blog Write/HTML/Preview editor.

Done (Phase 53): account-admin payroll deletes — `delete_payroll_employee`, `delete_payroll_run` (draft/cancelled only; posted must cancel first). Migration `20260920020000_phase_53_payroll_delete.sql`.

Done (Phase 54): field agents — tighten `sales` + add `freelancer`; `manager` HR viewer; HR MVP (`shift_locations`, `shift_assignments`, `attendance_records`); catalog activity audit on `parts`/`vehicles`; `audit_logs` SELECT admin-only. Migration `20260920030000_phase_54_field_agents_hr_catalog_audit.sql`. A4 invoice print landed with this slice.

Done (Phase 55): `accounts` role + `can_manage_receivables()`; field agents create **draft proforma only** (cannot mark sent); sales dashboard cleanup; invoice RBAC. Migrations `20260920040000_phase_55_accounts_role_proforma_draft.sql`, `20260920040100_phase_55_accounts_invoice_rbac.sql`.

Done (Phase 56): `vehicle_photos.is_auction_sheet`; public RLS hides A-sheets; admin badge + clickable Auction sheet lightbox; Japan ZIP import script flags `A.*`. Migration `20260920050000_phase_56_vehicle_photo_auction_sheet.sql`. Invoice A4 polish: denser layout + verification code on face.

Also shipped (inventory ops, scripts — data already in live Supabase): Japan Aug 2026 ZIP batches via `scripts/import-japan-stock-vehicles.mjs` and one-off runners — **17 Aug (40 vehicles, 20 auction sheets)**, **19 Aug (50; MXPK→Aqua)**, **25 Aug (~35 + auction-sheet flagging)**, **26 Aug (35)**, **28 Aug (29)**; live ~**191** Japan vehicles / ~**32** auction-sheet photos. WhatsApp parts: warehouse + Dubai batches; Japan key-fobs (**16**); Dubai WhatsApp Sep 20 vehicles+parts (`scripts/import-dubai-whatsapp-sep20-stock.mjs` — 2 vehicles + 2 parts).

Done (Phase 57): vehicle class for heavy machinery & trucks — `vehicles.vehicle_class` (`passenger`|`commercial_truck`|`heavy_machinery`), optional `equipment_category` + `operating_hours`; public `/machinery`; admin class filters + nav “Machinery & trucks”; helpers in `lib/vehicle-class.ts`. Migration `20260920060000_phase_57_vehicle_class_machinery.sql`.

Also shipped (Tawk.to widget, with Phase 57): public site widget via `NEXT_PUBLIC_TAWK_PROPERTY_ID` / `NEXT_PUBLIC_TAWK_WIDGET_ID`; admin `/admin/live-chat` surface — **admin + manager only** (`canAccessLiveChat` + nav filter + `proxy.ts`). Optional `NEXT_PUBLIC_TAWK_DASHBOARD_URL`. No official Tawk→Cursor MCP.

Also shipped (SEO ops): Google Search Console `verification.google` in root layout; stable `/favicon.ico` + `/icons/favicon-48.png` + regenerated PWA icons; default OG `/images/og-default.jpg` (`lib/seo.ts`); after deploy → verify ownership + Request indexing (favicon can take days).

Done (Phase 58): Tawk webhook mirror for Live chat Needs attention — tables `tawk_chat_sessions` / `tawk_ticket_events` / `tawk_webhook_receipts`, RLS via `private.can_access_live_chat()`, Edge Function `tawk-webhook` (HMAC `TAWK_WEBHOOK_SECRET`, deploy `--no-verify-jwt`), admin inbox UI + open-count badge. Migration `20260920070000_phase_58_tawk_chat_events.sql`. Operator setup: `docs/Tawk.md`.

Done (Phase 60): Team Chat presence — `admin_profiles.last_seen_at`, RPC `touch_admin_last_seen`, Realtime channel `workspace-presence`, `AdminPresenceProvider` in admin layout; green online dots + last-seen labels on `/admin/chat`. Migration `20260920090000_phase_60_team_chat_presence.sql`.

Done (Phase 61): export shipment docs + Incoterms + reservation terms — `export_shipments.mode` constrained to `dhl`|`roro`|`container_20ft`|`container_40ft` (legacy `other` → `dhl`); `export_shipment_documents` (BOL / export certificate / waybill / courier single-slot + multi per-country `inspection_certificate`) with private storage bucket `export-shipment-documents`; catalog `price_fob`/`price_cf`/`price_cif` on parts & vehicles; reservation `reservation_price_term` / `reservation_shipment_term`; public `IncotermQuoteStrip`; admin docs panel. Migration `20260920100000_phase_61_export_docs_incoterms_reservations.sql` (applied remote).

Done (Phase 61b): reservation `reservation_inspection_required` (Yes/No); invoice header `price_term` + `shipment_term`; optional `invoice_items.price_term`; A4 print + public verify show terms; reserve/proforma RPCs accept inspection. Migration `20260920150000_phase_61b_reservation_inspection_invoice_terms.sql` (applied remote). Shared labels: `lib/trade-terms.ts`.

Done (Phase 62): stock ops dashboard — `/admin/stock` + `/admin/stock/arrival-watch` (payment/stock × shipment dual status); `/admin/configuration` CRUD for `export_master_options` (destination country / loading port / destination port / vessel / voyage) wired into export shipments; field-agent vehicle SELECT scoped to available + own `reserved_by`; reservation VAT Yes/No + requester + ETD/ETA; invoice `vat_applicable`; document-driven shipment status (BOL → shipped/sailed, waybill/surrendered → delivered/arrived). Migration `20260920200000_phase_62_sales_assignment_export_masters_vat.sql` (applied remote). Helpers: `lib/stock-ops.ts`, `lib/export-masters.ts`, `lib/vehicle-sales-status.ts`.

Done (Phase 63): parts stock ops parity — `/admin/parts/stock`; parts `reserved_by` + reservation VAT/ETD/ETA/requester; field-agent parts SELECT (available + own reserved); reserve/proforma/release RPCs for parts; `export_shipment_parts` + `create_export_shipment` `part_ids`; requester_role includes `freelancer` with locked requester fields for sales/freelancer; redesigned `/admin/parts` + `/admin/vehicles` cards/lists. Migration `20260920210000_phase_63_parts_stock_ops_sales_scope.sql` (applied remote). Seed: `20260920210000_seed_export_master_options.sql` + `scripts/seed-export-masters.sql`. Helpers: `lib/parts-stock-ops-data.ts`, `lib/part-sales-status.ts`.

Done (Phase 64): invoice unallocate-then-delete — remittance allocations must clear before delete; `unallocate_invoice_remittances` returns funds to remittance pool; `delete_invoice_safely` restores linked reserved/sold vehicles/parts to `available` (parts sold qty restored); `unallocate_and_delete_invoice` chains both; admin invoice list/detail UX. Migration `20260920220000_phase_64_invoice_unallocate_delete_stock_restore.sql` (applied remote). Helper: `lib/invoice-delete.ts`.

Done (Phase 65): vehicle stock pools — `vehicles.stock_pool` (`owned`|`auction_third_party`); `/admin/vehicles` = owned only; `/admin/auction-stock` = third-party auction; transfer actions; Japan-origin defaults/backfill to auction; stock ops filter owned. Migration `20260920230000_phase_65_vehicle_stock_pool.sql` (applied remote). Helpers: `lib/stock.ts` (`STOCK_POOLS`), shared `AdminVehiclesInventoryPage`.

## 7. Mobile / PWA

Done (Phase 22): installable PWA for the public catalog on the same Next.js app and Supabase project. Manifest, icons, service worker (`/sw.js`), offline fallback (`/offline`), and optional install prompt. Admin/API/auth responses are never cached.

Done (Phase 24): Web Push for new insights and deals/offers. `push_subscriptions` + `site_offers`, public opt-in prompt, `/offers`, admin Deals & Offers with optional push, blog PWA push on publish, Edge Function `send-web-push` (VAPID). Staff must opt in per publish — no silent DB webhook. **Ops note:** Edge `VAPID_*` secrets must be real URL-safe base64 matching the Vercel public key or sends return 500.

Done (Phase 44): Capacitor native shell MVP — `capacitor.config.ts` (`com.anshatrading.app`) loads `https://www.anshatradingco.com` (or `CAPACITOR_SERVER_URL`) in an iOS/Android WebView. Config + `native/www` placeholder + npm scripts + `docs/Mobile.md`. Native `android/` / `ios/` are generated locally and gitignored. PWA unchanged; admin is not rewritten as native UI.

Done (Phase 45): tighter staff vs account-admin RBAC — `private.is_account_admin()` (active `role = 'admin'`); admin-only reverse GL / chart upsert / bank account create / supplier DELETE / payroll post + cancel-posted; `/admin/users` route + nav; portal-create-access stays admin. Sales allowlist unchanged. Migration `20260918330000_phase_45_rbac_admin_staff.sql`.

## 8. Later platform

Still open (not scheduled until chosen):

- AI automation and deeper ESP features — all against this PostgreSQL project
- Live bank OAuth (beyond CSV stub)
- Email newsletter list separate from push
- Automated E2E / unit test suite
- Manager location-scoped HR approvals (Phase 54 v1 is global viewer)
- Native admin rewrite (explicitly out of scope for Capacitor shell)

Stop after the current module until the next one is approved.

Done (home featured rotation): display-only 10-minute rotation of home featured parts (8) and vehicles (4) via `lib/featured-rotation.ts` + home client pool query. Admin `is_featured` unchanged for badges / pool boost. No cron, no migration. Tip around `e76df97`.

Checkpoint: [CURRENT_STATE](./CURRENT_STATE.md).

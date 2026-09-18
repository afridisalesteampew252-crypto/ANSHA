# API

The product is not a standalone REST/GraphQL backend. Clients talk to Supabase PostgREST under RLS. Next.js exposes one health route. Privileged user administration is two Edge Functions.

## Next.js

`GET /api/health`

- Dynamic, `Cache-Control: no-store`
- Checks `NEXT_PUBLIC_SUPABASE_URL` and publishable/anon key presence
- Fetches `${url}/rest/v1/parts?select=id&limit=1` with the publishable key
- Returns `healthy` / `degraded` / `unhealthy` without secrets
- Includes `VERCEL_ENV` and short `VERCEL_GIT_COMMIT_SHA` when present

`POST /api/ai/chat`

- Ops-only (`admin` / `staff` via cookie session + `admin_profiles`)
- Streams answers with the Vercel AI SDK (`streamText` + UI message stream)
- Grounds replies with RPC `get_ai_ops_grounding` (counts + recent/matched stock titles)
- Optional tool `searchOpsCatalog` for a second retrieval pass
- Persists messages when `threadId` is supplied (`ai_chat_threads` / `ai_chat_messages`)
- Requires server env `AI_GATEWAY_API_KEY` (preferred) or `OPENAI_API_KEY`; never exposed to the browser
- Optional `AI_MODEL` (default `openai/gpt-5-mini` via gateway)

There are no Server Actions.

## Supabase Data API

Browser and server clients use:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or fallback `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Public callers may:

- `SELECT` published catalog, categories, published blog
- `INSERT` `inquiries` and `part_requests` (anon policies from initial/blog migrations)

Staff (`admin_profiles` membership) may `SELECT`/`INSERT`/`UPDATE`/`DELETE` according to table policies. Sequence tables deny direct access.

Public RPC:

- `verify_invoice(p_verification_code uuid)` — returns document-facing fields only; used by `/verify/invoice/[code]`
- `get_my_customer_soa()` — portal-only sanitized statement (confirmed remittances, allocations, invoice KPIs); no notes, documents, or write RPCs

Workspace RPCs (names in Phase 10–16 migrations) wrap conversation create, mail send, and guarded financial edits. Call those instead of mutating sequence tables directly.

Vehicle lifecycle RPCs (Phase 18):

- `transition_vehicle_lifecycle(p_vehicle_id, p_to_stage, p_notes?, p_sync_stock_sold?)` — moves `lifecycle_stage`, writes history, optionally sets `stock_status = sold`
- `record_vehicle_lifecycle_event(p_vehicle_id, p_event_type, p_title?, p_notes?, p_metadata?)` — logs BL/inspection/shipping/etc. without changing stage

Request workflow RPCs (Phase 19):

- `create_workspace_request(...)` — staff-created BL/inspection/shipping/other tickets (intake types must link an existing inquiry or part request)
- `update_workspace_request(...)` — status, assignee, due date, title, notes; writes history
- `record_workspace_request_event(p_request_id, p_notes)` — append-only note
- `register_workspace_request_attachment(p_request_id, p_storage_path, p_file_name, p_mime_type?, p_size_bytes?)` — metadata after a private upload; path must be `requests/{request_id}/...`
- `delete_workspace_request_attachment(p_attachment_id)` — remove metadata and write an activity row; UI deletes the Storage object first

Chat linking RPCs (Phase 20):

- `link_chat_conversation(p_conversation_id, p_entity_type, p_entity_id)` — attach conversation to vehicle/customer/inquiry/invoice/request
- `unlink_chat_conversation(p_link_id)` — remove a link; membership required

VAT return RPCs (Phase 36, ops-only via `private.is_ops_user()`):

- `get_vat_return_summary(p_from date, p_to date)` — jsonb KPIs, per-currency rollups, output/input lines (reporting-first; no GL)
- `save_vat_return_period(p_from, p_to, p_label?, p_notes?, p_currency_focus?)` — persist snapshot into `vat_return_periods`

Payroll / leave RPCs (Phase 37 + Phase 48, ops-only via `private.is_ops_user()`):

- `decide_leave_request(p_leave_id, p_status, p_notes?, p_deduct_balance?)` - approve or reject; optional deduct of inclusive days from `employees.leave_balance_days` on annual leave approve (default true)
- `create_payroll_run(p_period_start, p_period_end, p_currency?, p_employee_ids?, p_notes?, p_bank_account_id?)` - draft PR- run with lines for active employees
- `update_payroll_line(p_line_id, p_basic_salary, p_allowances, p_deductions, p_notes?)` - edit draft line; refreshes run totals
- `post_payroll_run(p_run_id)` / `cancel_payroll_run(p_run_id)` - lock or cancel; no bank auto-pay
- `estimate_employee_eos(p_employee_id, p_as_of_date?, p_separation_type?, p_basic_salary?, p_persist?)` - UAE-oriented **indicative** EOS (21/30 day-wage bands, resignation/termination multipliers); optionally persists to `eos_estimate_logs`. **Not legal advice; not labour-law compliance.**


General ledger RPCs (Phase 38, ops-only via `private.is_ops_user()`):

- `upsert_gl_account(p_code, p_name, p_account_type, p_description?, p_is_active?, p_sort_order?, p_id?)` — create/update chart row
- `create_gl_journal(p_entry_date, p_description, p_lines jsonb, p_currency?, p_source_module?, p_source_id?)` — draft JE- with ≥2 lines
- `replace_gl_journal_lines` / `update_gl_journal_header` — draft edits only
- `post_gl_journal(p_journal_id)` — requires balanced debit = credit
- `reverse_gl_journal(p_journal_id, p_entry_date?, p_description?)` — posts reversing entry; marks original reversed
- `delete_draft_gl_journal(p_journal_id)`
- `gl_trial_balance(p_as_of?)` / `gl_profit_and_loss(p_from, p_to)` / `gl_balance_sheet(p_as_of?)` — statement views from posted journals only

AI ops assistant RPCs (Phase 42, ops-only via private.is_ops_user()):

- get_ai_ops_grounding(p_query?) — compact jsonb counts + recent vehicles + optional title matches

GL auto-post (Phase 46): no new public RPCs. `private.post_auto_gl_journal` / domain writers create posted journals keyed by `source_module` + `source_id` (idempotent unique index). AFTER triggers on remittance confirm/allocate, expense post/cancel (reverse), tax/commercial invoice leave-draft, supplier payment confirm. Account codes: 1000 Cash, 1100 AR, 2000 AP, 2100 VAT, 4000 Sales, 6000 OpEx (category hints fall back to 6000 until detailed COA exists).

Audit log (Phase 43): no public RPCs. Writes go through `private.write_audit_log(action, entity_type, entity_id, metadata?, actor_id?)` (SECURITY DEFINER; not granted to `authenticated`). Ops read `audit_logs` via Data API SELECT. Automatic hooks: invoice status updates, vehicle `stock_status` updates, remittance allocation insert/delete.

## Edge Functions

Invoked from `/admin/users` via `supabase.functions.invoke`. Shared CORS allowlist: `docs` canonical hosts, `http://localhost:3000`, `http://127.0.0.1:3000`, and `https://*.vercel.app`. Unknown origins get no `Access-Control-Allow-Origin`.

### `admin-create-user`

- POST, JWT required
- Caller must have `admin_profiles.role = 'admin'`
- Validates email, password length ≥ 8, full name, role `admin|staff`
- Uses anon client for `getUser()` and service-role client for Auth admin + profile upsert

### `admin-update-user`

- POST, JWT required
- Caller must be `role = 'admin'`
- Validates user id (UUID), email, full name, role; optional password ≥ 8
- Uses anon client for `getUser()` and service-role client for Auth admin + profile update

### `portal-create-access`

- POST, JWT required
- Caller must be `role = 'admin'`
- Creates an Auth user + `customer_profiles` row for an existing CRM customer
- Never inserts into `admin_profiles`

### `send-web-push`

- POST, JWT required
- Caller must exist in `admin_profiles` (admin or staff)
- Body: `{ topic: 'insights'|'deals'|'all', title, body, url }`
- Sends Web Push to rows in `push_subscriptions` filtered by topic flags
- Requires Edge secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, optional `VAPID_SUBJECT`
- Removes stale endpoints (HTTP 404/410)


### `send-whatsapp`

- POST, JWT required
- Caller must be active ops (`admin_profiles.role` in `admin|staff`)
- Body status probe: `{ action: 'status' }` → `{ configured: boolean }`
- Body send: `{ to, message_type: 'text'|'template', body?, template_name?, template_language?, customer_id? }`
- `to` must be E.164 (e.g. `+971501234567`); digits without `+` are normalized
- Calls Meta Graph Cloud API; appends `whatsapp_message_log` via service role
- Requires Edge secrets `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`; optional `WHATSAPP_API_VERSION`
- Missing credentials → HTTP 503 with `code: WHATSAPP_NOT_CONFIGURED` (admin UI shows setup steps)


### `send-outbound-email`

- POST, JWT required
- Caller must be active ops (`admin_profiles.role` in `admin|staff`)
- Body: `{ to_email, subject, body, related_invoice_id? }`
- Sends plain-text mail via Resend; inserts `outbound_email_log` with caller JWT (no service role)
- Requires Edge secret `RESEND_API_KEY`; optional `RESEND_FROM_EMAIL`
- Missing API key → HTTP 503 with configuration error (no silent fail)
- Also invoked from `/admin/campaigns` (Phase 49) for email-channel campaigns

### Marketing campaigns (Phase 49)

- Table `marketing_campaigns` (ops RLS); admin UI `/admin/campaigns`
- Send now: channel `push` → `send-web-push`; `email` → `send-outbound-email`; `offer` → `send-web-push` topic `deals` for linked `site_offers` row
- No new Edge Function; not list blast / drip automation

### `remind-request-dues`

- GET or POST, no end-user JWT (`verify_jwt` off)
- Auth: `Authorization: Bearer <CRON_SECRET>` (Edge Function secret `CRON_SECRET`)
- Calls `process_workspace_request_due_reminders()` with the service role
- Writes idempotent `workspace_request_due_reminders` rows and `admin_notifications` (`request_due`)

### Cron: `/api/cron/request-dues`

- Vercel Cron daily at 04:00 UTC (`0 4 * * *` in `vercel.json`; Hobby plan rejects hourly schedules)
- Auth: same `CRON_SECRET` (Vercel env); platform sends `Authorization: Bearer <CRON_SECRET>`
- Proxies to `remind-request-dues` using only the publishable key + cron secret (no service role on Next.js)

Service-role keys exist only as Edge Function secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). They must not be added as `NEXT_PUBLIC_*` variables.

## Storage API

Uploads go through `supabase.storage.from(bucket)` in admin Client Components. Public buckets are read by URL. Private buckets use signed URLs (profile ~1h, remittance 5m, internal files ~60s in current UI).

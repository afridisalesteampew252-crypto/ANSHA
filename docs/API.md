# API

The product is not a standalone REST/GraphQL backend. Clients talk to Supabase PostgREST under RLS. Next.js exposes one health route. Privileged user administration is two Edge Functions.

## Next.js

`GET /api/health`

- Dynamic, `Cache-Control: no-store`
- Checks `NEXT_PUBLIC_SUPABASE_URL` and publishable/anon key presence
- Fetches `${url}/rest/v1/parts?select=id&limit=1` with the publishable key
- Returns `healthy` / `degraded` / `unhealthy` without secrets
- Includes `VERCEL_ENV` and short `VERCEL_GIT_COMMIT_SHA` when present

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

Payroll / leave RPCs (Phase 37, ops-only via `private.is_ops_user()`):

- `decide_leave_request(p_leave_id, p_status, p_notes?)` — approve or reject a pending leave request
- `create_payroll_run(p_period_start, p_period_end, p_currency?, p_employee_ids?, p_notes?, p_bank_account_id?)` — draft PR- run with lines for active employees
- `update_payroll_line(p_line_id, p_basic_salary, p_allowances, p_deductions, p_notes?)` — edit draft line; refreshes run totals
- `post_payroll_run(p_run_id)` / `cancel_payroll_run(p_run_id)` — lock or cancel; no bank auto-pay
- `estimate_employee_eos(p_employee_id, p_as_of_date?)` — rough `basic_salary * years` helper; **estimate only, not legal advice**

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

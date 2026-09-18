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

Workspace RPCs (names in Phase 10–16 migrations) wrap conversation create, mail send, and guarded financial edits. Call those instead of mutating sequence tables directly.

Vehicle lifecycle RPCs (Phase 18):

- `transition_vehicle_lifecycle(p_vehicle_id, p_to_stage, p_notes?, p_sync_stock_sold?)` — moves `lifecycle_stage`, writes history, optionally sets `stock_status = sold`
- `record_vehicle_lifecycle_event(p_vehicle_id, p_event_type, p_title?, p_notes?, p_metadata?)` — logs BL/inspection/shipping/etc. without changing stage

Request workflow RPCs (Phase 19):

- `create_workspace_request(...)` — staff-created BL/inspection/shipping/other tickets (intake types must link an existing inquiry or part request)
- `update_workspace_request(...)` — status, assignee, due date, title, notes; writes history
- `record_workspace_request_event(p_request_id, p_notes)` — append-only note

Chat linking RPCs (Phase 20):

- `link_chat_conversation(p_conversation_id, p_entity_type, p_entity_id)` — attach conversation to vehicle/customer/inquiry/invoice/request
- `unlink_chat_conversation(p_link_id)` — remove a link; membership required

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

Service-role keys exist only as Edge Function secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). They must not be added as `NEXT_PUBLIC_*` variables.

## Storage API

Uploads go through `supabase.storage.from(bucket)` in admin Client Components. Public buckets are read by URL. Private buckets use signed URLs (profile ~1h, remittance 5m, internal files ~60s in current UI).

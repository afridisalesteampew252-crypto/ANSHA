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

## Edge Functions

Invoked from `/admin/users` via `supabase.functions.invoke`.

### `admin-create-user`

- POST, JWT required
- Caller must have `admin_profiles.role = 'admin'`
- Validates email, password length ≥ 8, full name, role `admin|staff`
- Uses anon client for `getUser()` and service-role client for Auth admin + profile upsert
- CORS currently `Access-Control-Allow-Origin: *`

### `admin-update-user`

- POST, JWT required
- Caller must be `role = 'admin'`
- Updates Auth email/password and `admin_profiles`
- Caller client is constructed with the service-role key (inconsistent with create-user)

Service-role keys exist only as Edge Function secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). They must not be added as `NEXT_PUBLIC_*` variables.

## Storage API

Uploads go through `supabase.storage.from(bucket)` in admin Client Components. Public buckets are read by URL. Private buckets use signed URLs (profile ~1h, remittance 5m, internal files ~60s in current UI).

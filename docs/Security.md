# Security

## AuthN / AuthZ chain

1. Supabase email/password
2. Cookie session via `@supabase/ssr`
3. `proxy.ts` requires claims + `admin_profiles` row for `/admin/*` except `/admin`
4. RLS uses `public.is_admin()` = membership in `admin_profiles`, not `role = 'admin'`
5. `role = 'admin'` is required only for Edge Function user create/update

Treat every browser query as hostile. Policies are the API.

## Secrets

Never commit `.env.local`. Never put service-role keys, database passwords, or private tokens in frontend code, git-tracked `vercel.json`, docs, or chat.

Allowed in the browser: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy anon key). Those names belong in Vercel env and `.env.local` only.

## RLS posture

- Public catalog: published rows only (Phase 1 hardened vehicles that were previously fully readable)
- Inquiries and part requests: public insert, staff read/update
- `workspace_requests` / events / attachments: staff SELECT only; create/update/notes/file register-delete via SECURITY DEFINER RPCs that require `private.is_workspace_user()`
- `customer_profiles`: own row SELECT for portal users; staff can manage; customers never receive `is_admin` / workspace write policies
- Customer invoice SELECT: own non-draft, non-cancelled invoices and their line items only
- `chat_conversation_links`: members SELECT; link/unlink via SECURITY DEFINER RPCs that require chat membership
- Finance, customers, imports, chat, mail, notifications: authenticated workspace members
- Sequence tables: deny direct access
- `verify_invoice`: SECURITY DEFINER, callable by anon; must remain field-limited

Advisor warnings (2026-09-17): leaked-password protection disabled; `is_admin()` and `verify_invoice` SECURITY DEFINER executability. Enabling HaveIBeenPwned on Auth still requires a dashboard action. Revoking `is_admin()` EXECUTE needs a login/RLS regression test.

## Storage

Public media buckets serve catalog/blog images. Private buckets (`profile-images`, `internal-files`, `remittance-documents`, `supplier-invoices`) must stay non-public. Path prefixes in policies bind chat/mail folders to membership and request files to `requests/{request_id}/` for workspace users.

## Edge Functions

Must verify the caller JWT with the anon key before using the service-role client. `admin-create-user` and `admin-update-user` both do this. CORS reflects an allowlist (canonical ANSHA hosts, localhost:3000, `https://*.vercel.app`) and does not use `*`.

Staff RLS is unchanged: `is_admin()` still means any `admin_profiles` row. Tightening staff write access needs a separate approval.

## XSS / HTML

Public blog pages render `post.content` as HTML. Only staff can write posts, but a compromised staff account can store script. Sanitize or switch to a safe format before expanding who can author.

JSON-LD uses `dangerouslySetInnerHTML` from server-built structured data.

## Transport / headers

`next.config.js` sets `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`. Admin paths are `no-store` and `noindex`.

## Logging

`/api/health` must not echo keys. Do not log Authorization headers or service-role values.

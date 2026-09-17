# Security

## AuthN / AuthZ chain

1. Supabase email/password
2. Cookie session via `@supabase/ssr`
3. `proxy.ts` requires claims + `admin_profiles` row for `/admin/*` except `/admin`
4. RLS uses `public.is_admin()` = membership in `admin_profiles`, not `role = 'admin'`
5. `role = 'admin'` is required only for Edge Function user create/update

Treat every browser query as hostile. Policies are the API.

## Secrets

Never commit `.env.local`. Never put service-role keys, database passwords, or private tokens in frontend code, `vercel.json` `NEXT_PUBLIC_*` beyond the publishable key, docs, or chat.

Allowed in the browser: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy anon key).

`vercel.json` currently inlines the publishable URL and key for builds. That key is not a service-role secret; moving it to Vercel env-only still requires approval.

## RLS posture

- Public catalog: published rows only (Phase 1 hardened vehicles that were previously fully readable)
- Inquiries and part requests: public insert, staff read/update
- Finance, customers, imports, chat, mail, notifications: authenticated workspace members
- Sequence tables: deny direct access
- `verify_invoice`: SECURITY DEFINER, callable by anon; must remain field-limited

Advisor warnings (2026-09-17): leaked-password protection disabled; `is_admin()` and `verify_invoice` SECURITY DEFINER executability. Fixing Auth settings and revoking unnecessary EXECUTE needs approval and a regression test of login and QR verify.

## Storage

Public media buckets serve catalog/blog images. Private buckets (`profile-images`, `internal-files`, `remittance-documents`, `supplier-invoices`) must stay non-public. Path prefixes in policies bind chat/mail folders to membership.

## Edge Functions

Must verify the caller JWT before using the service-role client. Create-user does this with the anon key. Update-user currently attaches the user JWT to a service-role client. CORS is `*`.

## XSS / HTML

Public blog pages render `post.content` as HTML. Only staff can write posts, but a compromised staff account can store script. Sanitize or switch to a safe format before expanding who can author.

JSON-LD uses `dangerouslySetInnerHTML` from server-built structured data.

## Transport / headers

`next.config.js` sets `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`. Admin paths are `no-store` and `noindex`.

## Logging

`/api/health` must not echo keys. Do not log Authorization headers or service-role values.

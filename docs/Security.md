# Security

## AuthN / AuthZ chain

1. Supabase email/password
2. Cookie session via `@supabase/ssr`
3. `proxy.ts` requires claims + `admin_profiles` row for `/admin/*` except `/admin`
4. RLS uses `public.is_admin()` = membership in `admin_profiles`, not `role = 'admin'`
5. Sensitive account actions use `private.is_account_admin()` = active `role = 'admin'` (Phase 45)
6. Field agents use `private.is_field_agent()` (`sales`|`freelancer`); receivables use `private.can_manage_receivables()` (`admin`|`staff`|`accounts`); HR SELECT uses `private.is_hr_viewer()` (Phases 54–55)
7. `role = 'admin'` is required for Edge Function user create/update and portal-create-access
8. Public `vehicle_photos` SELECT excludes `is_auction_sheet = true` (Phase 56)
9. `/admin/live-chat` is **admin + manager only** (`canAccessLiveChat` in `proxy.ts` + nav) — not staff/sales/freelancer/accounts
10. Commission claims (Phase 72): SELECT own or ops/accounts/manager; mutations only via `claim_stock_commission` / `review_commission_claim`

Treat every browser query as hostile. Policies are the API.

## Secrets

Never commit `.env.local`. Never put service-role keys, database passwords, or private tokens in frontend code, git-tracked `vercel.json`, docs, or chat.

Allowed in the browser: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy anon key). Those names belong in Vercel env and `.env.local` only.

AI keys (`AI_GATEWAY_API_KEY`, `OPENAI_API_KEY`) are server-only for `POST /api/ai/chat`. Never expose them via `NEXT_PUBLIC_*`.

## RLS posture

- Public catalog: published rows only (Phase 1 hardened vehicles that were previously fully readable)
- Inquiries and part requests: public insert, staff read/update
- `workspace_requests` / events / attachments: staff SELECT only; create/update/notes/file register-delete via SECURITY DEFINER RPCs that require `private.is_workspace_user()`
- `customer_profiles`: own row SELECT for portal users; staff can manage; customers never receive `is_admin` / workspace write policies
- Portal SOA: `get_my_customer_soa()` is SECURITY DEFINER and returns only confirmed remittance fields + own non-draft invoices; remittance tables stay workspace-RLS (no direct customer SELECT)
- Customer invoice SELECT: own non-draft, non-cancelled invoices and their line items only
- `chat_conversation_links`: members SELECT; link/unlink via SECURITY DEFINER RPCs that require chat membership
- Finance, customers, imports, chat, mail, notifications: authenticated workspace members
- `ai_chat_threads` / `ai_chat_messages`: ops-only; each user only manages their own threads
- Sequence tables: deny direct access (`purchase_order_sequences` RLS + deny-all; same posture as other counters)
- `tawk_webhook_receipts`: RLS on + explicit deny for anon/authenticated (Edge service role writes only)
- `touch_admin_last_seen()`: EXECUTE for `authenticated` only (anon revoked)
- `private.sync_catalog_sold_state` / `private.clear_reservation_buying_documents`: SECURITY DEFINER, not client-callable; required so Make Available / stock → available can clear unpaid reservation proformas
- `verify_invoice`: SECURITY DEFINER, callable by anon; must remain field-limited

Advisor warnings (2026-09-17): leaked-password protection disabled; `is_admin()` and `verify_invoice` SECURITY DEFINER executability. Enabling HaveIBeenPwned on Auth still requires a dashboard action. Revoking `is_admin()` EXECUTE needs a login/RLS regression test. Post-78 advisor hardening (`20260922020000_security_advisor_hardening.sql`, applied remote) closed the open `purchase_order_sequences` RLS gap, receipt-table policy vacuum, and anon presence heartbeat.

## Storage

Public media buckets serve catalog/blog images. Private buckets (`profile-images`, `internal-files`, `remittance-documents`, `supplier-invoices`) must stay non-public. Path prefixes in policies bind chat/mail folders to membership, request files to `requests/{request_id}/`, and vehicle lifecycle attachments to `vehicles/{vehicle_id}/…` for workspace users.

## Edge Functions

Must verify the caller JWT with the anon key before using the service-role client. `admin-create-user` and `admin-update-user` both do this. CORS reflects an allowlist (canonical ANSHA hosts, localhost:3000, `https://*.vercel.app`) and does not use `*`.

Staff may use day-to-day ops (`private.is_ops_user()`). Account-admin actions (`private.is_account_admin()`) cover user management, portal access create, GL reverse / chart changes, bank account create/delete, supplier hard-delete, payroll post / cancel-posted / deletes (Phase 53), and audit log SELECT (Phase 54). Field-agent and accounts gates: see `docs/Roles.md`.

## XSS / HTML

Public blog pages sanitize `post.content` via `lib/sanitize-html.ts` (allowlist) on render; admin save also sanitizes before write. Only staff can author posts — this limits XSS if an account is compromised.

JSON-LD uses `dangerouslySetInnerHTML` from server-built structured data. Public Product markup (`lib/product-schema.ts`) must omit `offers` unless price+currency are valid, and must attach `aggregateRating`/`review` only from real published testimonials — never invent ratings for GSC.

## Transport / headers

`next.config.js` sets `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`. Admin paths are `no-store` and `noindex`.

## Logging

`/api/health` must not echo keys. Do not log Authorization headers or service-role values.

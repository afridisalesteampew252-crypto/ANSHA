# Phase 1 Security Regression Checklist

This checklist is branch-only and is not auto-applied to production. Run it against a Supabase development/CI database before merging Phase 1 migrations.

## SECURITY DEFINER execution boundary

Expected public-schema exceptions:

- `public.verify_invoice(uuid)`: callable by `anon` only.
- `public.register_fcm_push_token(text,text)`: `authenticated` only.
- `public.register_push_subscription(text,text,text,boolean,boolean,boolean,text)`: `authenticated` only.

Verify with:

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('verify_invoice','register_fcm_push_token','register_push_subscription')
order by routine_name, grantee;
```

Expected: verify_invoice has anon but not authenticated; the two push RPCs have authenticated but not anon.

## SECURITY DEFINER search paths

All public SECURITY DEFINER functions should use a deliberate immutable search path. Prefer `search_path=''` with fully-qualified `public.*` / `private.*` references.

```sql
select p.oid::regprocedure as signature, p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
order by p.proname;
```

Review every row with missing or unnecessarily broad search_path.

## Public RLS baseline

```sql
select schemaname, tablename
from pg_tables
where schemaname='public' and rowsecurity=false
order by tablename;
```

Expected: zero rows.

## Private schema baseline

These currently have RLS but no policies: `private.admin_assistant_requests`, `private.public_form_submissions`. This is acceptable as deny-by-default only if no application path is intended to query them directly.

## High-risk RPC authorization tests

Using test users representing customer, sales/field agent, accounts, manager, and admin, verify direct RPC invocation and the corresponding UI action for customer reassignment, bulk stock reservation, vehicle price changes, invoice stock application, purchase-order confirmation/cancellation, payroll cancellation/deletion, GL posting/reversal, supplier-payment allocation/reversal, remittance reversal, and vehicle public-listing changes.

## Customer ownership boundary

Verify only admin/manager can change assignment; managers see only assigned customers and related invoices; sales/field agents cannot reassign; customers cannot read another customer's financial/portal records.

## Invoice verification boundary

`verify_invoice(uuid)` is intentionally public for QR authenticity verification. Test unknown UUID and disabled verification return `{ "valid": false }`; enabled verification returns only intentionally exposed fields; no internal IDs, payment proofs, remittance documents, or audit records are exposed; QR verification works without login.

## Push registration boundary

Verify unauthenticated FCM/browser-push registration is rejected; authenticated registration stores the caller's `auth.uid()`; the client cannot supply a different user ID; unauthenticated support preferences cannot be elevated; and an authenticated user cannot overwrite another user's subscription under the intended uniqueness rules.

## Production merge rule

Do not apply these migrations directly to production until regression checks pass on development/CI and the application flows are tested. Merge the completed Phase 1 branch only after the entire security pass is reviewed.

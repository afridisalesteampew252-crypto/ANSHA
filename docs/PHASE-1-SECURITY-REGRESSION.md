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

Automated catalog assertions live in `supabase/tests/database/phase_1_security.test.sql` and run with `supabase test db` after `supabase db reset`. They verify the definer search paths, execution grants, authenticated-only policies, manager owner scoping, inventory guard triggers, and privileged RPC guards. Executable behavior fixtures in `tests/database/*.test.sql` enforce actual `SET ROLE` privileges/RLS and invoke allowed and forbidden mutations. Run these with `psql -X -v ON_ERROR_STOP=1` against the same disposable database; catalog/function-text checks alone are insufficient.

The `Database Regression` GitHub Actions workflow performs that reset, pgTAP catalog tests, and transactional behavior suites on relevant pull requests or manual dispatch. It has no production project reference or database credentials.

## Customer ownership boundary

Verify only admin/manager can change assignment; managers see only assigned customers and related invoices; sales/field agents cannot reassign; customers cannot read another customer's financial/portal records.

Phase 1 now enforces manager ownership in both RLS and `assign_customer_owner()`: a manager may reassign only a customer currently assigned to that manager. Account admins retain global assignment.

## Inventory mutation boundary

Reservation transitions are allowed only for ops users, a field agent acting for an assigned customer, or a manager acting for an assigned customer and assigned stock origin. Release transitions and publishing through a release RPC are also guarded. Accounts cannot reserve/release; approved invoice finalization remains a receivables action. Direct catalog table writes are ops/assigned-origin manager only; field agents use the reservation RPCs. A valid customer-owner reassignment can still cascade reservation-owner metadata without changing status or origin.

## Invoice verification boundary

`verify_invoice(uuid)` is intentionally public for QR authenticity verification. Test unknown UUID and disabled verification return `{ "valid": false }`; enabled verification returns only intentionally exposed fields; no internal IDs, payment proofs, remittance documents, or audit records are exposed; QR verification works without login.

## Push registration boundary

Verify unauthenticated FCM/browser-push registration is rejected; authenticated registration stores the caller's `auth.uid()`; the client cannot supply a different user ID; unauthenticated support preferences cannot be elevated; and an authenticated user cannot overwrite another user's subscription under the intended uniqueness rules.

## Production merge rule

Do not apply these migrations directly to production until regression checks pass on development/CI and the application flows are tested. Merge the completed Phase 1 branch only after the entire security pass is reviewed.

## Performance-advisor disposition

- Multiple-permissive policies are not merged mechanically: many are intentional OR paths for public catalog, customer portal, and workspace roles. Consolidate only from a fresh advisor export when an equivalent single policy can be regression-tested.
- Do not remove indexes solely because the advisor reports them unused. The counters are workload- and reset-dependent, and several indexes protect infrequent month-end, audit, or foreign-key operations.
- The targeted high-traffic foreign-key indexes in `20260923180341_add_high_traffic_foreign_key_indexes.sql` and `20261006013000_add_missing_join_fk_indexes.sql` remain. Re-run the advisor on the disposable database and compare with production query plans before adding the remaining low-traffic indexes.
- The 2026-10-07 review adds four justified workflow FK indexes and a read-only advisor evidence report. See [Database review](PHASE-1-DATABASE-REVIEW.md) and [RPC audit](PHASE-1-RPC-AUDIT.md) for exact boundaries, test coverage and configuration limitations.

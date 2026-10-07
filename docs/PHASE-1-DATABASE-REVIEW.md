# Database security and performance review — 2026-10-07

The combined follow-up branch has been validated locally. During the authorized release, all 17 October 7 migrations through `20261007090000` were applied to production. Final live catalog inspection confirms no unsafe application definer paths, no public tables without RLS, and `verify_invoice(uuid)` as the only anonymous definer entry point.

## Concrete security fixes

- Customer assignment rejects missing and inactive workspace roles explicitly. SQL `NULL NOT IN (...)` previously skipped the role rejection; same-owner requests could still return owner details and write an audit entry.
- Managers read only their customer book, invoices and related items. Portal identity links are now administered by account admins; a generic workspace user can no longer relink a portal account to another customer's records.
- Inventory guards cover both entering and leaving a reservation, changes to reservation ownership, and publishing through `release_*_reservation(p_republish)`. Accounts cannot release reservations. Field agents retain their own-customer single-item reservation/release RPCs. Managers require customer ownership and stock origin access.
- Direct catalog writes are restricted to ops and managers in their assigned origins. Reservation RPCs are the field-agent write path. Accounts retain their authorized price and invoice stock RPCs.
- Approved manager customer reassignment can still cascade reservation ownership. The trigger permits only a nested ownership-metadata update for the same reservation, tied to the newly assigned customer owner.
- Payment proof visibility and internal definer execution grants are audited in `20261007032000_phase_1_proof_scope_and_function_grants.sql` and the RPC audit document.
- Payroll cancellation authorizes before returning an existing cancelled record. Direct table triggers enforce payroll posting/cancellation/deletion and GL reversal/posted-line restrictions, while guarded automatic GL posting/reversal remains available. The role fixtures include those successful financial workflows as well as denial cases.
- Native push delivery rechecks the recipient's current customer ownership/active status, so an alert queued before a customer reassignment cannot disclose the financial event to the previous manager.

## Index review

The earlier **238 unused indexes** was a historical advisor count. The current read-only production report found **499 indexes, 386 with zero scans**, including **230 zero-scan indexes that are neither constraint, unique nor replica-identity indexes**. It found **zero exact duplicate pairs**. No index is removed in this branch. `pg_stat_database.stats_reset` is NULL, so the observation window is unknown; infrequent payroll, GL, audit and month-end workloads can legitimately show zero scans. Constraint indexes, replica identity indexes, trigram searches, public listing ordering, and FK-supporting indexes are retained.

[`scripts/security/database-performance-report.sql`](../scripts/security/database-performance-report.sql) is a read-only catalog report. It exports index usage and sizes, exact duplicate candidates (including predicates, expression keys, opclasses, ordering and included columns), FK leading-key coverage, and permissive-policy overlaps after expanding `ALL` actions and `PUBLIC` roles. Partial FK indexes are shown separately for predicate review rather than incorrectly classified as missing.

The report ran against both the disposable migration replay and production through read-only SQL. Keep two representative observation windows before choosing any removal. Use `EXPLAIN` for the actual application query and parameters before a measured performance claim; this branch claims coverage, not a measured latency improvement.

Four indexes are justified by existing application and SQL paths:

| New index | Existing path it covers |
| --- | --- |
| `vehicles_reserved_customer_idx` | Portal reservations, customer reassignment cascade, FK checks; parts already has the counterpart |
| `push_subscriptions_user_id_idx` | Recipient device lookup and owner policies; the existing support-only index excludes devices with support disabled |
| `inquiries_customer_profile_id_idx` | Customer portal inquiries and portal-profile deletion FK checks |
| `inventory_receipt_lines_purchase_order_line_id_idx` | PO receipt/remaining quantity joins and reverse FK checks |

Existing null-only partial indexes for supplier payments, bank remittances and export customers already cover equality queries and are retained. Low-traffic creator/auditor FKs remain review candidates; adding an index to every such column would create additional write and storage costs without query evidence.

The production catalog contains **225 foreign keys: 115 with full leading-key index coverage, 51 with partial coverage, and 59 without leading-key coverage**. Partial predicates and the remaining low-frequency relationships need query/workload evidence before adding indexes indiscriminately.

## Permissive-policy review

Policies for public catalog, customer-owned financial records and workspace-owned records implement separate authorized OR paths. They must not be mechanically merged based only on advisor count. This branch fixes concrete broad permissions (portal identity management, manager proof visibility, and direct inventory writes). The production report identifies **47 overlapping role/action groups** for semantic review. Equivalent consolidation can follow observed execution plans; overlap alone is not evidence of excess authorization.

## Query payloads

The dashboard's five recent inquiries now select only `id,customer_name,message,status`, matching the displayed fields with a typed DTO. Stock helpers and financial/dashboard totals already use explicit field lists. Detail/edit screens that actually consume whole records retain their query shape; unrelated broad-query changes are not justified by an advisor warning alone.

## Auth connection allocation

Management access was restored during release. Production Auth allocation was changed from **10 connections to 17 percent of a 60-connection database capacity**, preserving approximately the previous reserve. A subsequent Management API read verified `db_max_pool_size: 17` and `db_max_pool_size_unit: "percent"`. Recheck the effective allocation after a compute-size change and validate login/refresh under representative traffic.

Enabling the Password Verification Attempt hook returned **HTTP 402 because the project plan does not support that hook**. The deployed login gateway has a server-side failure counter, but direct provider password attempts are not protected by the unavailable hook. Hook activation requires a supported plan; local SQL hook tests do not establish production activation.

## Executable regression and replay

[`scripts/test-database-regression.py`](../scripts/test-database-regression.py) runs application migrations atomically and executable role/action tests against a named disposable local PostgreSQL container. It never accepts a database URL. [`tests/database/phase-1-role-boundaries.test.sql`](../tests/database/phase-1-role-boundaries.test.sql) uses actual `SET ROLE anon/authenticated`, JWT claims and customer/manager/sales/accounts/admin fixtures, and rolls back all changes. Assertions test reads and successful/denied mutations, not only function definition text.

The vanilla PostgreSQL fallback supplies the Auth claim functions, Storage metadata tables, public grants and a Realtime publication needed by migrations. It excludes the unavailable `pg_net` transport; Vault is empty so native push hooks take their normal no-delivery branch. It does not validate Supabase HTTP/Auth hooks, network delivery, Realtime services or Storage object APIs. The full Supabase workflow remains the service integration gate.

Validation: a fresh empty PostgreSQL 15 database replayed **154 application migrations** successfully, and **seven executable behavior suites** passed. The 155th migration was then applied to that database and all seven suites rerun. Its hosted-only branch was separately tested by restoring all eight actual hosted function definitions, applying the migration twice and checking paths/grants in a rolled-back transaction. The suites cover catalog pricing, customer assignment undo/reset audit, customer finance history, finance RPC/direct-table boundaries, notification ownership/work queues/native-delivery eligibility, password lockout, and role/ownership/inventory boundaries. Catalog checks found zero public tables without RLS, zero application SECURITY DEFINER functions with an unsafe search path, and `verify_invoice(uuid)` as the only anonymous definer entry point.

Fresh replay also revealed historical failures that SQL parsing missed: the SOA declaration rename assumed an inserted `::text` cast; native push migration recreated existing policies; model-spec cleanup ran before its table was created; and optional hosted inventory-event/sequence aliases were assumed to exist. The affected migrations now handle fresh replay while preserving hosted behavior.

Production migration history was reconciled by version and name, not by subtracting total counts. Of the 39 repository versions absent from the pre-release history, 21 were recorded under equivalent hosted names/versions and two September corrections were already effective in the live function definitions. Those 23 historical scripts were not replayed. The remaining 16 October 7 migrations were the actual release package. The SOA correction now matches only the declaration; original, cast and already-correct hosted variants each passed two local applications without corrupting the identifier.

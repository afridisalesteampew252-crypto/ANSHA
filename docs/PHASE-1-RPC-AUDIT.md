# Phase 1 RPC authorization audit — 2026-10-07

This checkpoint reviews the effective application definitions after replaying migrations and the read-only hosted function snapshot, rather than treating an earlier definition of the same function as current. Verification used a disposable PostgreSQL database with Supabase-compatible roles, privileges, auth helpers and RLS. The release operator separately applied the authorized 17 October 7 production migrations through `20261007090000`.

## Findings corrected

| Finding | Evidence before correction | Final boundary |
| --- | --- | --- |
| Nullable customer-assignment role | `20261007025000`: `caller_role NOT IN (...)` did not reject NULL; a same-owner update could return hidden owner details | `20261007030000`: explicit missing-user/missing-role rejection before row lookup |
| Managers could read every customer payment proof and private file | `20260923110000`: `can_assign_customer_owner()` was an unscoped SELECT branch on both proof rows and `storage.objects` | `20261007032000`: manager must own the proof/file's customer; admin/staff/accounts retain receivables access |
| Manager proof matching bypassed normal remittance RLS | `match_customer_payment_proof()` was a definer accepting managers, then called invoker `link_remittance()` with the definer's database privileges | `20261007032000`: matching/rejection require `can_manage_receivables()`; managers may read assigned proofs but cannot review them |
| Cancelled payroll data returned before authorization | `20260918330000.cancel_payroll_run()`: a cancelled run returned before either role check | `20261007032000`: ops check precedes lookup and early return; posted cancellation remains account-admin only |
| Unsafe private payroll helpers retained default execution grants | `20260918260000`: `assert_draft_payroll_run(uuid)` returns/locks a full run and `refresh_payroll_run_totals(uuid)` mutates totals, with no original revoke | `20261007032000`: both deny PUBLIC/anon/authenticated; guarded definer payroll RPCs retain access |
| Other private functions retained inherited or explicit anonymous grants | Live `pg_proc` privilege review found PUBLIC execution on predicates, internal requester and trigger functions | `20261007032000`: revoke PUBLIC/anon on all public/private definers except invoice verification; revoke client execution on private triggers and internal requester; preserve authenticated predicates |
| RPC-only payroll/GL restrictions could be bypassed by direct table writes | `workspace_manage_payroll_runs`, employees and GL journal policies allowed ops writes while payroll posting/deletion and manual GL reversal RPCs required admin | `20261007032000`: direct payroll/employee/GL mutation triggers enforce sensitive roles, protect posted payroll lines and prevent edits to posted GL lines/amounts |
| Former invoice creators retained item visibility after account reassignment | `20260920040000.field_agent_owns_invoice()` accepted historical `created_by`, while current invoice SELECT enforced `owner_id` | `20261007032000`: the helper uses active field-agent status and current invoice owner only; transfer fixture proves invoice and item access disappear together |
| Hosted-only compatibility routines retained `search_path=public` | The production snapshot contained eight legacy definers absent from fresh replay | `20261007090000`: optional existence checks, empty paths, anonymous grants revoked and private routines inaccessible to authenticated clients; explicit identity check for outbound logging |

The direct-finance trigger is intentionally `SECURITY INVOKER`. It enforces direct client writes while preserving the existing guarded definer RPC and GL auto-post/reversal paths. Trusted executing database roles are checked through `pg_catalog.pg_roles` (`rolsuper`/`rolbypassrls`), rather than accepting a client-supplied request flag. The regression suite proves that staff expense cancellation still creates its automatic reversal.

## Reviewed financial mutation catalogue

The safe boolean role helpers use `EXISTS` over an active `admin_profiles` row and return false for a missing role. `is_ops_user()` means admin/staff; `is_account_admin()` means active admin; `can_manage_receivables()` means admin/staff/accounts. Every entry below uses an empty search path and qualified application objects.

| Effective family / RPCs | Latest defining migration | Guard / scope |
| --- | --- | --- |
| `next_po_number`, `create_purchase_order`, `confirm_purchase_order`, `cancel_purchase_order`, `refresh_purchase_order_match`, `link_supplier_invoice_to_po`, `create_inventory_receipt` | `20260918160000_phase_29_purchase_orders.sql` | Ops before reading/mutating; confirmation draft-only; supplier/status/currency/line checks remain |
| `create_supplier_payment`, `allocate_supplier_payment`, `reverse_supplier_payment_allocation` | `20260918170000_phase_30_supplier_payments.sql` | Ops; allocation validates confirmed state, available balance, supplier and currency; internal PO refresh denied to clients |
| `create_bank_account` | `20260918330000_phase_45_rbac_admin_staff.sql` | Account admin |
| Bank number helpers, `update_bank_account`, `create_bank_transaction`, `set_bank_transaction_reconciled`, `get_bank_account_balance` | `20260918230000_phase_34_bank_accounts.sql` | Ops; positive amount/valid direction/account checks |
| `import_bank_transactions_stub` | `20260918380000_phase_50_bank_feeds_stub.sql` | Ops; active account and valid import rows |
| Expense numbering, `create_expense`, `update_expense`, `post_expense`, `cancel_expense` | `20260918240000_phase_35_expenses.sql` | Ops; only draft expenses update/post; cancellation invokes private GL reversal |
| `register_expense_attachment`, `delete_expense_attachment` | `20261006040000_expense_attachments.sql` | Authenticated receivables; cancellation/file path/type/size checks |
| `get_vat_return_summary`, `save_vat_return_period` | `20260918250000_phase_36_vat_return.sql` | Ops; date/currency validation |
| Payroll numbering, `create_payroll_run`, `update_payroll_line` | `20260918260000_phase_37_payroll.sql` | Ops; draft assertion; private helpers inaccessible directly after 32000 |
| `post_payroll_run` | `20260918330000_phase_45_rbac_admin_staff.sql` | Account admin; draft run, nonempty lines, totals refresh |
| `cancel_payroll_run` | `20261007032000_phase_1_proof_scope_and_function_grants.sql` | Ops first; posted cancellation admin-only; no unauthorised idempotent return |
| `delete_payroll_run`, `delete_payroll_employee` | `20260920020000_phase_53_payroll_delete.sql` | Account admin; run deletion rejects posted state |
| `decide_leave_request`, `estimate_employee_eos` | `20260918360000_phase_48_payroll_eos.sql` | Ops; valid state/range and employee checks |
| `upsert_gl_account`, `reverse_gl_journal` | `20260918330000_phase_45_rbac_admin_staff.sql` | Account admin; reversal requires posted unreversed journal |
| GL numbering, `create_gl_journal`, `replace_gl_journal_lines`, `update_gl_journal_header`, `post_gl_journal`, `delete_draft_gl_journal` | `20260918270000_phase_38_general_ledger.sql` | Ops; draft editing/deletion; posting requires balanced positive totals and at least two lines |
| GL trial balance/P&L/balance sheet, original and currency-specific variants | `20260918270000` / `20260926230000_currency_isolated_gl_statements.sql` | Ops; currency/range checks on currency-specific variants |
| `reverse_remittance_allocation`, `unallocate_invoice_remittances` | `20260921030000_phase_71_allocate_unallocate_fix.sql` | Receivables before row lookup/update |
| `match_customer_payment_proof`, `reject_customer_payment_proof` | `20261007032000_phase_1_proof_scope_and_function_grants.sql` | Receivables before proof lookup; matching validates amount/currency/unknown state |
| `apply_invoice_stock` | `20261007026000_phase_1_inventory_rpc_boundaries.sql` | Receivables; actual mutation remains private internal helper |
| `bulk_update_vehicle_prices` | `20261007070000_catalog_prices_and_model_defaults.sql` | Receivables; bounded selection, finite adjustment, supported term field, FOB/public-price synchronization |
| `assign_customer_owner` | `20261007030000_phase_1_fail_closed_ownership_and_inventory.sql` | Explicit active admin/manager role; manager must currently own customer; active target owner |
| Private auto-GL writers/lookup/numbering/reversal, GL/landed-cost/PO refresh helpers, invoice stock and invoice recalculation | Domain migrations, execution sweep in `20261007032000` | Internal-only; PUBLIC/anon denied; mutation helpers and private triggers deny authenticated execution |

Invoice creation/update/deletion and remittance creation/linking/allocation also include `SECURITY INVOKER` RPCs. They retain table RLS instead of bypassing it. In particular, manager remittance UPDATE is disabled by `20261007025000`; proof RPCs no longer turn that invoker boundary into an escalation path. Later FX receipt wrappers keep authenticated receivables guards and per-receipt recorded rates.

## Verified actions

`tests/database/finance-rpc-boundaries.test.sql` passes against the disposable migrated database and rolls back its fixtures. It verifies:

- Anonymous, customer, accounts and sales denial for sensitive payroll/GL/PO/supplier-payment actions, including cancelled payroll row leakage.
- Manager proof/file reads limited to assigned customers and proof-review denial.
- Staff denial for direct payroll posting, posted cancellation, run/employee deletion and posted payroll-line changes.
- Staff denial for direct GL reversal and edits to posted amounts/lines.
- Successful staff draft payroll cancellation, balanced GL posting and expense cancellation with automatic GL reversal.
- Successful accounts proof rejection and admin payroll post/cancel/delete, manual GL reversal and proof matching to the correct customer.
- Sales creators lose both invoice and invoice-item access when admin reassigns the customer book.

Separate branch fixtures cover customer/manager/inventory ownership, authentication actions, FX history, catalog pricing, notifications and password lockout. This audit's tests run without production credentials.

## Hosted-only compatibility routines

The production snapshot also contained `private.recalc_purchase_order_total`, `private.trg_audit_lifecycle_stage`, `private.trg_audit_row_change`, `private.trg_po_items_recalc`, `public.delete_vehicle_lifecycle_attachment`, `public.register_vehicle_lifecycle_attachment`, `public.record_outbound_message` and `public.write_audit_log`. Their application table/helper references are schema-qualified. Migration `20261007090000` hardens their paths and execution grants when present and makes outbound logging's existing workspace identity requirement explicit. Fresh installations where they are absent remain supported.

The legacy lifecycle attachment APIs retain their existing active-workspace authorization contract. This patch does not claim manager-origin isolation for those compatibility APIs; narrowing their scope needs validation of the hosted lifecycle flows. The eight actual hosted definitions were restored into a disposable transaction, the patch applied twice, and the resulting paths/anonymous grants verified successfully.

## Execution-grant result and operational checks

The post-migration catalog review shows `verify_invoice(uuid)` as the only anonymous public/private definer entry point. Its authenticated grant remains denied. The due-reminder processor remains service-role only. Authenticated RLS predicates retain their grants. Unsafe private payroll helpers and trigger functions deny direct authenticated execution.

The migration removes postgres's global future PUBLIC function execution default and schema-local anonymous defaults for the application schemas. PostgreSQL cannot subtract the built-in global PUBLIC grant with a schema-local revoke alone; transaction-only new-function probes verify the resulting defaults. Existing platform function ACLs are unaffected. Public RPCs must retain deliberate authenticated grants and internal guards; any future anonymous exception must be explicitly granted and covered by the catalog assertion.

The 154-migration fresh replay and all seven behavior suites passed; the optional 155th hosted-legacy migration also passed local incremental replay and repeated hosted-definition tests. The forward patch was then applied to production; final inspection found zero unsafe application definer paths and only `verify_invoice(uuid)` available anonymously. The local bootstrap validates application SQL, roles and RLS, while Supabase CI additionally validates the native platform schema/extension setup. The current production index catalog and Auth percentage setting were read back during release. Native password-hook activation is blocked by the project's plan (HTTP 402); local hook tests do not imply that direct provider password attempts are covered.

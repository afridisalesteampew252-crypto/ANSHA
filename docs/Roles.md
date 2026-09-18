# Roles

## Implemented roles

| Role | Where stored | Meaning in the running system |
|---|---|---|
| Anonymous visitor | no row | Browse published **available** catalog/blog; submit inquiry and part request; verify invoice by UUID |
| `staff` | `admin_profiles.role` default | Day-to-day operations via `private.is_ops_user()` (PO, GRN, invoices, remittances, expenses, bank txns, shipments, draft GL, etc.). **Cannot** perform account-admin actions below |
| `admin` | `admin_profiles.role` | Same ops access as staff, plus **account-admin** sensitive actions (`private.is_account_admin()`) |
| `sales` | `admin_profiles.role` | Route-limited ERP (catalog, customers, **reservations**, **customer invoices**, inquiries, requests, chat/mail, **dashboard/analytics**). **Cannot** open suppliers, GRN receive, remittances, supplier invoice archive. May reserve vehicles and create proformas. Analytics/RPC returns own-book receivables only. |

There is no department role and no `domain.action` permission matrix in code. Customer portal uses `customer_profiles`, not `admin_profiles`.

## Authorization helpers (do not conflate)

| Helper | Meaning |
|---|---|
| `public.is_admin()` | Legacy: any `admin_profiles` row (membership). **Not** `role = 'admin'`. Keep this name for RLS that only means “workspace member”. |
| `private.is_workspace_user(uuid)` | Active `admin_profiles` row (any role). Single signature with `DEFAULT auth.uid()` — **no** zero-arg overload. |
| `private.is_ops_user()` | Active `admin` **or** `staff` — day-to-day trading / finance ops |
| `private.is_account_admin()` | Active `role = 'admin'` — sensitive / irreversible account actions (Phase 45) |
| `private.is_platform_admin()` | Alias of `is_account_admin()` (legacy name; now also requires `is_active`) |
| `private.is_sales_agent()` | Active `role = 'sales'` |

## Staff vs account-admin matrix (Phase 45)

### Account admin only (`role = 'admin'`, active)

| Area | Enforcement |
|---|---|
| Manage / deactivate workspace users | Edge `admin-create-user` / `admin-update-user`; route `/admin/users`; nav hide |
| Create customer portal access | Edge `portal-create-access`; UI gated on customer SOA page |
| Reverse posted GL journals | RPC `reverse_gl_journal` |
| Change GL chart of accounts | RPC `upsert_gl_account` + RLS write on `gl_accounts` |
| Create / delete bank accounts | RPC `create_bank_account` + RLS INSERT/DELETE on `bank_accounts` |
| Post payroll; cancel **posted** payroll | RPC `post_payroll_run`; `cancel_payroll_run` when status = posted |
| Hard-delete suppliers | RLS DELETE on `suppliers` (soft deactivate via UPDATE stays ops) |
| Force vehicle lifecycle stage jump | RPC `transition_vehicle_lifecycle` with `p_force` + reason notes (Phase 47) |
| Audit log purge | **None** — `audit_logs` is append-only; no purge RPC |

### Staff + admin (ops)

Day-to-day: suppliers create/edit (not hard delete), PO, GRN, landed cost, export shipments, customer invoices, remittances, expenses, bank **transactions** / reconcile, update existing bank accounts, draft/post GL journals (not reverse), draft payroll create/edit/cancel, VAT packs, outbound email, WhatsApp, AI assistant, audit log **read**, catalog, etc.

### Sales

Unchanged allowlist in `proxy.ts` and admin nav (`SALES_ALLOWED_HREFS`).

## Enforcement locations

- Route: `proxy.ts` — any active `admin_profiles` row; `sales` allowlist; `/admin/users` requires `role = 'admin'`
- UI: nav hides Users for non-admin; ledger reverse / chart edit, bank account create, payroll post / cancel-posted, portal enable — admin only
- Database: catalog/finance often `is_admin()` or `is_ops_user()`; sensitive RPCs/RLS use `private.is_account_admin()`
- Edge Functions: `callerProfile.role !== 'admin'` (and inactive) → 403 for user-admin and portal-create

## Invariant

A Supabase Auth user without `admin_profiles` cannot use the ERP. Login signs them out.

## Purchase inventory (Phase 28)

- Creating/editing suppliers, purchase orders, posting GRNs, supplier payments/SOA, export shipments, landed-cost packs, bank account **updates**/reconciliation, operating expenses, VAT return packs, payroll/leave **drafts**, general ledger **draft/post** journals, financial reports, outbound email, and WhatsApp Cloud API sends: **admin/staff only**
- Reserving / releasing vehicle stock and sales reservation + proforma: any workspace user (`sales` included)
- Publishing vehicles: only when `stock_status = available` (`set_vehicle_public_listing`)
- Applying sold status on tax/commercial invoice lines: runs inside invoice create RPC for workspace users who can create invoices
- Export shipment status changes may log lifecycle events and attempt a soft move to `port` (ignored if already past or blocked by Phase 47 recommended-path rules)
- Vehicle lifecycle stage transitions: any workspace user for the **recommended** next hop; skipping stages requires account-admin `p_force` + reason notes. Lifecycle event attachments use the same workspace access as today.

## Future RBAC

Further splits (e.g. staff cannot see all remittances) need schema + policy + UI changes. Do **not** reuse `public.is_admin()` for `role = 'admin'` — use `private.is_account_admin()`.

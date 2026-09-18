# Roles

## Implemented roles

| Role | Where stored | Meaning in the running system |
|---|---|---|
| Anonymous visitor | no row | Browse published **available** catalog/blog; submit inquiry and part request; verify invoice by UUID |
| `staff` | `admin_profiles.role` default | Full operations workspace access via `is_admin()` / `is_ops_user()` RLS |
| `admin` | `admin_profiles.role` | Same ops access, plus create/update staff Auth users |
| `sales` | `admin_profiles.role` | Route-limited ERP (catalog, customers, **reservations**, **customer invoices**, inquiries, requests, chat/mail). **Cannot** open suppliers, GRN receive, remittances, supplier invoice archive. May reserve vehicles and create proformas. |

There is no department role and no `domain.action` permission matrix in code. Customer portal uses `customer_profiles`, not `admin_profiles`.

## Enforcement locations

- Route: `proxy.ts` — any active `admin_profiles` row; `sales` allowlist redirects other `/admin` paths to dashboard
- UI: nav hides non-allowlisted items for `sales`; `/admin/users` manage actions require `admin`
- Database: catalog/finance often `is_admin()`; purchase master (`suppliers`, GRN) uses `private.is_ops_user()` (admin/staff, not sales)
- Edge Functions: `callerProfile.role !== 'admin'` → 403 for user-admin functions

## Invariant

A Supabase Auth user without `admin_profiles` cannot use the ERP. Login signs them out.

## Purchase inventory (Phase 28)

- Creating/editing suppliers, purchase orders, posting GRNs, supplier payments/SOA, export shipments, landed-cost packs, bank accounts/reconciliation, operating expenses, VAT return packs, and payroll/leave: **admin/staff only**
- Reserving / releasing vehicle stock and sales reservation + proforma: any workspace user (`sales` included)
- Publishing vehicles: only when `stock_status = available` (`set_vehicle_public_listing`)
- Applying sold status on tax/commercial invoice lines: runs inside invoice create RPC for workspace users who can create invoices
- Export shipment status changes may log lifecycle events and attempt a soft move to `port` (ignored if already past)

## Future RBAC

If staff must be prevented from deleting invoices, managing users, or seeing all remittances, that is a schema + policy + UI change. Do not assume it exists. Do not reuse the name `is_admin()` for `role = 'admin'` without renaming the function in a planned migration.

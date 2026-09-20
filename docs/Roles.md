# Roles

## Implemented roles

| Role | Where stored | Meaning in the running system |
|---|---|---|
| Anonymous visitor | no row | Browse published **available** catalog/blog; submit inquiry and part request; verify invoice by UUID |
| `staff` | `admin_profiles.role` default | Day-to-day operations via `private.is_ops_user()` (PO, GRN, invoices, remittances, expenses, bank txns, shipments, draft GL, etc.). **Cannot** perform account-admin actions below |
| `admin` | `admin_profiles.role` | Same ops access as staff, plus **account-admin** sensitive actions (`private.is_account_admin()`) |
| `sales` | `admin_profiles.role` | **Field agent**: catalog browse (parts/vehicles list only), own-book customers, **vehicle reservations**, **draft proforma invoices**, team chat, light dashboard. **Cannot** create/edit catalog, send/finalise invoices, finance, HR, imports |
| `freelancer` | `admin_profiles.role` | Same field-agent gates as `sales` (contractor label). Own-book customers + reserve + draft proforma |
| `accounts` | `admin_profiles.role` | **Receivables / finance**: customer invoices (all types; approve draft→sent), remittances, expenses, bank txns/views, supplier invoices, GL chart SELECT, VAT/report views. **Not** full admin (no users, audit purge, catalog writes, PO/GRN) |
| `manager` | `admin_profiles.role` | **Location-scoped inventory/ops** + HR viewer (+ live chat). Sees/manages vehicles & parts whose `stock_origin` is in `allowed_stock_origins` (Phase 66). Empty assignment → no inventory. Export shipments: **read** when linked units match. Cannot open finance/payroll/marketing/users/purchase writes. HR shift locations still global viewer (ops write). |

There is no department role and no `domain.action` permission matrix in code. Customer portal uses `customer_profiles`, not `admin_profiles`.

## Authorization helpers (do not conflate)

| Helper | Meaning |
|---|---|
| `public.is_admin()` | Legacy: any `admin_profiles` row (membership). **Not** `role = 'admin'`. Keep this name for RLS that only means “workspace member”. |
| `private.is_workspace_user(uuid)` | Active `admin_profiles` row (any role). Single signature with `DEFAULT auth.uid()` — **no** zero-arg overload. |
| `private.is_ops_user()` | Active `admin` **or** `staff` — day-to-day trading / finance ops |
| `private.is_accounts_user()` | Active `role = 'accounts'` (Phase 55 receivables role) |
| `private.can_manage_receivables()` | Active `admin` \| `staff` \| `accounts` — invoices, remittances, related finance views |
| `private.is_account_admin()` | Active `role = 'admin'` — sensitive / irreversible account actions (Phase 45) |
| `private.is_platform_admin()` | Alias of `is_account_admin()` (legacy name; now also requires `is_active`) |
| `private.is_sales_agent()` | Active `role = 'sales'` (own-book analytics / legacy sales-only checks) |
| `private.is_field_agent()` | Active `sales` **or** `freelancer` (Phase 54 shared catalog/reserve gate; Phase 55 draft proforma) |
| `private.is_hr_viewer()` | Active `admin` \| `staff` \| `manager` (Phase 54 HR SELECT) |

## Field agents (`sales` / `freelancer`)

| Area | Allowed |
|---|---|
| Routes (`proxy.ts`) | `/admin/dashboard`, `/admin/parts` + `/admin/vehicles` **lists only**, `/admin/customers`, `/admin/reservations`, `/admin/invoices` (list/new/detail; no supplier), `/admin/chat`, `/admin/profile` |
| Nav | Same allowlist via `FIELD_AGENT_NAV_HREFS` |
| Catalog UI | Ops-oriented reservation cards — no Add/Import |
| Catalog writes | Ops-only RLS; field agents blocked at route + UI |
| Customers | Own-book (`owner_id = auth.uid()`) via `is_field_agent()` |
| Invoices | **Draft `proforma_invoice` only** (`create_invoice_v3` + RLS + trigger). Cannot set status to sent / paid paths |
| After vehicle reserve | Opens the draft proforma detail |

## Accounts (Phase 55)

| Area | Allowed |
|---|---|
| Routes | Dashboard, customers, invoices (incl. supplier), remittances, bank accounts, expenses, ledger, reports, VAT, chat, profile |
| Invoices | Create all document types; **approve draft→sent**; record payments |
| Remittances / expenses / bank txns | Yes (not create/delete bank accounts — still account-admin) |
| Not allowed | Users, audit log, catalog writes, purchase/PO/GRN, marketing, HR |

## Managers (Phase 54 + 66 location scope)

- Can open **catalog** (parts/vehicles/auction-stock), **stock dashboards**, **reservations**, **export shipments** (read), **HR**, **Live chat**, Team Chat.
- Inventory is filtered by `admin_profiles.allowed_stock_origins` (RLS + UI). Assign under **Users** when role = manager.
- Cannot open **payroll** (ops RLS), finance, marketing, users, PO/GRN/imports, or delete catalog (ops-only delete).
- HR locations/assignments writes stay ops (`is_ops_user()`). Location-scoped HR approvals still deferred.

## Live chat / Tawk (admin + manager only)

| Role | `/admin/live-chat` |
|---|---|
| `admin` | Yes |
| `manager` | Yes |
| `staff` | **No** |
| `sales` / `freelancer` | **No** |
| `accounts` | **No** |

Enforcement: `canAccessLiveChat()` in `lib/admin-rbac.ts`; nav filter in admin layout; route guard in `proxy.ts`. Do not broaden this allowlist.

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
| Audit log **read** | RLS `admin_select_audit_logs` + route `/admin/audit-log` (Phase 54; was ops SELECT) |
| Audit log purge | **None** — `audit_logs` is append-only; no purge RPC |

### Staff + admin (ops)

Day-to-day: suppliers create/edit (not hard delete), PO, GRN, landed cost, export shipments, customer invoices, remittances, expenses, bank **transactions** / reconcile, update existing bank accounts, draft/post GL journals (not reverse), draft payroll create/edit/cancel, VAT packs, outbound email, WhatsApp, AI assistant, catalog, HR locations/assignments/attendance admin, etc.

## Catalog activity audit (Phase 54)

Triggers on `parts` and `vehicles` (create / meaningful update / delete / `stock_status_change`) write via `private.write_audit_log`. Reserve/release flows that change `stock_status` are covered. **Only `role = admin`** can SELECT `audit_logs` (UI `/admin/audit-log`).

## Enforcement locations

- Route: `proxy.ts` — any active `admin_profiles` row; field-agent + accounts + manager allowlists; `/admin/users` and `/admin/audit-log` require `role = 'admin'`; `/admin/live-chat` requires `admin` \| `manager` via `canAccessLiveChat`
- UI: nav hides Users / Audit log for non-admin; Live chat for non-`canAccessLiveChat`; HR group for ops/manager; field-agent + accounts nav; ledger reverse / chart edit, bank account create, payroll post / cancel-posted, portal enable — admin only
- Database: catalog often `is_ops_user()`; receivables use `can_manage_receivables()`; field-agent draft proforma via RLS + `create_invoice_v3` + trigger; sensitive RPCs use `private.is_account_admin()`
- Edge Functions: `callerProfile.role !== 'admin'` (and inactive) → 403 for user-admin and portal-create; create/update user accept roles including `freelancer` / `manager` / `accounts`

## Invariant

A Supabase Auth user without `admin_profiles` cannot use the ERP. Login signs them out.

## Purchase inventory (Phase 28)

- Creating/editing suppliers, purchase orders, posting GRNs, supplier payments/SOA, export shipments, landed-cost packs, bank account **updates**/reconciliation, operating expenses, VAT return packs, payroll/leave **drafts**, general ledger **draft/post** journals, financial reports, outbound email, and WhatsApp Cloud API sends: **admin/staff only**
- Reserving / releasing vehicle stock and sales reservation + proforma: any workspace user (`sales` / `freelancer` included)
- Publishing vehicles: only when `stock_status = available` (`set_vehicle_public_listing`)
- Applying sold status on tax/commercial invoice lines: runs inside invoice create RPC for workspace users who can create invoices
- Export shipment status changes may log lifecycle events and attempt a soft move to `port` (ignored if already past or blocked by Phase 47 recommended-path rules)
- Vehicle lifecycle stage transitions: any workspace user for the **recommended** next hop; skipping stages requires account-admin `p_force` + reason notes. Lifecycle event attachments use the same workspace access as today.

## Future RBAC

Further splits (e.g. staff cannot see all remittances, HR location-scoped approvals) need schema + policy + UI changes. Do **not** reuse `public.is_admin()` for `role = 'admin'` — use `private.is_account_admin()`.

# Roles

## Implemented roles

| Role | Where stored | Meaning in the running system |
|---|---|---|
| Anonymous visitor | no row | Browse published catalog/blog; submit inquiry and part request; verify invoice by UUID |
| `staff` | `admin_profiles.role` default | Full operations workspace access via `is_admin()` RLS |
| `admin` | `admin_profiles.role` | Same workspace access, plus create/update staff Auth users |

There is no customer login role, no department role, and no `domain.action` permission matrix in code.

## Enforcement locations

- Route: `proxy.ts` — any `admin_profiles` row
- UI: `/admin/users` hides manage actions unless the current profile is `admin`
- UI labels: profile menu “Full system access” vs “Operational access”
- Database: most policies `USING (public.is_admin())`
- Edge Functions: `callerProfile.role !== 'admin'` → 403

## Invariant

A Supabase Auth user without `admin_profiles` cannot use the ERP. Login signs them out.

## Future RBAC

If staff must be prevented from deleting invoices, managing users, or seeing all remittances, that is a schema + policy + UI change. Do not assume it exists. Do not reuse the name `is_admin()` for `role = 'admin'` without renaming the function in a planned migration.

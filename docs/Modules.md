# Modules

Only modules that exist in the repository are listed as implemented. Later ERP ideas are marked not built.

## Implemented

| Module | Public | Staff | Data |
|---|---|---|---|
| Dashboard | no | `/admin/dashboard` | counts, charts over invoices/remittances/stock/chat |
| Parts catalog | `/parts` | `/admin/parts` | `parts`, photos, compatibility |
| Vehicles catalog | `/vehicles` | `/admin/vehicles` | `vehicles`, photos |
| Categories | `/categories` | `/admin/categories` | `categories` |
| Blog | `/blog` | `/admin/blog` | `blog_*` |
| Inquiries | forms on public pages | `/admin/inquiries` | `inquiries` |
| Part requests | `PartRequestForm` on public pages | no dedicated staff list page; insert notifies via `admin_notifications` | `part_requests` |
| Customers | no | `/admin/customers`, SOA `[id]` | `customers`, invoices, remittances, allocations |
| Invoices | `/verify/invoice/[code]` | `/admin/invoices` | `invoices*` |
| Supplier invoices | no | `/admin/invoices/supplier` | `supplier_invoices` |
| Remittances | no | `/admin/remittances` | `remittances*` |
| Users | `/admin` login | `/admin/users`, `/admin/profile` | Auth + `admin_profiles` |
| Bulk import | no | `/admin/imports` | `import_jobs`, `import_rows` |
| Team chat | no | `/admin/chat` | `chat_*`, Realtime |
| Internal mail | no | `/admin/mail` | `internal_mail*` |
| Notifications | no | header center | `admin_notifications` |
| Banking page | `/banking` | footer link | static `lib/banking-details.ts` |
| Company pages | `/`, `/about`, `/contact` | — | static + catalog queries |
| Health | `/api/health` | — | REST ping |

## Not implemented

Suppliers master, purchases orders, yard, auction, shipments, BL/export certificates, generic request tickets with assignment/due dates, customer portal, audit-log module, outbound email, WhatsApp API, PWA, Android/iOS, AI automation.

Part requests and inquiries are intake records, not the full request-workflow design in the master prompt.

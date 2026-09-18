# Modules

Only modules that exist in the repository are listed as implemented. Later ERP ideas are marked not built.

## Implemented

| Module | Public | Staff | Data |
|---|---|---|---|
| Dashboard | no | `/admin/dashboard` | counts, charts over invoices/remittances/stock/chat |
| Parts catalog | `/parts` | `/admin/parts` | `parts`, photos, compatibility |
| Vehicles catalog | `/vehicles` | `/admin/vehicles`, `/admin/vehicles/[id]` lifecycle | `vehicles`, photos, `vehicle_lifecycle_events` |
| Categories | `/categories` | `/admin/categories` | `categories` |
| Blog | `/blog` | `/admin/blog` | `blog_*` |
| Inquiries | forms on public pages | `/admin/inquiries` | `inquiries` |
| Part requests | `PartRequestForm` on public pages | queued on `/admin/requests` | `part_requests` |
| Requests | no | `/admin/requests`, `/admin/requests/[id]` | `workspace_requests`, `workspace_request_events` |
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

Suppliers master, purchase orders, shipments beyond lifecycle events, request attachments, customer portal, audit-log module, outbound email, WhatsApp API, PWA, Android/iOS, AI automation.

Vehicle lifecycle events remain the operational log. Request tickets add assignment and due dates without replacing that log or intake tables.

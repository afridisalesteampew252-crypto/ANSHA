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
| Requests | no | `/admin/requests`, `/admin/requests/[id]` | `workspace_requests`, events, attachments (`internal-files`) |
| Customer portal | `/portal` | `/portal/invoices` | `customer_profiles` + own `invoices` (read-only) |
| Customers | no | `/admin/customers`, SOA `[id]` (+ enable portal) | `customers`, invoices, remittances, allocations |
| Invoices | `/verify/invoice/[code]` | `/admin/invoices` | `invoices*` |
| Supplier invoices | no | `/admin/invoices/supplier` | `supplier_invoices` |
| Remittances | no | `/admin/remittances` | `remittances*` |
| Users | `/admin` login | `/admin/users`, `/admin/profile` | Auth + `admin_profiles` |
| Bulk import | no | `/admin/imports` | `import_jobs`, `import_rows` |
| Team chat | no | `/admin/chat` (+ entity filters) | `chat_*`, `chat_conversation_links`, Realtime |
| Internal mail | no | `/admin/mail` | `internal_mail*` |
| Notifications | no | header center | `admin_notifications` |
| Banking page | `/banking` | footer link | static `lib/banking-details.ts` |
| Company pages | `/`, `/about`, `/contact` | — | static + catalog queries |
| Health | `/api/health` | — | REST ping |
| PWA | installable public shell | — | `app/manifest.ts`, `/sw.js`, `/offline`, `/icons/*` |

## Not implemented

Suppliers master, purchase orders, shipments beyond lifecycle events, portal remittances/SOA charts, audit-log module, outbound email, WhatsApp API, Capacitor/native apps, AI automation.

Vehicle lifecycle events remain the operational log. Request tickets add assignment and due dates without replacing that log or intake tables.

# ANSHA business knowledge for the admin assistant

<!--
Edit this file to teach the /admin assistant about ANSHA. It is loaded at request time by
lib/admin-assistant/prompt.ts and sent to the model as part of the system prompt.
Keep it short and factual (it costs tokens on every message). Never put secrets here.
Sources: docs/User-Manual.md, docs/Roles.md, docs/Modules.md, docs/Catalog-Freight-Pricing.md,
docs/Database.md and the admin pages under app/admin/(panel)/.
-->

## Company
ANSHA Trading Co. (www.anshatradingco.com) exports used vehicles (cars, commercial trucks,
heavy machinery) and automotive spare parts worldwide, mainly from Japan/UAE stock to
~70 destination markets. One Next.js + Supabase stack powers four surfaces: public website,
staff ERP at /admin, customer portal at /portal, and an installable PWA.

## Roles (admin_profiles.role)
- admin: everything, plus account-admin actions (users, portal access, audit log, posting
  payroll, reversing GL, bank account create/delete, forced lifecycle jumps, hard deletes).
- staff: day-to-day ops (PO/GRN, invoices, remittances, bank, expenses, shipments, landed cost).
- accounts: invoices (approve draft → sent), remittances, commissions review, expenses, ledger, reports, VAT.
- manager: location-scoped catalog/stock/reservations, view-only on several finance areas, live chat.
- sales / freelancer (field agents): catalog lists, own-book customers, reservations, draft proformas only, commission claims.
Portal customers are separate logins (customer_profiles), not staff.

## Inventory
- Vehicles (`vehicles`): owned stock (`stock_pool = owned`, /admin/vehicles) vs third-party
  auction/yard listings (`auction_third_party`, /admin/auction-stock) until bought into owned.
  `vehicle_class`: passenger | commercial_truck | heavy_machinery (machinery shows on /machinery).
- Parts (`parts`): part_code, brand, part_number, OEM number, quantity, category.
- `stock_status`: available | reserved | sold. Reservation stores customer + price term (FOB/C&F/CIF),
  shipment term (DHL/RoRo/20ft/40ft), inspection, VAT, ETD/ETA; it clears on release/Make Available.
- Vehicle lifecycle (`lifecycle_stage`): Auction → Yard → Port → Sold, next hop only unless an admin forces a jump with a reason.
- Auction-sheet images are admin-only and never public.
- Stock board /admin/stock shows payment status × shipment status. Export shipments (EXP-) carry BL, export certificate, waybill, inspection docs.

## Public website rules
- Lists ONLY items that are `is_published = true` AND `stock_status = available`.
- A vehicle can be published only while available (RPC set_vehicle_public_listing enforces it).
- Detail pages are cached (ISR) and refreshed after staff edits.
- Deals (/admin/offers, public /offers) show a discount % or deal price on linked items but do NOT change the ERP list price.
- Markets (/markets/[code]), blog (/blog), banking details (/banking), invoice verification (/verify/invoice/[code]).

## Pricing
- Vehicles have three export quotes: FOB (public listing price), C&F, CIF. Setting FOB also syncs the legacy
  `price` field. Saving a positive price turns `show_price` on. Missing/zero terms are not shown.
- Parts use `price` as the public list price; FOB/C&F/CIF are optional quotes. `show_price` controls visibility.
- Bulk vehicle price changes belong in /admin/bulk-vehicle-prices (set or ± % on many rows), NOT the assistant.
- Price sanity: compare against the median of the same make + model + year + currency (needs ≥ 3 peers;
  < 0.5× or > 2× is suspicious). USD vehicles under 1,000 or over 200,000 are likely typos.
- Freight: /admin/freight-charges (RoRo = price per m³; 40-ft = total per container split 6/4/3 for small/large/XL),
  /admin/freight-calculator, make/model m³ in /admin/vehicle-model-config.

## Purchasing & suppliers
- Suppliers (/admin/suppliers, statement of account), purchase orders (PO), goods receipt (GRN at /admin/inventory/receive),
  supplier invoices, landed cost packs (LC-) that allocate freight/duty into stock `landed_cost`.

## Sales, customers & money
- Customers (`customers`): auto customer_code (~48001+), owner (sales agent), consignee details, SOA at /admin/customers/[id]#soa.
  Portal access is enabled by an admin from the customer page.
- Documents (`invoices.document_type`): quotation, proforma_invoice, tax_invoice, commercial_invoice, delivery_note, purchase_invoice.
  Status: draft → sent → partially_paid / paid, or overdue / cancelled. Field agents create draft proformas only; accounts/ops send them.
- Remittances (customer payments) are recorded, confirmed, then allocated to invoices; Unknown TTS are unmatched funds.
- Commissions: agents claim after stock is sold; ops/accounts approve/pay.
- ALWAYS report money per currency (AED, USD, JPY, …). Never convert or add across currencies.
- Finance also covers bank accounts/transactions, expenses (OPEX-), general ledger (JE-), VAT return, reports hub, payroll (admin posts runs).

## Inbox & work queue
- Inquiries (`inquiries`, from website forms; may link a vehicle or part): status new → read → responded → closed. /admin/inquiries.
- Part requests (`part_requests`, sourcing requests from the website): new | reviewed | fulfilled | closed.
- Workspace requests (`workspace_requests`, internal tickets at /admin/requests): type inquiry | part_request | bl | inspection |
  shipping | other; status open | in_progress | waiting | done | cancelled; assignee + due date; can link vehicle, customer,
  inquiry, part request. Due within 24 h = "due soon"; past due and not done/cancelled = "overdue". A daily cron sends due reminders.
- Team chat, internal mail, outbound email (Resend), WhatsApp, Tawk live chat (admin + manager).

## Marketing & content
- Blog/insights (/admin/blog), deals & PWA push (/admin/offers), campaigns (push/email/offer), PWA subscribers,
  trade config (FX reference, per-country import policies for market pages), export masters (countries, ports, vessels).

## Audit
- Important actions are written to the append-only audit log (/admin/audit-log, admin only). Every change made through
  this assistant is logged there as `ai_assistant.<tool>` with the user, arguments and before/after values.

# ANSHA User Manual

Practical how-to for the live ANSHA Trading system. Canonical site: [https://www.anshatradingco.com](https://www.anshatradingco.com).

---

## 1. Overview

ANSHA is one product with four surfaces:

| Surface | Who | What |
|---|---|---|
| **Public website** | Anyone | Browse published parts & vehicles, inquire, read blog/offers, banking details, verify invoices |
| **Staff ERP** | Admin / staff / sales | Catalog, purchase, sales, finance, inbox, marketing, team |
| **Customer portal** | Enabled customers | Own invoices + account statement |
| **PWA / mobile** | Anyone (public) | Installable catalog; optional store WebView shell |

Staff ERP and the portal need a live internet connection (not cached offline).

---

## 2. Who can do what

| Role | Login | Can do | Cannot do |
|---|---|---|---|
| **Visitor** | None | Browse available published stock, inquire, request parts, verify invoice by QR code | Staff tools, portal |
| **Sales** | `/admin` | Catalog view/edit, customers, reserve vehicles, customer invoices, inquiries, requests, chat, mail, dashboard & own-book analytics | Suppliers, GRN, remittances, supplier invoices, purchase/finance/ops pages |
| **Staff** | `/admin` | Day-to-day ops: PO, GRN, invoices, remittances, bank txns, expenses, shipments, landed cost, draft GL, payroll drafts, email/WhatsApp/AI, etc. | User management, portal enable, reverse posted GL, create/delete bank accounts, post payroll, hard-delete suppliers, force lifecycle stage jumps |
| **Admin** | `/admin` | Everything staff can do, plus account-admin actions above | — |
| **Customer (portal)** | `/portal` | Read own non-draft invoices; view account statement | Remittances, chat, staff ERP |

There is no department matrix. Portal users are linked via `customer_profiles`, not staff accounts.

---

## 3. Getting started

### Staff login

1. Open `/admin` (or [https://www.anshatradingco.com/admin](https://www.anshatradingco.com/admin)).
2. Sign in with the email and password your admin created.
3. You land on the operations workspace (sidebar by area). Use **My profile** from the account menu for name, avatar, and password.

Inactive accounts are signed out automatically.

### Customer portal login

1. Open `/portal`.
2. Sign in with the credentials your ANSHA contact enabled for you.
3. Use **Invoices** and **Account** in the portal menu.

### Install the public site as a PWA

1. On a phone or desktop browser, open the public site.
2. Use **Install app** in the header, footer, or sticky banner (app name: **Anshatradingco APP**).
3. On iPhone Safari: Share → **Add to Home Screen** if no native install prompt appears.
4. Optionally allow notifications for deals and blog insights.
5. Offline: you get a basic offline page; catalog, admin, and portal stay online-only.

Staff ERP is **not** a native app rewrite. Store shells (if used) wrap the public website URL only.

---

## 4. Public website

| Page | Path | Use it to |
|---|---|---|
| Home | `/` | Start search; jump to parts or vehicles; featured parts/vehicles rotate every 10 minutes across published stock |
| Parts | `/parts`, `/parts/[slug]` | Browse / open a part; inquire or request sourcing; deal price if linked |
| Vehicles | `/vehicles`, `/vehicles/[slug]` | Browse / open a vehicle; inquire; deal price if linked |
| Categories | `/categories`, `/categories/[slug]` | Shop by category |
| Deals | `/offers` (also **Deals** in nav / mobile bar) | Current offers; tap inventory-linked deals |
| Markets | `/markets/[code]` | Import notes + hot vehicles for a destination (from flag strip) |
| Cart / Favorites | `/cart`, `/favorites` | Saved inquiry list (stored in the browser) |
| Blog / insights | `/blog`, `/blog/[slug]` | Read articles |
| Banking | `/banking` | Official bank details (copy fields; verify via WhatsApp link if shown) |
| About / Contact | `/about`, `/contact` | Company info and contact forms |
| Invoice verify | `/verify/invoice/[code]` | Confirm a document from a QR code (seller, customer, lines, totals — no private notes) |

**Catalog rule:** the website only lists items that are **published** and **available**. Reserved or sold stock does not appear as buyable inventory on the public lists.

**Deals rule:** publishing a deal under Marketing → Deals & PWA push with a vehicle/part attached shows discount % and/or deal price on that item’s cards and detail page. It does **not** change ERP list price.

---

## 5. Staff ERP by area

Open `/admin` after login. Menu groups match the sidebar.

### 5.1 Overview

| Page | Path | Steps |
|---|---|---|
| Dashboard | `/admin/dashboard` | Review counts and ops charts. |
| Analytics | `/admin/analytics` | Pick a date range for sales / stock / purchase / request KPIs. Sales see own-book receivables only. |
| AI assistant | `/admin/ai` | Ask ops questions grounded in live data. Needs server AI keys (see Tips). |
| Audit log | `/admin/audit-log` | Filter by entity, actor, or date (invoice status, vehicle stock, remittance allocations). Append-only. |

### 5.2 Catalog

**Parts** — `/admin/parts`

1. Open Parts → **New part** (or edit an existing row).
2. Fill identifiers, pricing, stock origin/status, publish flags, photos.
3. Save. Purchase cost fields appear on edit for ops users.

**Vehicles** — `/admin/vehicles` and `/admin/vehicles/[id]`

1. Create or open a vehicle.
2. On the detail page, manage photos (upload, set cover, reorder, replace, delete), purchase/reserve fields, and public listing (publish only when stock is **available**).
3. On the detail page, advance **lifecycle** along the recommended path (Auction → Yard → Port → Sold). Record workflow events; attach private files per event.
4. Skipping stages requires an **admin** force override with a reason.

**Categories** — `/admin/categories` — create and maintain public category structure.

**Bulk import** — `/admin/imports`

1. Download / use the Excel template for parts or vehicles.
2. Upload `.xlsx` (and optional image ZIP matched by part number or chassis).
3. Review job results and row errors in the import history.

**Suppliers** — `/admin/suppliers` (ops)

1. Create or edit a supplier (hard delete is **admin** only; soft deactivate stays ops).
2. Open `/admin/suppliers/[id]` for statement of account, payments, CSV/print export.

### 5.3 Purchase

**Purchase orders** — `/admin/purchase-orders` (ops)

1. Create a PO with lines → confirm when ready (or cancel).
2. Track match snapshot: ordered vs received vs invoiced; paid state after supplier payments.

**Receive stock (GRN)** — `/admin/inventory/receive` (ops)

1. Post a goods receipt against stock / PO links.
2. Review receipt lines; stock and match data update from the GRN.

**Landed cost** — `/admin/landed-cost` (ops)

1. Create a landed-cost pack (LC- number).
2. Add charges (freight, duty, etc.).
3. Allocate (equal / purchase value / manual) → redistribute if needed → **post** so stock `landed_cost` updates.

### 5.4 Sales

**Customers** — `/admin/customers`

1. Create or search customers.
2. Open a customer for statement of account (invoices, remittances, allocations).
3. **Admin only:** enable portal access from the customer SOA page (sends portal credentials via the provision flow).

**Reserve vehicle** — `/admin/reservations` (sales + ops)

1. Select an available vehicle and customer.
2. Reserve stock; optionally create a **proforma** in one step.
3. Release (with republish when appropriate) if the deal does not proceed.

**Invoices** — `/admin/invoices` (sales: customer invoices only)

1. **New invoice** — pick type (proforma / tax / commercial), customer, lines (parts or vehicles), VAT/discounts.
2. Issue / edit as allowed; print or PDF; QR verify link uses `/verify/invoice/[code]`.
3. Tax/commercial lines can apply sold status on linked stock when issued.

**Supplier invoices** — `/admin/invoices/supplier` (ops) — archive files linked to purchase (not available to sales).

**Remittances** — `/admin/remittances` (ops)

1. Record pending or confirmed customer funds; attach evidence if needed.
2. Allocate across invoices (partial allocations supported); reverse allocations carefully when correcting.

### 5.5 Export shipments + vehicle lifecycle

**Export shipments** — `/admin/export-shipments` (ops)

1. Create a shipment (EXP- number); add/remove vehicles.
2. Update status; system may log lifecycle events and soft-move toward **port** when rules allow.

**Lifecycle** (on `/admin/vehicles/[id]`)

1. Move stage only to the next recommended hop unless you are admin forcing a jump.
2. Log BL / inspection / shipping-style events; attach private documents to those events.
3. Moving lifecycle to **sold** can sync commercial `stock_status` to sold.

### 5.6 Finance

| Page | Path | How to use |
|---|---|---|
| Bank accounts | `/admin/bank-accounts` | Ops: post in/out transactions, reconcile, CSV import. **Admin** creates/deletes accounts. |
| Expenses | `/admin/expenses` | Create → post or cancel operating expenses (OPEX-). Optional bank link. |
| General ledger | `/admin/ledger` | Draft/post journals (JE-). **Admin** reverses posted journals and edits chart of accounts. Auto-posts may appear from remittances, expenses, invoices, supplier payments. |
| Reports | `/admin/reports` | Trial balance, P&L, balance sheet for a period. |
| VAT return | `/admin/vat-return` | Pick dates → review summary → optional snapshot → CSV export. Reporting-first. |
| Payroll | `/admin/payroll` | Employees, leave approve/reject, draft runs. **Admin** posts payroll and cancels posted runs. EOS calculator is **indicative only**, not legal advice. |

### 5.7 Inbox

| Page | Path | How to use |
|---|---|---|
| Inquiries | `/admin/inquiries` | Work website inquiry forms. |
| Requests | `/admin/requests`, `/admin/requests/[id]` | Assign tickets, set due dates, attach private files, follow events. Due-soon/overdue appear in the notification center. |
| Team Chat | `/admin/chat` | Direct/group chat; link conversations to vehicle / customer / inquiry / invoice / request; filter via query params. |
| Internal Mail | `/admin/mail` | Inbox / sent / archive; To/CC/BCC; attachments. |
| Outbound email | `/admin/email` (ops) | Compose customer-facing email (Resend). Needs `RESEND_API_KEY`. |
| WhatsApp | `/admin/whatsapp` (ops) | Send text/template to a customer phone or E.164 number; review send log. Needs WhatsApp secrets. |

Header **notification center**: team messages, mail, inquiries, part requests, request due reminders.

### 5.8 Marketing

| Page | Path | How to use |
|---|---|---|
| Insights / Blog | `/admin/blog` | Draft/publish with **Write** toolbar, **HTML**, or **Preview**; optional **PWA push on publish**. |
| Deals & PWA push | `/admin/offers` | Create offers; attach vehicle/part; optional discount % / sale price; optional push. |
| Campaigns | `/admin/campaigns` (ops) | Draft campaigns (push / email / offer channel) → **Send now**. |
| PWA subscribers | `/admin/subscribers` (ops) | List push opt-ins (deals/insights), filter, remove stale rows. |
| Trade config | `/admin/trade-config` (ops) | FX reference rates, freight notes, per-country import policies for `/markets/[code]`. |

### 5.9 Team

| Page | Path | Who |
|---|---|---|
| Payroll | `/admin/payroll` | Ops drafts; admin posts (see Finance). |
| Users | `/admin/users` | **Admin only** — create/update workspace users and roles (`admin` / `staff` / `sales`), deactivate. |
| Profile | `/admin/profile` | Anyone signed in — own name, avatar, password. |

---

## 6. Customer portal

| Page | Path | Steps |
|---|---|---|
| Login | `/portal` | Sign in with portal credentials. |
| Invoices | `/portal/invoices`, `/portal/invoices/[id]` | List and open your non-draft invoices. |
| Account statement | `/portal/account` | Confirmed remittances, allocations, and outstanding KPIs (no remittance notes, drafts, or staff allocate tools). |

Portal access is enabled by an **admin** from the customer page in ERP. Remittances and chat stay staff-only.

---

## 7. Tips

1. **Searchable selects** — Prefer typing in dropdowns when choosing customers, stock, suppliers, or categories; long lists are meant to be filtered by search, not scrolled blindly.
2. **Public stock** — Only **available** + **published** items show on the website. Reserve or sell in ERP before expecting the public list to change.
3. **Vehicle publish** — You can publish a vehicle only while `stock_status` is available.
4. **Sales menu** — If you are sales, missing sidebar items (suppliers, remittances, bank, etc.) are intentional.
5. **Secrets for integrations** — Outbound email needs Resend; WhatsApp needs Meta token + phone number ID; AI needs `AI_GATEWAY_API_KEY` or `OPENAI_API_KEY`; Web Push needs VAPID keys. Without them, the related admin screens show setup/empty send states.
6. **Quick add** — Desktop header **Quick add** jumps to new part/vehicle/invoice, customers, remittances, offers, or bulk import.
7. **QR invoices** — Share the verify URL from the invoice; buyers confirm authenticity without seeing internal notes.
8. **Banking page** — Point customers to `/banking` for official AED/USD payment details rather than pasting ad-hoc numbers in chat.

---

## Related docs

- Modules index: `docs/Modules.md`
- Roles detail: `docs/Roles.md`
- PWA: `docs/PWA.md`
- Mobile shell: `docs/Mobile.md`

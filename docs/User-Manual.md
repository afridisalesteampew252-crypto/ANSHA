# ANSHA User Manual

Practical how-to for the live ANSHA Trading system. Canonical site: [https://www.anshatradingco.com](https://www.anshatradingco.com).

---

## 1. Overview

ANSHA is one product with four surfaces:

| Surface | Who | What |
|---|---|---|
| **Public website** | Anyone | Browse published parts & vehicles, inquire, read blog/offers, banking details, verify invoices |
| **Staff ERP** | Admin / staff / field agents / accounts / manager | Catalog, purchase, sales, finance, HR, inbox, marketing, team (role-gated) |
| **Customer portal** | Enabled customers | Own invoices + account statement |
| **PWA / mobile** | Anyone (public) | Installable catalog; optional store WebView shell |

Staff ERP and the portal need a live internet connection (not cached offline). Full RBAC: [Roles](./Roles.md).

---

## 2. Who can do what

| Role | Login | Can do | Cannot do |
|---|---|---|---|
| **Visitor** | None | Browse available published stock, inquire, request parts, verify invoice by QR code | Staff tools, portal; auction-sheet photos |
| **Sales / Freelancer** (field agent) | `/admin` | Parts/vehicles **lists**, own-book customers, reserve vehicles, **draft proforma only**, chat, light dashboard, **My remittances** (tagged only) | Catalog create/edit/import, mark invoices sent, full remittance module, finance, HR, marketing |
| **Accounts** | `/admin` | Customer invoices (all types; approve draft→sent), remittances, expenses, bank txns/views, supplier invoices, ledger/reports/VAT views | Users, audit log, catalog writes, PO/GRN, marketing, HR |
| **Manager** | `/admin` | Location-scoped catalog/stock/reservations; export shipments (read); HR view + own check-in/out; live chat; **My remittances** (tagged only) | Finance module, payroll, marketing, users, PO/GRN/imports, catalog delete |
| **Staff** | `/admin` | Day-to-day ops: PO, GRN, invoices, remittances, bank txns, expenses, shipments, landed cost, draft GL, payroll drafts, HR admin, email/WhatsApp/AI, etc. | User management, portal enable, reverse posted GL, create/delete bank accounts, post payroll, hard-delete suppliers, force lifecycle stage jumps |
| **Admin** | `/admin` | Everything staff can do, plus account-admin actions above; audit log | — |
| **Customer (portal)** | `/portal` | Read own reservations, non-draft invoices; view account statement | Remittances, chat, staff ERP |

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
3. Use **Reservations**, **Invoices**, and **Account** in the portal menu.

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
| Home | `/` | Start search; jump to parts or vehicles; featured parts (8) / vehicles (4) rotate every **10 minutes** (`lib/featured-rotation.ts`); admin `is_featured` boosts the pool |
| Parts | `/parts`, `/parts/[slug]` | Browse / open a part; inquire or request sourcing; deal price if linked |
| Vehicles | `/vehicles`, `/vehicles/[slug]` | Browse / open a vehicle; inquire; deal price if linked; auction sheets never shown publicly; auction-pool units may show as auction listing |
| Machinery & trucks | `/machinery` | Browse commercial trucks and heavy equipment (`vehicle_class`); filter by equipment type / origin |
| Categories | `/categories`, `/categories/[slug]` | Shop by category |
| Deals | `/offers` (also **Deals** in nav / mobile bar) | Current offers; tap inventory-linked deals |
| Markets | `/markets/[code]` | Import notes + hot vehicles for a destination (**70** markets from flag strip / `lib/export-markets.ts`) |
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
| Audit log | `/admin/audit-log` | **Admin only.** Filter by entity, actor, or date (invoice status, part/vehicle catalog activity, remittance allocations). Append-only. |

### 5.2 Catalog

**Parts** — `/admin/parts`

1. Open Parts → **New part** (or edit an existing row).
2. Fill identifiers (part code, OEM, slug), pricing (including optional **FOB / C&F / CIF** sell quotes), stock origin/status, publish flags, SEO meta, photos.
3. On edit: reservation terms (price/shipment/inspection/VAT, requester, ETD/ETA) when reserved; purchase cost fields for ops; **Invoices & documents** lists linked invoice lines.
4. Save. Public detail shows Incoterm quotes when set. List cards show requester badges **only while status is Reserved** — setting Available clears reservation metadata automatically.

**Vehicles (owned)** — `/admin/vehicles` and `/admin/vehicles/[id]`

1. Create or open an **owned** inventory vehicle (`stock_pool = owned`). Use **Auction stock** for third-party auction/yard listings.
2. On the detail page, manage photos (upload, set cover, reorder, replace, delete), purchase/reserve fields, optional **FOB / C&F / CIF** quotes, and public listing (publish only when stock is **available**).
3. Mark Japanese auction sheets (`A.*` / `is_auction_sheet`) — they stay admin-only. On list cards, the **Auction sheet** badge opens a lightbox of those images.
4. On the detail page, advance **lifecycle** along the recommended path (Auction → Yard → Port → Sold). Record workflow events; attach private files per event.
5. Skipping stages requires an **admin** force override with a reason.
6. Transfer to **Auction stock** when the unit is third-party (not purchased inventory).

**Auction stock** — `/admin/auction-stock`

1. Lists `stock_pool = auction_third_party` only (Japan uploads default here until purchased into owned).
2. Create via **New auction stock** (`/admin/vehicles/new?pool=auction`) or transfer from owned.
3. **Transfer to owned inventory** when ANSHA buys the unit into stock. Field agents can open this list (same catalog allowlist as vehicles).

**Categories** — `/admin/categories` — create and maintain public category structure.

**Bulk import** — `/admin/imports`

1. Download / use the Excel template for parts or vehicles.
2. Upload `.xlsx` (and optional image ZIP matched by part number or chassis). Filenames starting with `A.` are flagged as auction sheets.
3. Review job results and row errors in the import history.

Ops also use one-off scripts for large WhatsApp/Japan ZIP loads (see [Development](./Development.md)); those are not the Excel import UI.

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
2. Open a customer for statement of account (invoices, remittances, allocations, **Buying details** including currently reserved stock).
3. **Admin only:** enable portal access from the customer SOA page (sends portal credentials via the provision flow).

**Reserve stock** — `/admin/reservations` (field agents + ops)

1. Select an available **vehicle or part** and customer. Field agents only see **available** units plus stock **they** reserved.
2. Set **price term** (FOB / C&F / CIF), **shipment term** (DHL / RoRo / 20ft / 40ft), **inspection** (Yes / No), and **VAT** (Yes / No). Optional requester name/role and ETD/ETA. These store on the reserved stock and clear on release **or** when stock is set to Available (including the list status dropdown). Sales/freelancer requester fields are locked to their profile.
3. Reserve stock; optionally create a **draft proforma** in one step (field agents land on the draft). Choosing a price term can pull the matching catalog Incoterm quote into the proforma line. VAT No expects zero tax rates on the draft. The customer SOA **Buying details** updates for the reserved unit.
4. Release (with republish when appropriate) if the deal does not proceed — unpaid open reservation proformas cancel automatically so SOA Buying clears.

**Invoices** — `/admin/invoices`

1. **Field agents:** create/edit **draft proforma only**. Accounts or ops mark drafts as **sent**.
2. **Accounts / ops:** all document types; approve draft→sent; record payments.
3. Set document **price term**, **shipment term**, and **VAT applicable** on the invoice header (shown on A4 print and `/verify/invoice/[code]`). Linked stock lines can carry a per-line price term when the unit price came from an Incoterm quote.
4. Print A4 — denser layout; verification code + QR on the face when verification is enabled; header shows price/shipment terms when set.
5. Tax/commercial lines can apply sold status on linked stock when issued.
6. **Delete:** remittance allocations must be cleared first (**Unallocate** on the invoice, or **Unallocate & delete**). After delete, linked reserved/sold vehicles/parts return to **available** (sold parts quantity restored).
7. **Allocate (Phase 71):** on invoice detail, use **Allocate remaining** against customer remittances, or per-row **Unallocate** to return funds to the remittance pool.

**Supplier invoices** — `/admin/invoices/supplier` (ops + accounts) — archive files linked to purchase (not available to field agents).

**Remittances** — Phases 69–71 (ops + accounts for finance pages; tagged users for My remittances)

| Page | Path | Who |
|---|---|---|
| Dashboard | `/admin/remittances/dashboard` | Ops / accounts — date range + **office filter** (e.g. Karachi) + office-wise received / allocated / unallocated |
| List / receive | `/admin/remittances` | Ops / accounts — record pending/confirmed/unknown; **Link user** auto-fills office/shift from profile (override optional); **Allocate remaining** + per-row **Unallocate** |
| My remittances | `/admin/remittances/mine` | Any workspace user tagged as receiver (field agents + managers included) — read own rows |
| Unknown TTS | `/admin/remittances/unknown` | Ops / accounts — unmatched funds; **link** customer + user (office/shift from profile) |

Office and shift live on **Users** (`/admin/users`). Remittances nav does not expose Offices/Shifts as HR-style config. Picklist routes remain at `/admin/remittances/offices` and `/shifts` for rare seed edits only.

1. Assign each collector's office/shift on **Users**.
2. Prefer receiving with a customer; leave customer empty to save as **Unknown TTS** until linked.
3. Tag **received by** — office/shift fill from that user; staff can open **My remittances**.
4. Allocate only after confirmed and customer-linked (unknown cannot allocate). Use **Allocate remaining** or invoice-detail allocate; any receivables user can **Unallocate**.
5. Use the dashboard office filter for office-wise totals.

### 5.5 Stock management + export shipments + lifecycle

**Stock management** — `/admin/stock` (ops)

1. Review **owned** vehicle inventory with dual columns: **payment/stock status** (Available / Reserved / Partial Paid / Paid / Unpaid / Sold) and **shipment status** (Not Booked / Booked / Shipped / Delivered). Auction-pool units are managed under **Auction stock**, not this board.
2. Use summary chips and filters; open a vehicle for detail.
3. **Arrival Watch** (`/admin/stock/arrival-watch`) — units with ETD/ETA or in-transit shipment focus.

**Parts stock** — `/admin/parts/stock` (ops)

1. Same dual payment×shipment status model as vehicles, scoped to parts inventory.
2. Reserve / release / proforma from **Reserve stock**; field agents only see available + own reserved parts.

**Export shipments** — `/admin/export-shipments` (ops)

1. Create a shipment (EXP- number); choose mode **DHL** (small parts), **RoRo**, **20 feet container**, or **40 feet container**.
2. Pick destination country / ports / vessel / voyage from **Configuration** masters (or type freely where allowed).
3. Add/remove vehicles; update status (may log lifecycle events and soft-move toward **port** when rules allow). Uploading **Bill of Lading** can auto-advance toward shipped/sailed; **Waybill** / surrendered docs toward delivered/arrived.
4. Upload shipping PDFs/images: **Bill of Lading**, **Export Certificate**, **Waybill**, **Courier** (one file each) plus **Inspection certificates** per destination country. Downloads use short-lived signed URLs.
5. **Delete** (Phase 68): draft/cancelled shipments can be permanently deleted (lines + docs + storage). Other statuses require cancel first, or an **account admin** may force-delete. Cannot be undone.

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
| Live chat | `/admin/live-chat` | **Admin + manager only.** Needs attention list (open chats/tickets from webhooks), open-count badge, dismiss handled items. Reply in Tawk (new tab / popup). Needs `NEXT_PUBLIC_TAWK_*` + Phase 58 webhook (`docs/Tawk.md`). |
| Requests | `/admin/requests`, `/admin/requests/[id]` | Assign tickets, set due dates, attach private files, follow events. Due-soon/overdue appear in the notification center. **Delete ticket** (Phase 68) permanently removes the workspace ticket, activity, and attachments; website intake (`inquiries` / `part_requests`) is kept. |
| Team Chat | `/admin/chat` | Direct/group chat; link conversations to vehicle / customer / inquiry / invoice / request; filter via query params. **Presence (Phase 60):** green dot = online (Realtime); offline shows last-seen. Heartbeat runs while any admin page is open (`AdminPresenceProvider`). |
| Internal Mail | `/admin/mail` | Inbox / sent / archive; To/CC/BCC; attachments. |
| Outbound email | `/admin/email` (ops) | Compose customer-facing email (Resend). Needs `RESEND_API_KEY`. |
| WhatsApp | `/admin/whatsapp` (ops) | Send text/template to a customer phone or E.164 number; review send log. Needs WhatsApp secrets. |

Header **notification center**: team messages, mail, inquiries, part requests, request due reminders.

### 5.8 Marketing

| Page | Path | How to use |
|---|---|---|
| Insights / Blog | `/admin/blog` | Draft/publish with **Write** toolbar, **HTML**, or **Preview**; optional **PWA push on publish**. |
| Deals & PWA push | `/admin/offers` | Create offers; attach vehicle/part; optional discount % / sale price; optional push. |
| Campaigns | `/admin/campaigns` (ops) | Draft/edit campaigns (push / email / offer) → **Send now**, email **Send test** / **Send to segment** (customer country). Tracks `sent_count`. |
| PWA subscribers | `/admin/subscribers` (ops) | List push opt-ins (deals/insights), filter, remove stale rows; **Subscribe this device** + **Send test push** when VAPID is configured (see Deployment / PWA docs). |
| Trade config | `/admin/trade-config` (ops) | FX reference rates, freight notes, per-country import policies for `/markets/[code]`. |
| Configuration | `/admin/configuration` (ops) | Maintain export master lists: destination countries, loading/destination ports, vessels, voyages used on export shipments. Search the list; toggle inactive rows. Seeded countries/ports ship with Phase 62/63 migrations. |

### 5.9 HR

| Page | Path | How to use |
|---|---|---|
| HR home | `/admin/hr` | Entry to workforce tools. |
| Locations | `/admin/hr/locations` | Ops create/edit shift locations. |
| Shifts | `/admin/hr/shifts` | Ops assign Morning/Night (and related) shifts. |
| Attendance | `/admin/hr/attendance` | Ops/manager view; staff check in/out as allowed. |

Manager inventory/ops is **location-scoped** via stock origins assigned under Users (Phase 66). HR shift locations remain a global viewer; ops (`admin`/`staff`) write locations and assignments.

### 5.10 Team

| Page | Path | Who |
|---|---|---|
| Payroll | `/admin/payroll` | Ops drafts; admin posts (see Finance). Admin can delete employees / draft-cancelled runs (Phase 53). |
| Users | `/admin/users` | **Admin only** — create/update workspace users and roles; for **manager**, assign **stock locations** (`allowed_stock_origins`); deactivate. |
| Profile | `/admin/profile` | Anyone signed in — own name, avatar, password. |

---

## 6. Customer portal

| Page | Path | Steps |
|---|---|---|
| Login | `/portal` | Sign in with portal credentials. |
| Reservations | `/portal/reservations` | Vehicles and parts reserved in your name (photo, terms, ETD/ETA, linked proforma/invoice). |
| Invoices | `/portal/invoices`, `/portal/invoices/[id]` | List and open your non-draft invoices. |
| Account statement | `/portal/account` | Confirmed remittances, allocations, and outstanding KPIs (no remittance notes, drafts, or staff allocate tools). |

Portal access is enabled by an **admin** from the customer page in ERP. Remittances and chat stay staff-only.

---

## 7. Tips

1. **Searchable selects / NativeSelect** — Prefer typing in dropdowns when choosing customers, stock, suppliers, or categories; long lists are meant to be filtered by search. Term selects (price/shipment/VAT) use the shared native select chrome.
2. **Public stock** — Only **available** + **published** items show on the website. Reserve or sell in ERP before expecting the public list to change.
3. **Vehicle publish** — You can publish a vehicle only while `stock_status` is available.
4. **Role menus** — Field agents, accounts, and managers see intentional allowlists; missing sidebar items are by design.
5. **Secrets for integrations** — Outbound email needs Resend; WhatsApp needs Meta token + phone number ID; AI needs `AI_GATEWAY_API_KEY` or `OPENAI_API_KEY`; Web Push needs VAPID keys; Tawk needs `NEXT_PUBLIC_TAWK_PROPERTY_ID` + `NEXT_PUBLIC_TAWK_WIDGET_ID`. Without them, the related admin screens show setup/empty send states (Tawk widget simply does not load).
6. **Live chat roles** — `/admin/live-chat` is **admin + manager only**. Staff, sales, freelancer, and accounts cannot open it.
7. **Quick add** — Desktop header **Quick add** jumps to new part/vehicle/invoice, customers, remittances, offers, or bulk import.
8. **QR invoices** — Share the verify URL from the invoice; buyers confirm authenticity via QR or the verification code on the A4 print.
9. **Banking page** — Point customers to `/banking` for official AED/USD payment details rather than pasting ad-hoc numbers in chat.
10. **Auction sheets** — Admin-only; never appear on the public vehicle gallery.
11. **Owned vs auction stock** — `/admin/vehicles` is purchased inventory; Japan/third-party listings live under **Auction stock** until transferred to owned.

---

## Related docs

- Modules index: `docs/Modules.md`
- Roles detail: `docs/Roles.md`
- PWA: `docs/PWA.md`
- Mobile shell: `docs/Mobile.md`

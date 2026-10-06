# Admin assistant

An AI assistant in the staff ERP that understands the ANSHA business and can look things up
and prepare changes. Open it with **Assistant** (✨) in the `/admin` header.

## Who can use it

**Only active users with role `admin`** (`admin_profiles.role = 'admin'`, `is_active = true`).

- **UI:** the admin layout renders (and downloads) the launcher only for admins.
- **API:** `POST /api/admin-assistant` reads the Supabase cookie session and the caller's
  `admin_profiles` row from the database: no session → **401**, any other role or inactive → **403**.
- **Database:** the audit-log and rate-limit RPCs check `private.is_account_admin()` again.

"Platform admin" in the database (`private.is_platform_admin()`) is an alias of
`private.is_account_admin()` (active `role = 'admin'`); there is no role above `admin`, so
platform admins and admins are the same people and both can use the assistant. `public.is_admin()`
(any active staff profile) is **not** used. Staff, manager, accounts, sales and freelancer get 403.

## What it can do

Read-only (runs immediately, no confirmation):

| Tool | What it does |
|---|---|
| `searchVehicles`, `searchParts` | Find stock by text (title, make/model, stock/chassis no., part code/OEM) and filters |
| `searchCustomers` | Find CRM customers by name, company, code, email, phone, country |
| `searchInquiries`, `searchPartRequests` | Website inquiries / sourcing requests by status or text |
| `searchWorkspaceRequests`, `listStaff` | Internal tickets (assignee, due, overdue) and who can be assigned |
| `searchInvoices` | Customer documents by number/customer/status, overdue filter |
| `summarizeDues` | Open balances **per currency** with ageing buckets + top overdue customers; overdue / due-soon tickets |
| `todaysWorkQueue` | New inquiries, new part requests, overdue / due-today / my tickets, overdue invoices |
| `checkPriceOutliers` | Vehicle price vs median of same make + model + year + currency (≥ 3 peers, < 0.5× or > 2×) |

Changes (each one needs **Approve** in the chat; one record per approval, max 5 proposals per message):

| Tool | Change | How it writes |
|---|---|---|
| `updateListingPrice` | One price on one vehicle (FOB/C&F/CIF) or part (list/FOB/C&F/CIF) | `bulk_update_vehicle_prices` with a single id (same rules as Bulk vehicle prices) / `parts` update |
| `setListingPublished` | Publish / unpublish one vehicle or part (available stock only) | `set_vehicle_public_listing` / `parts.is_published` |
| `updateListingDetails` | Title/name, brand (make), model, variant, description | `vehicles` / `parts` update (slug unchanged) |
| `createWorkspaceRequest` | New ticket with type, title, notes, assignee, due date, links | `create_workspace_request` |
| `updateWorkspaceRequest` | Assign / unassign, status, due date | `update_workspace_request` |
| `setInquiryStatus` | new / read / responded / closed | `inquiries` update |

Every write card shows the record, each field **before → after**, and warnings (e.g. price far
from peers, listing is published). Nothing changes until you press **Approve**; **Deny** cancels.
Deletes and bulk/mass updates are refused; the assistant points to the right admin screen.

## How changes are protected

1. Tools run **as the signed-in admin** (cookie session). RLS and existing RPC checks apply; the
   service-role key is never used.
2. The server computes the preview from the live record and asks for approval (AI SDK
   `toolApproval`). Approvals are HMAC-signed with `ADMIN_ASSISTANT_APPROVAL_SECRET`, binding the
   tool name, call id and exact arguments, so they cannot be forged or edited in the browser.
3. On approval the server re-reads the record, writes an **`approved`** audit row (if the audit log
   is unavailable the change is **not** made), performs one write, then logs **`executed`** (actual
   before/after) or **`failed`**. Rows appear in `/admin/audit-log` as `ai_assistant.<tool>`.
4. Listing changes refresh the public ISR pages (`revalidatePublicListing`, the same helper as
   `/api/revalidate`; the browser falls back to `/api/revalidate` if needed).
5. Rate limit: 20 requests / 10 min and 200 / day per admin (Postgres). Max 8 model steps and
   2,000 output tokens per request; conversation trimmed to the last 40 messages.

## Setup

| Variable | Where | Notes |
|---|---|---|
| (none) on Vercel | — | AI Gateway authenticates with the project's OIDC token automatically |
| `AI_GATEWAY_API_KEY` | local `.env.local` | Needed only outside Vercel |
| `ADMIN_ASSISTANT_MODEL` | optional | Gateway model id; falls back to `AI_MODEL`, then `anthropic/claude-sonnet-5.5` |
| `ADMIN_ASSISTANT_APPROVAL_SECRET` | Vercel (Preview + Production), server-only | 32+ random chars (`openssl rand -base64 32`). Without it changes are auto-denied |

Migration `supabase/migrations/20261006020000_admin_assistant_audit_and_rate_limit.sql` adds
`public.log_admin_assistant_action(...)` (writes to the existing `audit_logs`) and the rate-limit
table/RPC. Until it is applied the assistant still answers read-only questions (with an
in-memory rate limit) but every change is auto-denied.

## Updating the business knowledge

Edit `lib/admin-assistant/knowledge.md` (short, factual, no secrets). It is bundled with the API
route and sent as part of the system prompt. Behaviour rules live in `lib/admin-assistant/prompt.ts`.

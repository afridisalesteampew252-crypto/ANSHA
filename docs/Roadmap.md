# Roadmap

Nothing below is scheduled until a module is chosen. Items are ordered from safest to largest. Each step must preserve production data.

## 0. Documentation

Audit and process docs under `docs/` (including Development, Deployment, Testing, Rules, Roadmap).

## 1. Safety

Done in code and deployed to project `ydrnilquojvalhgifest`: `admin-update-user` verifies the caller with the anon JWT (same as create-user); Edge Function CORS is origin-allowlisted, not `*`. Function versions: `admin-create-user` v6, `admin-update-user` v4.

Still needs your action or approval:

- Enable leaked-password protection in Supabase Auth (Authentication → Providers → Email → leaked password protection)
- Decide whether staff RLS should stay equal to admin for catalog/finance (not changed)

## 2. Housekeeping

Done: README latest-migration points at Phase 21; `lib/types.ts` covers public tables through Phase 21; CI runs `verify:brands`; `netlify.toml` removed; publishable keys removed from `vercel.json` (`next.config.js` no longer inlines them).

Not deleted: both `001_initial_schema` files — production `schema_migrations` records `20260909192712` and `20260909194958`. Removing either file would desync git from the live database.

Inactive Supabase project `kmngigxpqhiilcavmcmm` is already `INACTIVE`. Pause API rejected that status. Permanent delete remains a dashboard action.

## 3. Vehicle operational lifecycle (additive)

Done (Phase 18): `lifecycle_stage` on `vehicles`; append-only `vehicle_lifecycle_events`; RPCs `transition_vehicle_lifecycle` and `record_vehicle_lifecycle_event`; admin detail page `/admin/vehicles/[id]` with stage transitions, workflow events, and history. Existing `stock_origin` / `stock_status` preserved. Sold commercial stock was backfilled to lifecycle `sold`.

Later enhancements: document attachments on events, stricter transition rules, public stage display if needed.

## 4. Request workflows

Done (Phase 19): `inquiries` and `part_requests` remain intake. Staff tickets live in `workspace_requests` with assignment, due dates, and `workspace_request_events`. Admin queue is `/admin/requests`. Existing intake was backfilled. New website submissions open a ticket automatically.

Done (Phase 21): private ticket files on `/admin/requests/[id]` via `workspace_request_attachments` and `internal-files` prefix `requests/{request_id}/`. Intake tables unchanged. Chat/mail attachments stay in their modules.

Later: tighter due-date reminders.

Done (Phase 26): hourly due-soon (24h) and overdue in-app notifications for active assignees. Ledger `workspace_request_due_reminders`, RPC `process_workspace_request_due_reminders`, Edge Function `remind-request-dues`, Vercel Cron `/api/cron/request-dues`. No outbound email in this slice.

## 5. Chat linking

Done (Phase 20): `chat_conversation_links` attaches existing conversations to vehicle/customer/inquiry/invoice/request IDs. RPCs `link_chat_conversation` / `unlink_chat_conversation`. Team Chat UI can link/unlink and filter via query params. No second chat product.

Done (Phase 23): customer portal first slice on the same database. `customer_profiles` links Auth users to CRM `customers` (never `admin_profiles`). Customers can sign in at `/portal` and read their own non-draft invoices. Admin enables access from the customer SOA page via Edge Function `portal-create-access`. Remittances, chat, and staff ERP stay staff-only.

Also in this phase: public catalog image optimization (Next.js Image), category/home SEO metadata, faster homepage category counts, footer portal link.

## 7. Mobile / PWA

Done (Phase 22): installable PWA for the public catalog on the same Next.js app and Supabase project. Manifest, icons, service worker (`/sw.js`), offline fallback (`/offline`), and optional install prompt. Admin/API/auth responses are never cached. Capacitor / native wrappers remain later.

Done (Phase 24): Web Push for new insights and deals/offers. `push_subscriptions` + `site_offers`, public opt-in prompt, `/offers`, admin Deals & Offers with optional push, blog “PWA push on publish”, Edge Function `send-web-push` (VAPID). Staff must opt in per publish — no silent DB webhook.

## 8. Later platform

Outbound email, WhatsApp Business API, analytics beyond the current dashboard, AI automation — all against this PostgreSQL project.

Stop after the current module until the next one is approved.

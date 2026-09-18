# Roadmap

Nothing below is scheduled until a module is chosen. Items are ordered from safest to largest. Each step must preserve production data.

## 0. Documentation

Audit and process docs under `docs/` (including Development, Deployment, Testing, Rules, Roadmap).

## 1. Safety (approval for Auth/CORS/RBAC)

- Enable leaked-password protection in Supabase Auth
- Align `admin-update-user` caller verification with `admin-create-user`
- Narrow Edge Function CORS from `*`
- Decide whether staff RLS should stay equal to admin for catalog/finance

## 2. Housekeeping (some items need approval)

- Point README latest-migration at Phase 17
- Complete `lib/types.ts` against live tables
- CI: add `verify:brands` if desired
- Approve before deleting `netlify.toml` or duplicate `001_initial_schema`
- Approve before moving publishable keys out of `vercel.json`
- Approve before archiving inactive Supabase project `kmngigxpqhiilcavmcmm`

## 3. Vehicle operational lifecycle (additive)

Keep `stock_origin` and `stock_status`. Add workflow states/history (auction, yard, port, export documents) in new tables/columns. Do not replace `sold` with a free-text status field.

## 4. Request workflows

Reuse `inquiries` and `part_requests` as intake. Add a request entity only if assignment, due dates, attachments, and activity cannot fit those tables safely.

## 5. Chat linking

Attach existing conversations to vehicle/customer/inquiry/invoice/request IDs. Do not fork a second chat product.

## 6. Customer portal

Same database. New auth role distinct from `admin_profiles`. RLS must prevent customers from reading other customers' finance or staff chat.

## 7. Mobile

First: keep public and admin responsive. Then PWA. Later Capacitor wrapping the same backend. No duplicate business logic.

## 8. Later platform

Outbound email, WhatsApp Business API, analytics beyond the current dashboard, AI automation — all against this PostgreSQL project.

Stop after documentation until the next module is approved.

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

Done: README latest-migration points at Phase 17; `lib/types.ts` covers public tables through Phase 17; CI runs `verify:brands`; `netlify.toml` removed; publishable keys removed from `vercel.json` (`next.config.js` no longer inlines them).

Not deleted: both `001_initial_schema` files — production `schema_migrations` records `20260909192712` and `20260909194958`. Removing either file would desync git from the live database.

Inactive Supabase project `kmngigxpqhiilcavmcmm` is already `INACTIVE`. Pause API rejected that status. Permanent delete remains a dashboard action.

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

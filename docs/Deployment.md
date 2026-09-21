# Deployment

## Path

```
GitHub (afridisalesteampew252-crypto/ANSHA)
  → branch push / PR
    → GitHub Actions CI on pull_request and push to main
    → Vercel Preview (non-main) or Production (main)
```

Default branch is `main`. There is no `master` workflow in `.github/workflows/ci.yml`.

## Vercel

- Install: `npm ci --legacy-peer-deps` (`vercel.json`)
- Framework: Next.js 16
- Canonical host: `https://www.anshatradingco.com`
- Redirects in `next.config.js`: `anshatrading.com`, `www.anshatrading.com`, `anshatradingco.com` → canonical HTTPS
- Admin routes: `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`
- Health: `GET /api/health` (no-store)

`vercel.json` only sets `installCommand`. Public Supabase URL and publishable key come from Vercel Environment Variables (and local `.env.local`), not from git. GitHub Actions injects placeholders for CI builds.

## SEO / Search Console (shipped)

After each production deploy that touches crawl metadata:

1. **Google Search Console ownership** — root layout includes `metadata.verification.google` (HTML tag). Confirm the property verifies for `https://www.anshatradingco.com`.
2. **Request indexing** — submit or re-request key URLs (home, catalog hubs, blog, reviews) once the deploy is READY.
3. **Favicon / brand icons** — stable `/favicon.ico` plus `/icons/favicon-48.png` and PWA icons under `/icons/*`. Google may take **days** to refresh the SERP icon after a change.
4. **Default Open Graph** — `/images/og-default.jpg` via `lib/seo.ts` (`defaultOgImage`); listing/detail pages fall back to it when no cover photo exists.

Helpers: `lib/seo.ts`, `scripts/generate-brand-icons.mjs`.

## CI

`.github/workflows/ci.yml` runs Node 24: `npm ci --legacy-peer-deps`, `lint`, `typecheck`, `verify:brands`, `build`. Placeholder public Supabase env is injected so the build can compile. CI does **not** run `verify:deployment`.

## Preview before production

Preferred: feature branch → Preview URL → `npm run verify:deployment -- <preview-url>` → merge to `main`.

Release gate locally: `npm run verify:release`.

## PWA

Public catalog is installable (`app/manifest.ts`, `/sw.js`, `/icons/*`, `/offline`). Service worker intentionally bypasses `/admin`, `/api`, and cross-origin requests. `verify:deployment` checks the manifest, service worker, offline page, and icon.

Web Push (Phase 24 + VAPID ops path) — generate once, then split public vs private:

1. From the repo root (`ANSHA/`): `npx web-push generate-vapid-keys` (prints Public Key + Private Key).
2. **Next.js (browser subscribe):** set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to the Public Key in local `.env.local` and on the Vercel project (**Settings → Environment Variables**) for **Production** and **Preview**. Redeploy Next after changing it — `NEXT_PUBLIC_*` is baked at build time.
3. **Edge Function `send-web-push` (staff send):** set secrets on Supabase project `ydrnilquojvalhgifest` — never `NEXT_PUBLIC_*`, never git:

```
supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT="mailto:info@anshatrading.com" --project-ref ydrnilquojvalhgifest
supabase functions deploy send-web-push --project-ref ydrnilquojvalhgifest
```

`VAPID_SUBJECT` is optional (defaults to a mailto). Notifications only fire when staff opts in (offers checkbox, blog “PWA push on publish”, campaigns Send now, or subscribers test) — nothing auto-sends from the database.

**Production status (2026-09-20):** matching VAPID public + private keys are already set on Vercel and Supabase Edge. Do not commit `.env.local`. After each deploy that changes env, verify **Subscribe this device** + **Send test push** on `/admin/subscribers`. Client helpers (`lib/pwa-push-subscribe.ts`, `lib/web-push.ts`) no-op when the public key is unset.

**Common failure:** Edge logs show `VAPID_PUBLIC_KEY is not valid URL-safe base64` or `Failed to decode base64` when secrets were pasted with ellipsis placeholders (`…`) or quotes. Re-set with the real keys from `npx web-push generate-vapid-keys` (or your existing matching pair). MCP cannot set secrets — use CLI after `npx supabase login` or the Supabase Dashboard → Edge Functions → Secrets. After rotating keys, visitors must opt in again (old subscriptions become invalid).

Outbound email (Phase 39): set Edge Function secrets for `send-outbound-email` (not Vercel `NEXT_PUBLIC_*`, and not the Supabase service role in the Next.js app):

| Secret | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | yes | Resend API key (`re_…`). Without it the function returns HTTP 503 with a clear error. |
| `RESEND_FROM_EMAIL` | no | Default `ANSHA Trading <noreply@anshatradingco.com>`. Must be a verified Resend sender/domain. |

Set with Supabase CLI against project `ydrnilquojvalhgifest`, e.g. `supabase secrets set RESEND_API_KEY=re_… RESEND_FROM_EMAIL="ANSHA Trading <noreply@anshatradingco.com>"`. Redeploy `send-outbound-email` after changing secrets. SMTP is not wired in this MVP — Resend only.

AI ops assistant (Phase 42): set on the **Vercel** project (and local `.env.local`), not as browser `NEXT_PUBLIC_*` values:

| Variable | Required | Notes |
|---|---|---|
| `AI_GATEWAY_API_KEY` | preferred | Vercel AI Gateway; AI SDK default provider |
| `OPENAI_API_KEY` | fallback | Direct OpenAI when gateway is unset |
| `AI_MODEL` | no | Override model id |

## Capacitor (native shell)

Store builds are local: generate `android`/`ios` with `npx cap add …`, then `npx cap sync` and open Android Studio or Xcode. The shell loads the deployed public URL (`capacitor.config.ts` `server.url`), not a bundled Next.js `out/` folder. CI and Vercel remain web-only. Full steps: `docs/Mobile.md`.


WhatsApp Business Cloud API (Phase 40): set Edge Function secrets for `send-whatsapp` (never `NEXT_PUBLIC_*`, never commit tokens):

| Secret | Required | Notes |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | yes | Meta permanent Cloud API token (alias `WHATSAPP_CLOUD_API_TOKEN` also accepted). |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | WhatsApp Business phone number ID from Meta. |
| `WHATSAPP_API_VERSION` | no | Graph API version; default `v21.0`. |

Set with Supabase CLI against project `ydrnilquojvalhgifest`, e.g. `supabase secrets set WHATSAPP_ACCESS_TOKEN=… WHATSAPP_PHONE_NUMBER_ID=…`. Redeploy `send-whatsapp` after changing secrets. Admin UI `/admin/whatsapp` probes `action: status` and shows setup instructions when secrets are missing (no crash).

Google Tag Manager: set on the **Vercel** project (and local `.env.local`). The container ID is publishable (not a secret). Loaded from:

- `app/(public)/layout.tsx` — all public routes (home, catalog, blog, markets, verify, cookie-policy, etc.) via `components/analytics/google-tag-manager.tsx`
- `app/portal/layout.tsx` — customer portal (same origin)

Not loaded on `/admin`. Head snippet uses `next/script` (`afterInteractive`) and loads the container from the **first-party gateway path** (default `/metrics/?id=…`), not `www.googletagmanager.com`. Noscript iframe still uses `https://www.googletagmanager.com/ns.html?id=…` — Google tag gateway does **not** support first-party noscript. Configure GA4 and other tags inside the GTM container — do not also load direct `gtag.js` for a measurement ID. Disclosed in `/cookie-policy`. No consent banner yet.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_GTM_ID` | yes (prod) | Production value `GTM-TFSZD9WT`. If unset locally, app falls back to `siteConfig.gtmId`. Set to an empty value on Preview to disable GTM. |
| `NEXT_PUBLIC_GTM_GATEWAY_PATH` | no | Default `/metrics`. Must match the Vercel rewrite measurement path and stay unused by App Router pages. |

Vercel: **Settings → Environment Variables** → add `NEXT_PUBLIC_GTM_ID` = `GTM-TFSZD9WT` for **Production** (and Preview only if you want GTM there). Optional `NEXT_PUBLIC_GTM_GATEWAY_PATH=/metrics`. Remove any leftover `NEXT_PUBLIC_GA_MEASUREMENT_ID` so you do not dual-load gtag. Redeploy after changing — `NEXT_PUBLIC_*` is baked at build time.

### Google tag gateway for advertisers

First-party measurement path: **`/metrics`** (no App Router page conflict; alternatives if needed: `/gtm`, `/metrics-gtm`).

| Item | Value |
|---|---|
| GTM container | `GTM-TFSZD9WT` |
| Gateway origin | `gtm-tfszd9wt.fps.goog` (lowercase container id) |
| Browser script | `https://www.anshatradingco.com/metrics/?id=GTM-TFSZD9WT` |
| Vercel rewrite | `/metrics` and `/metrics/:path*` → `https://gtm-tfszd9wt.fps.goog/metrics` and `…/metrics/:path*` (`vercel.json`) |

**Host header:** Vercel external rewrites open a new HTTPS connection to the destination URL, so upstream `Host` is `gtm-tfszd9wt.fps.goog` automatically. Vercel does **not** expose a custom Host override on rewrites; none is needed when the destination hostname is already the fps.goog origin.

**Geolocation headers:** Google expects `X-Forwarded-CountryRegion` (or `X-Forwarded-Country` + `X-Forwarded-Region`) on the upstream request. Vercel rewrites do **not** add those Google-specific headers (they expose `x-vercel-ip-country` / `x-vercel-ip-country-region` to the app, not to fps.goog). Routing/`/metrics/healthy` can succeed while `?validate_geo=healthy` fails. For full gateway compliance (geo validate = `ok`), put Cloudflare (Origin Rule + visitor location headers) or a GCP HTTP(S) load balancer in front of the site and route `/metrics/*` there with Host override + geo headers. Keep the Vercel rewrite as a best-effort path until that layer exists.

**Health checks** (after deploy; rewrites are Vercel-only — not applied by local `next dev`):

| Check | URL | Expected |
|---|---|---|
| Routing | `https://www.anshatradingco.com/metrics/healthy` | body `ok` |
| Geo headers | `https://www.anshatradingco.com/metrics/?validate_geo=healthy` | body `ok` (may fail on Vercel-only rewrite; see above) |

**Tag Assistant:** Preview the site → Summary → Output → Hits Sent. Script and measurement requests should hit `www.anshatradingco.com/metrics/…`, not `www.googletagmanager.com/gtm.js`. Noscript may still reference googletagmanager.com. Optionally set `server_container_url` = `https://www.anshatradingco.com/metrics` on Google tags inside the container so GA4/Ads collect via the gateway path.

### GTM / GA — Configure your domains

In Google Tag Manager / Analytics (as applicable for tags in the container), allow the domains where tags may fire:

| Domain | Why |
|---|---|
| `www.anshatradingco.com` | Canonical production host (`siteConfig.url`) |
| `anshatradingco.com` | Apex; redirects to www (`next.config.js`) |
| `anshatrading.com` | Legacy alias; redirects to www |
| `www.anshatrading.com` | Legacy www alias; redirects to www |

Optional: Vercel Preview hosts (`*.vercel.app`) only if Preview builds leave `NEXT_PUBLIC_GTM_ID` set — prefer blank Preview env so previews do not pollute production analytics.

Tawk.to live chat (public widget + admin agent inbox): set on the **Vercel** project (and local `.env.local`). These are publishable widget IDs, not secrets — still do not hard-code them in git.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_TAWK_PROPERTY_ID` | yes (to enable) | From embed URL `https://embed.tawk.to/<PROPERTY_ID>/<WIDGET_ID>` |
| `NEXT_PUBLIC_TAWK_WIDGET_ID` | yes (to enable) | Widget id from the same URL |
| `NEXT_PUBLIC_TAWK_DASHBOARD_URL` | no | Defaults to `https://dashboard.tawk.to` for `/admin/live-chat` |

Leave property/widget blank to disable the public widget. Admin Live chat is **admin + manager only** (see `docs/Roles.md`). Redeploy Next.js after changing Vercel env.

**Phase 58 (activated):** Tawk webhook mirror — Edge secret `TAWK_WEBHOOK_SECRET`, migration `20260920070000_phase_58_tawk_chat_events.sql`, Edge Function `tawk-webhook` deployed with `--no-verify-jwt`, Tawk dashboard → Webhooks → URL `https://ydrnilquojvalhgifest.supabase.co/functions/v1/tawk-webhook` (Chat Start, Chat End, New ticket). Full steps: `docs/Tawk.md`. Never commit the webhook secret.

## Phase 61 / 61b (export docs + Incoterms)

App-only ship after schema already applied on Supabase `ydrnilquojvalhgifest`:

- Migrations in git: `20260920100000_phase_61_export_docs_incoterms_reservations.sql`, `20260920150000_phase_61b_reservation_inspection_invoice_terms.sql` — **do not re-apply** if already in `schema_migrations`.
- Storage bucket `export-shipment-documents` (private; signed URLs from admin UI) is created by the Phase 61 migration.
- No new Vercel or Edge Function secrets for this phase. Shared labels live in `lib/trade-terms.ts`.
- After production READY: spot-check `/admin/export-shipments` doc upload, reservation terms, invoice print header terms, public Incoterm strip + invoice verify.

## Phase 62 (stock ops + export masters + VAT)

App-only ship after schema already applied:

- Migration in git: `20260920200000_phase_62_sales_assignment_export_masters_vat.sql` — **do not re-apply** if already in `schema_migrations`.
- No new Vercel or Edge Function secrets. Routes: `/admin/stock`, `/admin/stock/arrival-watch`, `/admin/configuration`.
- After production READY: spot-check stock dual-status columns, Arrival Watch, Configuration masters on export shipments, field-agent own-reservation visibility, VAT Yes/No on reserve/proforma, BOL/waybill status automation.

## Phase 63 (parts stock ops + export parts)

App-only ship after schema already applied:

- Migrations: `20260920210000_phase_63_parts_stock_ops_sales_scope.sql`, `20260920210000_seed_export_master_options.sql` — **do not re-apply** if already recorded.
- Routes: `/admin/parts/stock`; export shipments accept `part_ids` / `export_shipment_parts`.
- After production READY: reserve/release parts; field-agent parts RLS; redesigned `/admin/parts` + `/admin/vehicles` lists.

## Phase 64 (invoice unallocate-delete + stock restore)

App-only ship after schema already applied:

- Migration: `20260920220000_phase_64_invoice_unallocate_delete_stock_restore.sql`.
- Helpers: `lib/invoice-delete.ts`. Spot-check Unallocate → Delete and Unallocate & delete; linked stock returns to available.

## Phase 65 (owned vs auction stock pools)

App-only ship after schema already applied:

- Migration: `20260920230000_phase_65_vehicle_stock_pool.sql` (Japan backfill to `auction_third_party`).
- Routes: `/admin/vehicles` (owned), `/admin/auction-stock` (third-party). Stock ops stay owned-only.

## Phase 68 (export / request hard-delete)

App-only ship after schema already applied:

- Migration: `20260920260000_phase_68_export_request_delete.sql`.
- RPCs: `delete_export_shipment`, `delete_workspace_request`. Spot-check draft/cancelled delete + account-admin force.

## Phase 69 (remittances module)

App-only ship after schema already applied on Supabase `ydrnilquojvalhgifest`:

- Migrations: `20260921010000_phase_69_remittance_module_offices_shifts.sql`, `20260921011000_phase_69_drop_create_remittance_14arg.sql` — **do not re-apply** if already in `schema_migrations`.
- No new Vercel or Edge Function secrets.
- Routes: `/admin/remittances/dashboard`, `/admin/remittances`, `/admin/remittances/mine`, `/admin/remittances/unknown` (picklist URLs `/offices` `/shifts` optional, not primary nav).

## Phase 70 (user office/shift + remittance dashboard filter)

- Migration: `20260921020000_phase_70_admin_profile_office_shift.sql` — `admin_profiles.office_id` / `shift_id`; create/link remittance default from profile; backfill from existing remittance tags.
- Redeploy Edge Functions `admin-create-user` / `admin-update-user` so Users can save office/shift.
- UX: assign office/shift on **Users**; receive auto-fills from linked user; dashboard filters by office; Remittances nav no longer lists Offices/Shifts as config hubs.

## Phase 71 (allocate/unallocate fix + stock invoice docs)

App-only ship after schema already applied:

- Migration: `20260921030000_phase_71_allocate_unallocate_fix.sql` — unallocate RPCs SECURITY DEFINER; `invoice_payments` DELETE for any receivables manager.
- UX: **Allocate remaining** + per-row **Unallocate** on remittance list and invoice detail; part/vehicle detail **Invoices & documents** (`components/admin/stock-linked-invoices.tsx`).
- Also this ship: clear reservation on available (`20260921040000_clear_reservation_on_available.sql`); export markets **20→70** (`lib/export-markets.ts`); edit-part UI completeness (reservation/VAT/SEO/OEM).
- No new Vercel secrets. Redeploy Edge `admin-create-user` / `admin-update-user` if not already updated for Phase 70 office/shift.

## Phases 72–78 (commissions → customer auto ID)

Migrations already applied on production — deploy app code only; do not re-apply if present in `schema_migrations`:

| Phase | Migration | Notes |
|---|---|---|
| 72 | `20260921060000_phase_72_commission_claims.sql` | `/admin/commissions`; claim/review RPCs |
| SOA | `20260921050000_soa_sync_on_reservation_release.sql` | Buying clears on release |
| 73 | `20260921070000_phase_73_remittance_auto_confirm.sql` | Link customer+agent → confirmed |
| 74 | `20260921090000_phase_74_yards_config.sql` | `/admin/configuration/yards` |
| 75 | `20260921100000_phase_75_shipping_companies.sql` | `/admin/configuration/shipping-companies` |
| 76 | `20260921110000_phase_76_freight_charges.sql` | `/admin/freight-charges` |
| 77 | `20260921120000_phase_77_bulk_reserve_stock.sql` | Catalog bulk reserve |
| 78 | `20260921130000_phase_78_customer_auto_id.sql` | `customer_code_seq` ~48001+; consignee |

App-only (no new secrets): Allocate To Stocks; remittance Excel/CSV export; reports hub + Excel; vehicles Export Excel; stock invoice badges; multi-currency `formatMoneyBreakdown` / **MoneyBreakdown**.

## Post–Phase 78 (Make Available + security + SOA/SEO UI)

Migrations **already applied on production** — deploy app code only; do not re-apply if present in `schema_migrations`:

| Migration | Notes |
|---|---|
| `20260922010000_fix_sync_catalog_sold_state_security_definer.sql` | Make Available: DEFINER `sync_catalog_sold_state` + `clear_reservation_buying_documents` |
| `20260922020000_security_advisor_hardening.sql` | PO sequences RLS; tawk receipts deny; `touch_admin_last_seen` anon revoke |

App-only (no new secrets): customer SOA `#soa` section + portal/account **MoneyBreakdown**; dashboard/analytics All-currencies cleanup; Product JSON-LD via `lib/product-schema.ts`.

## Admin UI polish (post-65, no migration)

App-only: Configuration search/inactive filter; Reserve + Receive Stock `NativeSelect` forms; SearchableSelect chevron; responsive admin shell (`admin-shell` / `admin-table-scroll`). No schema or secrets.

## Rollback

Vercel instant rollback to a previous production deployment is the application rollback. Database is **not** rolled back by a Vercel revert. Forward-fix with a new migration if schema already applied.

## Backups

Supabase project backups are an infrastructure concern, not an in-repo script. Do not treat `supabase db reset` as a recovery tool on production.

## Leftovers

- Inactive Supabase project `kmngigxpqhiilcavmcmm` is already `INACTIVE` (cannot pause again). Permanent delete is a dashboard action if still required.

## Edge Functions

`admin-create-user`, `admin-update-user`, `send-outbound-email`, `send-whatsapp`, `tawk-webhook`, and related functions deploy with the Supabase project, not with the Next.js Vercel build. Shared CORS lives in `supabase/functions/_shared/cors.ts`. Deploy JWT-protected functions together so they keep the same origin allowlist and anon-key caller verification. Deploy `tawk-webhook` with `--no-verify-jwt` (Tawk cannot send a Supabase JWT; HMAC is verified in-function).

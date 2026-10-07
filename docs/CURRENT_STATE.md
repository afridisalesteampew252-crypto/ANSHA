# Current State

Code checkpoint: **7 October 2026**. This document separates verified repository
work from production activation. Do not infer database migration execution from
a GitHub merge.

## Repository and release

- GitHub PR **#115** merged the previous security package into `main` at
  `fea3a65461f1c6e82246580492b4f463f34b72fc`. Its tree matched the starting
  security checkout exactly.
- The follow-up package combines security, performance, customer access,
  notifications, finance, catalog/freight, Android and communication changes.
- The user requested the complete code on `release/full-project-package` for
  their own merge, and separately authorized applying the database and functions
  now. `main` and the production website remain unchanged by this release.
- Management API access recovered after the environment network update.
  Live history confirmed that PR #115's seven October security migrations had
  not been applied. All 17 October release migrations were then applied in
  order, each with its migration-history entry in the same transaction.
- Historical migration timestamps differ between Git and Supabase. Twenty-one
  older versions map to previously applied migrations by name; two further
  historical fixes are already effective in the live schema. These were not
  blindly replayed over later production functions.
- `password-login`, `portal-password-reset`, and updated `send-admin-push`
  deployed successfully, with JWT verification disabled at the gateway and
  authorization enforced inside the handlers.
- The direct Auth Password Verification Attempt hook could not be enabled:
  Supabase returned HTTP **402** because this organization does not support it.
  The app gateway's three-attempt/five-minute cooldown works independently;
  direct Supabase Auth calls are not covered until the provider hook is enabled
  on a supported plan. No plan upgrade was purchased.

## Verified code changes

### Database security and performance

- Assignment fails closed for absent/inactive roles. Managers act only on their
  current customer book; account admins control portal identity links.
- Reservation guards cover reserve/release/ownership/publishing transitions.
  Payroll, GL, proof review and transferred invoice-item authorization are
  exercised with actual role fixtures.
- Native push checks current recipient ownership again at delivery, including
  customer reassignment after an alert was queued.
- Four targeted FK indexes were added. **No unused indexes were deleted.**
- Eight additional hosted legacy functions were hardened by the optional
  `20261007090000` migration. Final production inspection found no unsafe
  application definer search paths, no public tables without RLS, and only
  `verify_invoice(uuid)` available to anonymous callers.
- The production read-only report found 499 indexes, 386 with zero scans
  (230 non-constraint/non-unique/non-replica candidates), zero exact duplicate
  pairs, 59 FKs without a leading-key index, 51 partially covered FKs, and
  47 permissive-policy overlap groups. Statistics reset time is unknown;
  zero scans alone does not establish that an index is unused.
- Auth allocation changed from 10 connections to **17%** of the current
  60-connection database capacity and was verified by config readback.
- Details: [database review](./PHASE-1-DATABASE-REVIEW.md),
  [RPC audit](./PHASE-1-RPC-AUDIT.md), and
  [regression checklist](./PHASE-1-SECURITY-REGRESSION.md).

### Customers and sign-in

- Audited assignment/reassignment/unassignment plus admin Undo with a
  concurrent-change guard.
- Shared server password counter: three wrong passwords within five minutes
  cause a five-minute lock through the app gateway. Direct provider coverage
  remains blocked by the Supabase hook plan restriction described above.
  Browser storage is only a countdown display.
- Active-admin customer reset, password visibility/confirmation, and recovery
  links that work in a new browser.
- Activation: [Customer Authentication](./Customer-Authentication.md).

### Notifications and daily work

- Admin and customer notification centers provide unread counts, read/all-read
  actions, error/retry states and recipient-filtered realtime updates.
- Customer alerts cover support replies, invoice events and TT proof reviews.
- Today's Work combines requests, proofs/unknown TTs, invoice issues,
  reservations, shipments, support and failed imports/email; manager totals
  preserve ownership scope.
- Native sender uses the current Mumbai endpoint and `ansha_default` channel,
  and skips duplicate support pushes. Provider secrets and physical delivery
  remain deployment/device checks.

### Finance

- Admin-configured currency choices across TTs, invoices, banks and catalog.
- Each TT preserves its individual source amount/currency and bank exchange
  rate; rates are not averaged.
- Customer invoice totals, paid/remaining amounts and TT/direct payment history.
- Admin/customer SOA: currency/date filters, opening/running/closing balances,
  PDF and Excel. TT allocations do not credit the same receipt twice;
  proformas/drafts do not become posted receivables.
- PKR expenses and balanced PKR GL posting passed executable SQL fixtures.

### Public catalog and freight

- Bulk FOB/legacy-price synchronization and public catalog/detail/market/search
  cache invalidation restored.
- FOB → C&F → CIF estimates with explicit freight/insurance currency checks.
- Saved make/model dimensions, automatic volume defaults, RoRo per-M³ rates
  and 40-foot 6/4/3 sharing.
- Normalized destination assignment; country-specific inventory remains scoped.
- Parts SEO/identity/tags/fitment imports and public tag search.
- Import templates preserve omitted values and report fitment-write failures.
  Fitment writes are sequential, not a transaction across the complete import.
- The user's menu implementation was preserved. Search reads the submitted
  form directly so hydration does not erase typed input.

### Android and communication

- Customer APK **1.5 / code 6**, admin APK **1.4 / code 5**, included under
  `public/downloads` with matching download-page versions and SHA256 checksums.
- Both built successfully and passed package/signature/config validation.
  Signing certificates match the previous downloads. These remain debug-signed
  direct-install builds.
- Adaptive icons, safe screen insets, animated opening and offline retry screen.
- Push registration handles signed-in accounts and portal/admin deep links.
- APK workflows are manual artifact builds with read-only repository
  permissions; they do not commit directly to main.
- Team chat supports voice attachments, one-time location, and direct/group
  Jitsi call invitations. Media is not stored/streamed through Supabase.
  Jitsi hosting/moderator access and physical call/push tests remain external
  checks. See [Team Communication](./Team-Communication.md).
- PWA server snapshots are stable; first service-worker installation no longer
  reloads an active form. Worker updates can still refresh once.

## Verification evidence and limits

- Fresh PostgreSQL 15 replay: **154 migrations passed**, followed by the
  optional 155th migration and another successful run of all **seven SQL
  behavior suites**. The hosted-only patch also passed two applications to
  the eight actual legacy definitions in a rolled-back local fixture.
- Six Node regression scripts passed: catalog, finance, mobile/PWA, native push,
  notification stores, and password gateway/cooldown behavior.
- Lint, TypeScript, 55 brand assets and production build passed. The final
  production-server browser run passed **24 tests**, with one real-invoice
  fixture test skipped. It covers public routes, anonymous boundaries,
  password controls, mocked gateway cooldowns, More menu and header search.
- The disposable PostgreSQL fallback validates SQL/RLS/RPC behavior, not the
  complete Supabase HTTP/Auth/Realtime/Storage services. It excludes pg_net
  transport and uses the normal unset-Vault-secret delivery branch.
- Production migration execution, Edge deployment, Auth percentage readback,
  current index/FK/policy evidence and deployed handler authorization were
  checked independently. Successful customer login, recovery-email delivery,
  authenticated UI flows and real-device push/calls still need release smoke
  checks; local fixtures do not establish those external results.
- The historical infrastructure snapshot is
  [PROJECT-AUDIT-2026-10-07](./PROJECT-AUDIT-2026-10-07.md): Mumbai project
  `spmnxwhwsgpaoiklezex`, Vercel `anshanew`, canonical
  `https://www.anshatradingco.com`. Its figures are dated audit evidence,
  not refreshed live measurements.

## Release order

1. Review the combined release branch and its validation evidence. Backend
   migrations/functions are deployed; production Auth redirects and configured
   SMTP/FCM settings were preserved.
2. Merge the release branch when ready. This is the user's remaining website
   release step; GitHub/Vercel will build the merged production commit.
3. Confirm Vercel production commit/health, catalog routes and APK downloads;
   smoke-test sign-in, recovery, ownership, finance, queue and notifications.
4. If direct Auth lockout is required, enable and test the Password Verification
   Attempt hook after obtaining plan support. Do not imply the current gateway
   protects alternative direct Auth clients.
5. Complete real-device APK install/update/push and two-person/group-call checks.

Full scope and activation evidence:
[FULL-PACKAGE-CHECKLIST](./FULL-PACKAGE-CHECKLIST.md).

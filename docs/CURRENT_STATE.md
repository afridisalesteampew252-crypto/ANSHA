# Current State

Code checkpoint: **7 October 2026**. This document separates verified repository
work from production activation. Do not infer database migration execution from
a GitHub merge.

## Repository and release

- GitHub PR **#115** merged the previous security package into `main` at
  `fea3a65461f1c6e82246580492b4f463f34b72fc`. Its tree matched the starting
  security checkout exactly.
- PR **#116** merged the complete security, performance, customer access,
  notifications, finance, catalog/freight, Android and communication package
  at `849d52a`. Its backend activation was separately authorized and completed.
- PRs **#117** and **#118** subsequently added public gallery rotation and the
  stationary admin sidebar. That production checkpoint was
  `389e01b`: vehicle/part galleries rotate every three seconds and the sidebar
  navigation scrolls independently of page content.
- PR **#119** merged the verified-agent and inquiry workflow into `main` at
  `e49e9bc`; its production Vercel deployment succeeded. The three required SQL
  migrations (`20261007100000`, `20261007101000`, `20261007101100`) were then
  applied together through the Supabase Management API, with migration-history
  entries and a PostgREST schema reload. Read-only role checks verified the
  admin agent/inquiry lists and an agent's own verification record. An anonymous
  invalid-input probe reached the intake RPC and returned validation error
  `22023`, rather than a missing-function error; it did not create an inquiry.
- PR **#120** merged the linked-customer inquiry and public parts refresh
  corrections into `main` at `b3ede39`. Forward migration `20261007102000` is applied
  to production: the customer's current account link governs inquiry SELECT
  access, including guest/manual inquiries, with original-profile fallback only
  for legacy inquiries without a customer link. A read-only customer-role check
  changed from zero visible linked inquiries to both existing linked inquiries;
  another customer's inquiries and internal tickets/activity remained denied.
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
  `verify_invoice(uuid)` available to anonymous callers at that checkpoint.
  The agent feature deliberately adds one narrow anonymous intake RPC,
  `submit_sales_inquiry(text,text,text,text,uuid,uuid,text,text)`; direct inquiry
  writes remain revoked and anonymous callers cannot browse inquiries.
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

### Agents and customer inquiries

- Active admins manually review an agent's full name, phone and contact email.
  Only active, verified sales/freelancer accounts can share accepted referral
  links, receive assignments or use the agent inquiry workflow. Changed
  contact details require another review; agents cannot undo suspension.
- Public website/mobile inquiries accept phone **or** email without requiring
  account creation and display the actual saved inquiry reference. The first
  browser referral lasts 30 days; the server independently verifies the agent
  and resolves any signed-in customer identity.
- Admins assign both direct and referred inquiries. Original introducer,
  assigned handler and existing customer owner remain separate records.
  Reassignment preserves referral attribution and revokes the old agent's
  inquiry, file, activity and related notification access.
- The inbox provides stages, sources, due follow-ups, notes, search, explicit
  duplicate-customer review and manually logged WhatsApp/phone inquiries.
  Agents see assigned leads and their own unassigned submissions; the latter
  are read-only until admin assignment. Existing closed history becomes
  Archived without guessing a sale outcome.
- Legacy request actions, attachment/storage access, reminders, chat context,
  analytics and ownership cascades follow the inquiry scope. Inquiry-linked
  ticket edits use the inquiry workflow so status and sales stages stay in
  sync. Inquiry/audit history cannot be hard-deleted through these clients.
- Customer inquiry lists include admin-linked guest/manual inquiries. Unlinking,
  relinking and changing a portal account's customer mapping update access
  immediately; inactive portal profiles cannot browse either linked or legacy
  own-profile inquiries. The home summary relies on the same database policy.
- Won tracks sales progress; this release does not automatically create
  invoices, approve payments or calculate/pay referral commissions.
- Operating and activation guide:
  [Agent verification and inquiry workflow](./AGENT-INQUIRY-WORKFLOW.md).

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
- The public parts count is the number of published, available listings rather
  than their summed quantity. The initial database and website reads agreed at
  181; subsequent inventory changes increased the published total to 186.
  PR #120 repairs an
  open catalog's stale state after publishing: updated server data, returning
  to the tab, repeating a search and **Refresh stock** reload the current total
  without a polling timer. The merged production rollout succeeded; fresh
  website and anonymous database reads both returned 186, including Nissan
  `ANS-P-000183`. Audi `ANS-P-000171` was still unpublished at this checkpoint.

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

- Public parts refresh: three browser regressions passed against the production
  build for manual/same-search refresh, tab-return deduplication, applied filters
  and drafts, zero/error/retry states and obsolete responses arriving after new
  results. Actual-component fixtures also verified refreshed server payloads,
  query removal and literal `all` searches. Full release lint, TypeScript, eight
  Node scripts, 55 brand assets and the production build passed. The Storage
  fixture correction passed with the official delete guard simulated locally.
- Linked-customer repair: all **nine SQL behavior suites** passed on the
  previously validated 158-migration baseline plus the forward repair. Expanded
  real-role cases cover guest/manual links, unrelated/inactive customers,
  unlink/relink, account remapping, immutable origins and denial of internal
  activity/files, customer records and inquiry writes. Atomic activation and
  idempotent migration-history recording also passed locally. Actual-page
  browser fixtures verified both portal views, safe stock reads, mobile layout,
  empty states and error/retry. Full release lint, TypeScript, eight Node scripts,
  55 brand assets and the production build passed. Production role checks are
  database assertions; they do not establish a real logged-in browser session.
- Agent feature fresh PostgreSQL 15 replay: **158 migrations and nine SQL
  behavior suites passed**, including manual review, inactive/role boundaries,
  referral validation, agent transfer, creator read-only access, legacy RPC
  denial, attachment/storage scope, analytics and manager alert compatibility.
  The prior hosted-only patch also passed two applications to the eight actual
  legacy definitions in a rolled-back local fixture.
- The agent feature passed all **eight Node regression scripts**, covering
  catalog, finance, mobile/PWA, native push, notification stores, password
  gateway/cooldown, contact normalization/review gates, first referrals and
  scoped inquiry payloads. Full lint, TypeScript, 55 brand assets and the
  production build also passed.
- The prior complete release passed lint, TypeScript, 55 brand assets and a
  production build. Its production-server browser run passed **24 tests**,
  with one real-invoice
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
- The agent feature adds verification/inquiry SQL fixtures and two Node
  regression scripts. Actual component browser checks cover manual reviews,
  public forms, first referral capture, admin assignment, My inquiries,
  request compatibility, error recovery and mobile layout using isolated
  local transports. Those fixtures do not establish actual production browser
  sessions or physical-device behavior.
- Production-build browser security checks passed **11 tests**, including
  anonymous boundaries for verification, inquiries and requests. One test
  requiring a real invoice verification fixture was skipped. Older inquiry
  detail links and transfer refresh revocation also passed component fixtures.
- The database CI replay previously failed because two historical SQL files
  share version `20260920210000`. The workflow now gives the seed a unique
  version only inside its disposable checkout. Tracked historical SQL names
  and hosted migration bookkeeping stay intact.
- PR #120's initial full Supabase run passed migrations, reset and pgTAP but
  found a Storage fixture compatibility issue: its statement guard rejects raw
  DELETE before the RLS assertion can run. The fixture now models the Storage
  API's transaction-local delete context while keeping the authenticated JWT
  and row policies active; it verifies the former assignee deletes zero rows
  and the current assignee can still read the retained file.
- The next Supabase run exposed three fixture joins with an unqualified `role`
  column that collided with `auth.users.role`. Those projections now explicitly
  use their fixture aliases. The fallback Auth table includes the real `role`
  column so subsequent local runs can catch that ambiguity before CI.
- PR #120 was merged on October 7. Its last database CI failure was runner
  setup: Supabase's restricted local `postgres` user cannot switch to the Auth
  hook role. Transactional suites now use the disposable stack's trusted
  `supabase_admin` executor, after validating the connection is loopback-only.
  Each suite still switches to the real application/Auth roles for assertions;
  production grants are unchanged. All nine suites passed locally with the
  actual Auth role column, Storage delete guard and restricted-role probe.

## Release order

1. The security package, gallery/sidebar releases and agent feature are merged;
   their database activation has been checked separately. For a new environment,
   apply the agent feature's three migrations in order before website activation.
   Do not replay older hosted migrations over later definitions.
2. PR #120 merged the linked-customer inquiry and public parts refresh repairs.
   Its forward SELECT-policy change was already applied to the hosted database.
   Confirm the GitHub/Vercel production rollout and check the customer home
   summary, inquiry list and parts refresh behavior.
3. Review the disposable Auth test-runner correction on
   `fix/disposable-auth-test-executor` after its database CI replay finishes.
   Existing agents still require manual review; none are automatically verified.
4. If direct Auth lockout is required, enable and test the Password Verification
   Attempt hook after obtaining plan support. Do not imply the current gateway
   protects alternative direct Auth clients.
5. Complete real-device APK install/update/push and two-person/group-call checks.

Full scope and activation evidence:
[FULL-PACKAGE-CHECKLIST](./FULL-PACKAGE-CHECKLIST.md).

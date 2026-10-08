# Admin reliability audit fixes

Checkpoint: 8 October 2026. Branch: `fix/admin-reliability-audit`, based on
`d85b0f5`. This package is for review; it does not merge or activate production.

## Implemented

- Added page, admin shell and root error recovery without depending on root
  providers. Each Recharts visualization in Overview, Analytics, customer detail
  and financial dashboards has a separate retry boundary.
- Removed the inactive-user login redirect loop. Required session/profile
  failures show retry; optional sidebar badges/avatar failures preserve the
  workspace and show a refresh warning. Slow login initialization is bounded.
- Extracted dashboard loading into a checked loader. Every required count/query
  must succeed before figures display; optional analytics failures show a
  warning and use complete accessible records. Outstanding fallback includes
  older invoices. Currency totals remain separate.
- Added stable, exact-count pagination that advances by actual received rows,
  including when the provider cap is lower than the requested page size.
  Duplicate IDs, changing counts, missing pages and later failures reject the
  result instead of exporting partial data.
- Parts and vehicle inventories share the complete loader, including shipment
  and invoice relationships. ID lookups use bounded batches. Cards show 50 at
  first with Show more; complete totals, filtering, selection and export remain.
- Unread chat uses exact counts scoped to membership, sender and last-read time.
  Conversation details/attachments paginate; recent previews are explicitly
  bounded. Message display uses the newest 300 messages, rather than the oldest
  300. Conversation switches ignore stale responses; errors and receipt-write
  failures are visible.
- Extracted seven operational-report loaders from the large UI component.
  Primary and related reads paginate, failed related lookups stop the export,
  and changing filters hides previous results and rejects stale completions.
- Ops AI chat validates actual UTF-8 body size (128 KiB), history (40 messages),
  individual message length (12,000 characters), total text and grounding
  (48 KiB each). Client tool/reasoning output is not reused as authoritative
  grounding. Model calls have 1,200 output tokens, at most three steps, no
  automatic retries, and the request abort signal.
- New database quota serializes concurrent requests for each active ops user:
  20 requests/10 minutes and 200/24 hours. Missing quota infrastructure fails
  closed before model invocation. Owned thread messages and title/timestamps
  save in one transaction; failed saves are visible to the user.
- Sanitized rich-text editable/preview HTML and paste/drop; restricted toolbar
  URL schemes. Reviews use the shared JSON-LD escape helper. Public/invoice
  banking details share a canonical source without changing account values.
- Updated sharp 0.35.4 to 0.35.5 with matching optional binary dependencies.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run test:unit` (16 scripts),
  `npm run verify:brands` (55 assets), and `NODE_USE_ENV_PROXY=1 npm run build`.
- Regression datasets exceed 1,000 records and use a provider cap of 37 rows;
  late-page failures and related-query failures reject incomplete totals/exports.
- Actual Chromium fixture with real React/Recharts: a throwing chart leaves
  surrounding content visible; Retry renders a real pie. Actual rich-text
  Write/Preview/HTML transitions, paste/drop and unsafe links remain sanitized.
  Backend access was stubbed and no production writes were made.
- `tests/database/ops-ai-chat-quota.test.sql` ran against the existing local
  PostgreSQL application fixture: anon/non-ops/inactive denial, role-isolated
  quotas, both windows, expiry, private-table denial, owned-thread writes,
  input validation and rollback when thread update fails.
- A separate local concurrent fixture sent 32 requests across 12 workers:
  exactly 20 allowed and 12 denied. Its user/data were removed afterward.
- Real sharp SVG-to-PNG conversion checked the patched installed image binary.

These checks do not establish full browser end-to-end coverage or production
schema parity. The prior audit's claim about all tables/functions was not
revalidated as a complete database authorization audit here.

## Release requirement

Apply `supabase/migrations/20261008090000_ops_ai_chat_quota.sql` before releasing
this website branch. It creates a private quota table and two authenticated,
ops-authorized RPCs, then reloads the API schema. It has **not** been applied to
production. A missing migration makes AI chat return a visible temporary
unavailability response, with no model generation. Other website improvements
have no new migration dependency.

Also verify the existing `20261007203500` GL reversal migration against hosted
migration history; a prior website merge is not evidence of database execution.

## Remaining external and maintenance work

- Google Cloud restrictions for Firebase public client keys require Console
  access and signed-device checks. They cannot be verified from committed JSON.
- The final npm audit retains 13 affected entries (7 high, 6 moderate): braces
  has no published patch at review; selector-parser and uuid fixes cross the
  current consumers' major versions. See [RENDERING-SAFETY](./RENDERING-SAFETY.md)
  for exposure and specific follow-up. No blind force upgrade was used.
- Recharts 3 migration and broader splitting of vehicle detail, part detail,
  remittances and chat pages are separate maintenance work. This branch extracts
  the dashboard/inventory/report loading paths relevant to the identified bugs.
- Error handling was fixed in the named affected paths. This is not a claim that
  every previously reported unchecked call across all 133 pages was rewritten.

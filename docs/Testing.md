# Testing

## What exists

- `npm run lint` — ESLint 9 + `eslint-config-next` 16.3.5, zero warnings allowed
- `npm run typecheck` — TypeScript `strict`
- `npm run build` — App Router production compile
- `npm run verify:brands` — mapped manufacturer SVGs present and named
- `npm run verify:deployment -- <https-url>` — public pages 200, canonical strings, `/api/health` healthy, unauthenticated `/admin/dashboard` redirects to `/admin`, security headers
- GitHub Actions: lint, typecheck, `verify:brands`, build on `main` and pull requests

There are no Vitest, Jest, Playwright, or database test files.

## ESLint exceptions (current)

`eslint.config.mjs` turns off:

- `@next/next/no-location-assign-relative-destination`
- `react-hooks/exhaustive-deps`
- `react-hooks/set-state-in-effect`
- `react/no-unescaped-entities`

Do not treat a green lint as proof of hook correctness.

## What tests should emphasize when added

- Auth gate: no `admin_profiles` → no ERP
- RLS: unpublished catalog invisible to anon
- Invoice `verify_invoice` returns only public fields
- Remittance allocation does not over-allocate; unknown cannot allocate until linked
- Unknown TTS link with customer + agent auto-confirms
- Commission claim only on sold stock for eligible claimant
- Bulk reserve partial success keeps succeeded rows
- Customer create without `customer_code` gets seq ≥ ~48001
- Money breakdowns never sum across currencies
- Role allowlists: field agents / accounts / manager / live-chat
- Stock `sold` trigger stamps/clears `sold_at`
- Chat/mail Storage paths deny non-members
- Request attachments only under `requests/{request_id}/` for workspace users
- PWA service worker must not cache `/admin`, `/api`, or cross-origin Supabase responses
- Web Push: only staff JWT may invoke `send-web-push`; visitors only INSERT/DELETE own subscription endpoints

Do not invent passing test counts.

## Quality gate before merge

1. `npm run lint`
2. `npm run typecheck`
3. `npm run verify:brands`
4. `npm run build` when the change can affect routes or bundles
5. Preview + `verify:deployment` for user-visible or auth/header changes

Manual browser checks are required for admin tables, chat realtime, and invoice print until an E2E suite exists.

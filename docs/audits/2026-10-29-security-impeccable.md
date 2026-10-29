# Security and Impeccable focused fixes — 29 October 2026

Base: `e236ef3748558afc78d5a512ec24d9d61f0786b4` (`main`).
Branch: `fix/security-accessibility-audit-2026-10-29`.

This is a focused source-review and remediation pass, **not a completed security audit or WCAG certification**. The initial Cloudflare workflow stopped during reconnaissance when independent agents returned usage-limit errors. No independently verified security findings or comprehensive database-coverage claim were produced. No compatible prior coverage ledger was available in the retrieved source snapshot.

## Changes

| Area | Before | After |
| --- | --- | --- |
| API request parsing | Assistant buffered the entire body before checking JavaScript string length; revalidation had no application body limit. JSON `null` could reach property access and throw. | Shared reader enforces actual UTF-8 byte limits during streaming, cancels oversized streams, releases the reader, and requires a JSON object. Assistant retains its 400,000-byte budget; revalidation uses 16 KiB. Invalid input returns 400; oversized input returns 413. |
| Admin profile checks | Proxy, workspace bootstrap, and revalidation rejected only explicit `false` activation. Unknown roles could fall through role-specific route checks. | All three require activation to be exactly `true` and a recognized role. Existing per-role route permissions and database controls remain in force. This is defensive hardening, not a demonstrated bypass of database constraints. |
| Mobile navigation | Custom overlay lacked dialog semantics, focus containment, focus restoration, and Escape dismissal; mobile search lacked an accessible name. | Existing Radix dialog dependency manages modal behavior. Dialog has a title, description, close control, labeled search and navigation. Resizing to desktop closes the dialog. |
| Desktop More disclosure | Native `<details>` state and separate React state could diverge; ARIA menu roles promised interaction semantics not implemented. | Native disclosure owns visibility; links use ordinary navigation semantics. Escape closes it and restores focus; route changes close it. |
| Password visibility | Toggle remained enabled when input was disabled and lacked an explicit keyboard focus treatment. | Toggle follows input disabled state and has a visible focus ring and minimum width. |
| Blog cards | Rounded card used an additional decorative accent border. | Removed the detector-reported accent border; added a reduced-motion alternative for card movement. |

Source changes are limited to these paths. No database migrations, role-policy changes, credential changes, production probes, deployments, or merges were performed.

## Impeccable results

The source detector initially reported three warnings and one advisory across `app` and `components`:

- Blog-card accent border: fixed.
- Two admin-chat quote/reply borders: retained because they distinguish quoted context and the active reply/edit state. They are not established usability defects.
- Decorative home-page grid: remains an advisory; a visual redesign was not part of this focused fix.

The detector completed with exit 0 and returned `[]` for the four changed UI files: site header, blog card, password input, and admin layout. This is a mechanical source scan, not a rendered accessibility or performance measurement. No 20-point audit score is assigned without the necessary rendered evidence.

## Validation

Completed:

- `git diff --check`.
- Node syntax check of the new unit regression script.
- TypeScript syntax transformation, without execution, of the request reader, RBAC module, proxy, two API routes, and updated Playwright tests.
- Impeccable detector on changed UI files.

Added but **not executed here**:

- `scripts/test-audit-security-boundaries.mjs`: activation and role cases; JSON-object shape; exact UTF-8 byte boundary; chunked and misleading Content-Length inputs; cancellation; invalid UTF-8; mocked revalidation authorization and side-effect checks. The existing `test:unit` runner discovers this script automatically.
- Playwright public tests: dialog focus containment, Escape/focus restoration, desktop-resize cleanup, accessible mobile search, and native More disclosure behavior.

Full lint, semantic typecheck, build, unit execution, browser rendering, viewport checks, and database tests remain pending. Project dependencies are unavailable locally. The environment also denies the isolation needed for target execution: Bubblewrap namespace creation failed, and the alternative Landlock probe was unavailable. Cloudflare's skill states: **“If every control cannot be enforced, do not execute target code.”** No production environment was used as a substitute.

Before merging, run `npm run verify:release` in the normal project validation environment and the relevant public Playwright tests against an isolated test app. Review mobile navigation at narrow widths and desktop, in both themes. Resume the independent security workflow separately for complete RLS, SECURITY DEFINER, storage, authentication, AI, native-app, and deployment coverage.

## Methods

- [Cloudflare security-audit skill](https://github.com/cloudflare/security-audit-skill/blob/main/skills/security-audit/SKILL.md), reviewed repository revision `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`.
- [Impeccable audit guidance](https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/reference/audit.md), reviewed repository revision `7510e233b228864606888d252abacf5e7148bf87`.

After fixes pass runtime checks, re-run `$impeccable audit`; use `$impeccable polish` for the final visual pass.

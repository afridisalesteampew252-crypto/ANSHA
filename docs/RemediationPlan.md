# ANSHA Remediation Plan

This plan turns the 24 September 2026 product audit into small reviewable commits on `feature/ansha-audit-remediation` and PR #57.

## Commit sequence

| Phase | Scope | Status |
|---|---|---|
| 1 | Mobile catalog server-side search, truthful counts, pagination, retry, and responsive cards | Committed |
| 2 | Native notification route boundaries, authenticated FCM ownership, Web Push platform filtering, and scoped policies | Committed |
| 3 | Release metadata, generated-native lint boundaries, and signed-build documentation | In progress |
| 4 | Admin import safety, offer draft/review flow, and operational error states | Planned |
| 5 | Full validation, Supabase migration verification, Android release build, and PR review checklist | Planned |

Each phase is validated before commit and pushed to the same PR. The branch remains based on `main`; no direct commits are made to `main`.

## Android release rules

The repository intentionally ignores generated `android/` and `ios/` folders. The source repository stores the Capacitor preparation script and Firebase configuration source, while each build environment regenerates native output.

Before creating a production APK or AAB, run:

```bash
ANDROID_VERSION_CODE=2 \
ANDROID_VERSION_NAME=1.1.0 \
npm run cap:sync:android
```

The preparation script copies the Firebase Android configuration, installs the ANSHA OAuth deep link, and applies the supplied version metadata when the generated Android project exists.

A production build still requires a protected signing setup. Do not commit a keystore, passwords, service-account keys, or `keystore.properties`. Use the CI secret store or a local untracked signing file, then verify the signed artifact with Android build tools before publishing.

The direct-download page must point only to a signed release artifact. Debug APKs are for internal testing and must not replace the production download.

## Product priorities

The first product improvements are correctness and trust: full inventory discovery, safe notification delivery, secure token ownership, and release hygiene. The next product slice is the commerce funnel: saved items, structured quote requests, reservations, shipping information, payment/deposit handling, order status, and support history. Visual redesign work should be implemented alongside those workflows so the APK becomes easier to use rather than only more decorative.

## Review checklist

Before merge, verify the following:

- Mobile search finds records beyond the first page.
- Load-more and retry states work without duplicate records.
- Native notification taps remain inside same-origin `/mobile` routes.
- Web Push senders do not query native FCM rows.
- Anonymous FCM registration is rejected and authenticated token ownership is stored.
- Supabase migration is applied to the intended project and checked with SQL verification.
- `npm run lint`, `npm run typecheck`, brand checks, and production build pass.
- Release metadata is versioned and the artifact is signed before public distribution.
- Admin import and offer workflow changes have row-level errors, explicit confirmation, and auditability.

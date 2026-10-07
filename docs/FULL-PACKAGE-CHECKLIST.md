# Combined release checklist — 7 October 2026

The two uploaded roadmaps were identical. All follow-up code is reviewed together;
production activation is recorded separately. GitHub PR #115 already merged the
preceding security package. The user authorized backend activation now and asked
for the complete code on a branch that they will merge themselves.

| Item | Repository result | Remaining live evidence |
| --- | --- | --- |
| 5: 238 unused indexes | Live usage/duplicate report; retained all indexes | Representative workload windows before any deletion |
| 6: 60 unindexed FKs | Live coverage report and four justified workflow indexes | Plans/traffic evidence for remaining low-traffic FKs |
| 7: query payloads | Explicit dashboard/remittance/notification/card DTOs, bounded public SSR reads | Production plans and latency measurement |
| 8: Auth percentage | Production changed from 10 connections to 17% of 60; readback verified | Login/refresh under representative traffic |
| 9: assignment | Admin Undo/CAS/audit; manager current-book scope | Deployed role smoke |
| 10: invoice/history | Own totals/paid/remaining/currency/TT/direct payments | Backend activation and customer smoke |
| 11: passwords | Gateway deployed; 3 attempts/5 minutes,admin recovery,eye/confirmation | Direct Auth hook rejected with HTTP402 (plan); recovery email smoke |
| 12–13: notifications | Recipient feeds,realtime,bells,read/all-read,native eligibility | Realtime/FCM/provider/Vault delivery smoke |
| 14: Today's Work | Requests,proofs/unknownTT,invoice issues,reservations,shipments,support,failed jobs | Deployed queue smoke |
| 15: currencies | Admin-configured choices across finance/catalog | Operator configuration review |
| 16: PKR expenses | Existing support verified with balanced PKR GL fixture | Deployed finance smoke |
| 17: TT rates | Separate immutable rate/source amount per receipt | Deployed TT smoke |
| 18: SOA | Currency/date opening/running/closing,correct credits,PDF/Excel | Deployed export smoke |
| 19: destinations | Normalized destinations and country-isolation SQL fixture | Public market smoke |
| 20–22: freight | FOB/C&F/CIF,RoRo m³,40ft6/4/3,saved model auto defaults | Actual freight config validation |
| 23: bulk edits | FOB sync,visible prices,comprehensive public invalidation | Deployed bulk edit/refresh smoke |
| 24: parts | Identity,fitment,SEO,tags,templates,structured data,compressed upload path | Catalog smoke; imports report sequential fitment failures |
| 25–26: APKs | Customer1.5/admin1.4 built and signature/package verified;icons/insets/animation/push routes | Physical install/update/permission/background delivery |
| 27: communication | Voice messages,location,direct/group Jitsi invitations;media outside DB | Chosen Jitsi host moderator/access and real calls |

## Executed gates

- 154 migrations replayed from an empty PostgreSQL15 database; final security
  deltas and the optional 155th migration applied incrementally. Seven
  transactional SQL suites pass with actual roles/actions. Eight hosted legacy
  definitions also passed repeated hardening in a disposable transaction.
- Six Node regression scripts pass. Lint/typecheck,55 brand assets and production
  build pass. Both APK builds and signatures pass; matching certificate permits
  updates from the existing downloads subject to Android hardware verification.
- Auth Edge Functions and native sender pass Deno checks.
- The final production-server public/anonymous/auth browser run passed **24
  tests**, with one real-invoice fixture test skipped. The service-worker first
  installation reload was fixed and covered by an event regression harness.
- Cloud Chromium does not trust the supplied proxy CA. No trust-store changes
  were applied. Optional public-image test transport uses TLS-verified Node
  fetches from actual storage URLs; it does not verify Chromium's direct external
  certificate handling. A global certificate import was rejected by automatic
  approval review and is unnecessary for production deployment.

## Production activation

Management API access recovered after the environment update. All 17 October
release migrations were applied transactionally with their exact history
versions. Twenty-three historical entries were already present under alternate
versions or effective definitions and were not replayed blindly.

Final production catalog inspection confirms no unsafe application definer
search paths, no public tables without RLS, and `verify_invoice(uuid)` as the
only anonymous definer entry point. Customer-notification realtime publication
and configured delivery prerequisites were checked without sending test pushes.

`password-login`, `portal-password-reset`, and updated `send-admin-push` deployed
successfully. Auth allocation is now 17% of 60 database connections (previously
10 fixed connections). Existing recovery redirects, SMTP and FCM configuration
were preserved. The direct Auth password hook returned HTTP402 because this
organization's plan does not support it; the app gateway remains independent.

Code is on `release/full-project-package`; the user will merge it. The website
has not been released to `main`. Successful login/recovery, authenticated feature
flows, physical APK installation and actual push/call delivery remain live smoke
checks after the website merge.

Index deletion and blanket policy consolidation remain evidence-based follow-up
decisions; the roadmap explicitly disallows deleting unused indexes blindly.

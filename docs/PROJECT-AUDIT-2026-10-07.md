# ANSHA Production Audit — 2026-10-07

**Audit scope:** GitHub repository, live Supabase production project, and Vercel project/deployments.
**No production data was modified. No production deployment was triggered by this audit.**

## Executive summary

ANSHA is in a strong production state, but the live database advisor still has two security review areas and several performance hygiene items.

### Verified production baseline

| Component | Verified state |
|---|---|
| GitHub | Private afridisalesteampew252-crypto/ANSHA, default branch main |
| App | Next.js 16 / React 19 / TypeScript |
| Vercel | Project anshanew, latest listed production deployment READY |
| Supabase | ANSHA-Mumbai / spmnxwhwsgpaoiklezex |
| Supabase region | Mumbai / ap-south-1 |
| Supabase status | ACTIVE_HEALTHY |
| Database | PostgreSQL 17.11 |
| Database size | ~38 MB at audit time |
| Public tables | 118; 118/118 have RLS enabled |
| RLS policies | 282 total |
| Database migrations | 140 recorded; latest 20261006040000 |
| Indexes | 493 valid indexes |
| Edge Functions | 10 active functions |
| Vercel custom domains | Verified on the ANSHA project |
| Production branch | main |

Supabase's production guidance recommends RLS on exposed tables, Security Advisor review, Performance Advisor review, SSL/network controls, MFA, controlled migrations, and load testing. This audit follows those principles.

## Findings

### P0 — Security review: SECURITY DEFINER RPC exposure

Supabase Security Advisor reports:

- 3 SECURITY DEFINER functions executable by anon.
- 123 SECURITY DEFINER functions executable by authenticated.

This does not automatically mean all 126 functions are vulnerable. ANSHA intentionally uses SECURITY DEFINER RPCs for controlled business operations such as reservations, invoices, remittances, stock actions, and reporting. The required work is to verify every exposed function has a locked search_path, explicit authorization checks, least-privilege EXECUTE grants, correct data-scope checks, and no caller-controlled privilege escalation.

The three anonymous functions currently flagged are:

- register_fcm_push_token
- register_push_subscription
- verify_invoice

verify_invoice may intentionally remain public because it supports public invoice authenticity verification, but its returned fields and input handling must remain deliberately limited.

**Action:** review, test, and consolidate grants before changing behavior.

### P1 — Security review: private tables with RLS but no policies

Two private tables are flagged informationally because RLS is enabled but no policies exist:

- private.admin_assistant_requests
- private.public_form_submissions

Because these are in the private schema, this may be an intentional deny-by-default design. Confirm that application paths use trusted server/RPC access and that no client-facing API needs direct access.

**Action:** document explicit deny-by-default intent or add narrowly scoped policies if required.

### P1 — RLS policy consolidation

Security/performance advisors report 42 multiple-permissive-policy findings. Examples include customers, invoices, payment proofs, vehicles, parts, photos, compatibility, remittances, and export tables.

Multiple permissive policies can be valid when different roles/scopes are combined, but they increase policy evaluation work and make authorization harder to reason about.

**Action:** consolidate equivalent policies where safe; do not merge policies merely to reduce the count if it changes authorization semantics.

### P1 — Performance hygiene: unused indexes

Performance Advisor reports 238 unused indexes.

This is not a reason to delete indexes immediately. Many indexes may be new, low-traffic, migration-created, or important for future workloads.

**Action:** review index usage against real query patterns and remove only confirmed redundant indexes, preferably in small batches.

### P2 — Foreign-key indexes

Performance Advisor reports 60 unindexed foreign keys.

**Action:** review them against actual joins/filter patterns and add indexes where they support common reads, RLS checks, deletes/updates, or reporting. Avoid automatically indexing every FK.

### P2 — Auth connection strategy

Performance Advisor reports that Auth is using an absolute connection allocation of 10 rather than percentage-based allocation.

On the current Micro compute this is not an urgent capacity problem, but it should be revisited if ANSHA is upgraded to a larger compute size.

### P2 — Automated authorization testing

All 118 public tables currently have RLS enabled, which is good. The remaining weakness is test breadth: ERP/RLS/stateful workflows are still much less automated than public navigation.

Add disposable-project tests for admin/staff/accounts/manager/sales/freelancer, customer isolation, manager stock-origin isolation, invoice/payment-proof isolation, reservation/release/sell, remittance allocation, bulk reserve, commission claims, file/storage access, and SECURITY DEFINER RPC allow/deny cases.

## Vercel audit

Verified:

- Project: anshanew
- Framework: Next.js
- Latest listed production deployment: READY
- Production deployments are connected to GitHub main.
- Custom domains are verified on Vercel.
- anshatrading.co and www.anshatrading.co are configured to redirect to www.anshatradingco.com.
- The Vercel project has SSO protection for non-custom deployment URLs.
- The current Vercel production deployment is associated with commit 2bd4268a (customer password recovery).

**Important:** Vercel configuration is ready, but DNS at GoDaddy is a separate registrar-side concern. A GoDaddy Builder/forwarding page can still appear when registrar DNS/forwarding has not been fully changed.

## Supabase production audit

Verified:

- Region: Mumbai ap-south-1
- Status: ACTIVE_HEALTHY
- PostgreSQL 17.11
- 118 public tables with RLS enabled
- 282 public RLS policies
- 493 valid indexes
- 140 migrations recorded
- Latest migration: 20261006040000
- Database size: ~38 MB
- 10 active Edge Functions

This is a healthy starting point for ANSHA on the Pro + Micro configuration. There is no evidence from this audit that ANSHA currently needs a larger compute tier.

## Application/documentation audit

The repository contains dedicated documentation for architecture, database, deployment, security, performance, roles, modules, mobile/admin APKs, testing, roadmap, current state, and project audit.

The documentation is comprehensive, but several older sections still contain historical statements that can become misleading after infrastructure changes. The current baseline in this file should be treated as the authoritative 2026-10-07 audit snapshot.

## Priority plan

### Now
1. Review the 3 anonymous SECURITY DEFINER functions.
2. Review the 123 authenticated SECURITY DEFINER grants in groups.
3. Confirm private-schema no-policy tables are intentionally deny-by-default.
4. Enable Supabase Auth leaked-password protection if not already enabled.
5. Verify GoDaddy DNS/forwarding for anshatrading.co.
6. Verify Vercel production environment variables use the Mumbai Supabase project.

### Next
7. Add RLS/RPC regression tests.
8. Consolidate the highest-value multiple-permissive policies.
9. Review unused indexes before removing any.
10. Review unindexed foreign keys based on query plans.
11. Change Auth connection allocation to percentage-based if compute is increased.
12. Expand Playwright/E2E coverage for ERP and customer workflows.

### Later
13. Android release signing and update testing.
14. GSC/SEO production verification.
15. Full notification/support calling stack.
16. Optional PITR/read replica only when business/data risk or workload justifies it.

## Production rule

Do not solve advisor warnings by blindly deleting policies, functions, or indexes. ANSHA has a large ERP authorization surface. Every security/performance change should be:

**inspect → test → migration → verify → document → deploy**

No production schema changes were made during this audit.

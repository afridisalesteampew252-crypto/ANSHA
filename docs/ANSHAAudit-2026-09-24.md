# ANSHA Product, APK, Website, and Admin Audit

**Audit date:** 24 September 2026  
**Repository:** `afridisalesteampew252-crypto/ANSHA`  
**Production project:** Vercel `anshanew`  
**Scope:** Android APK/mobile frontend, public website, admin operations, Supabase data/auth/notifications, CI/release readiness, and production deployment health.

## Executive conclusion

The ANSHA APK is not yet a premium production ecommerce application. It is a **thin Capacitor WebView shell** that loads the `/mobile` Next.js route from the live website. That approach is useful for fast content synchronization, but the current implementation exposes only a narrow catalog and inquiry experience. It does not yet provide the complete customer journey expected from a serious automotive commerce app: saved items synchronized to the account, reservation creation, shipping or freight estimation, quote review, payment or deposit handling, order status, support history, and reliable native notifications.

The reported “24 units” behavior is a real product limitation, not a display bug. The mobile catalog explicitly requests only 24 vehicles or 24 parts and then filters that limited array locally. The app therefore cannot search or count inventory beyond the first 24 records returned by the query.

The second major problem is release readiness. The public download currently exposes a **debug APK** with `versionCode 1`, `versionName 1.0`, no visible production signing configuration, no native update strategy, and no completed FCM delivery path. The app can display live website changes, but that does not update the native binary when Android code, permissions, notification behavior, or security fixes change.

The public website has a strong foundation and the current production deployment is healthy, but its visual system is inconsistent across semantic tokens and hard-coded colors. The mobile browser experience also mounts several fixed surfaces that can compete for screen space. The website’s ecommerce conversion remains an inquiry shortlist plus WhatsApp handoff rather than a complete quote/order flow.

The admin site has meaningful role-based route controls and broad operational coverage. Its largest risks are operational safety and state clarity: bulk imports lack a sufficiently strong validation and rollback workflow, offers publish immediately without a review state, some reports lack explicit failure states, and at least one remittance date filter is visibly ignored because the underlying field does not exist.

## Remediation status — 8 October 2026

The following findings from this audit have been remediated and verified in the current ANSHA-Mumbai/Vercel production setup:

| Finding | Status | Evidence |
|---|---|---|
| Native FCM delivery | **Complete** | Platform-aware FCM Edge Function senders are deployed and Android delivery was tested with the Firebase service-account secret. |
| Unified admin record search | **Complete** | `search_workspace_records` RPC, trigram indexes, and the admin search UI cover customers, vehicles, parts, invoices, inquiries, and requests. |
| Today’s work queue | **Complete** | `get_today_work_queue` powers the prioritized overdue/unassigned dashboard card. |
| Customer lifecycle timeline | **Complete** | `get_customer_lifecycle_timeline` powers the chronological admin customer timeline. |
| Customer-list scale and import rollback | **Complete** | Customer pagination and reversible `rollback_import_job` workflow are live. |
| Password recovery and expired-link handling | **Complete** | Customer portal includes forgot-password, resend-verification, and expired-confirmation error handling. |
| Desktop More-menu visibility | **Complete** | Stacking/clipping regression was fixed and the production route returns successfully. |
| Vercel deployment block | **Complete** | Redeploy commit `f9ea90a` is attributed to the verified GitHub email and is `READY` in Mumbai region `bom1`. |

The following remain release or product blockers and are intentionally **not** marked complete: signed production APK/AAB packaging and update policy; full quote/order/reservation/payment workflow; strict mobile notification tap allowlisting; offer draft/review/publish safety; remittance date-filter correctness; Supabase/RLS/Edge Function integration coverage; and a formal Google OAuth end-to-end sign-in test using the production Google Cloud and Supabase dashboards. The current APK should therefore remain described as a synchronized mobile shell/inquiry app, not a complete ecommerce application.

## Priority summary

| Priority | Finding | Impact | Recommended response |
|---|---|---|---|
| P0 | Native FCM registrations are not delivered by the current senders | Android users can appear subscribed while receiving no notifications | Build and test a platform-aware FCM sender before advertising native notifications |
| P0 | Public APK is a debug/test artifact | Users may install an unsigned or non-updatable test build | Create a signed release variant, versioning policy, release checklist, and distribution strategy |
| P0 | Push token registration and subscription access are over-permissive | Token hijacking, subscriber pollution, privacy exposure, and arbitrary deletion risk | Bind registrations to authenticated ownership, restrict RPCs, remove legacy broad policies, redact subscriber data |
| P1 | Mobile inventory is capped at 24 per type and searched locally | Customers cannot discover the full inventory | Add server-side search, cursor pagination, `hasMore`, load-more/infinite scroll, and truthful counts |
| P1 | APK conversion stops at an inquiry form | The product is not an ecommerce app yet | Add saved items, quote/cart review, reservation/order creation, shipping details, payment/deposit path, and status tracking |
| P1 | Notification URLs can escape the mobile experience | Push taps may open portal, legacy website, admin, or external routes | Allowlist same-origin `/mobile` destinations and provide safe fallback routing |
| P1 | Admin imports and offers have weak safety gates | One operator mistake can publish or partially mutate business data | Add dry-run, row-level errors, duplicate policy, preview, draft/publish, rollback/archive, and audit history |
| P2 | Mobile visual system is narrow and dated | The APK feels like a responsive website rather than a premium app | Redesign the shell around hierarchy, content density, gestures, motion, richer cards, and task-focused navigation |
| P2 | Public website overlays and navigation are crowded | Small-screen controls can be obscured or hard to scan | Use one overlay manager, explicit safe-area layout, and simplified navigation groups |
| P2 | CI does not validate Supabase/RLS/Edge Functions and lint currently fails on generated Android output | Regressions can merge without security or delivery coverage | Repair lint scope and add migration, Edge Function, RLS adversarial, and non-skipped E2E tests |

## 1. APK and mobile frontend audit

### 1.1 Why the APK feels incomplete

The native shell is configured to load the live website’s `/mobile` route rather than bundling a complete mobile application. This gives the business an important benefit: catalog and content changes can appear after the website deploys. It also creates several weaknesses. The APK depends on network availability, has no offline catalog or retry state, and cannot receive native fixes simply because the website changed.

The current mobile shell exposes four primary tabs: Home, Vehicles, Parts, and Account. Offers, Support, Orders, and other important tasks are secondary routes. A premium commerce application should make the primary customer jobs obvious: browse, search, save, request a quote, track a request/order, and contact support. The current navigation gives Account the same prominence as catalog areas while leaving offers, support, and order status less discoverable.

### 1.2 The 24-unit limitation

The mobile catalog queries use fixed limits for both inventory types:

- `components/mobile/mobile-catalog.tsx:28-32` applies `.limit(24)` to vehicles and parts.
- `components/mobile/mobile-catalog.tsx:40-45` filters only the returned array in the browser.
- `components/mobile/mobile-catalog.tsx:54` exposes the loaded array length as the available count.

This means a search for an item outside the first 24 records cannot find it. The displayed number is also not a total inventory count. It is only the number of records in the current capped response.

**Required fix:** move search and filtering into the Supabase query, add stable ordering, use cursor or range pagination, return `hasMore`, and expose a truthful “showing X of more” state. Search should query the full inventory rather than filtering a partial first page.

### 1.3 Missing ecommerce capabilities

The product detail surface currently presents an image, description, specifications, price, and `MobileInquiryForm`. The form inserts a row into `inquiries`; it does not create a reservation, quote, cart item, order, payment request, freight estimate, or customer task.

The following customer capabilities are missing or incomplete in the APK:

- Account-synchronized favorites and saved vehicles/parts.
- A real cart or quote shortlist with item quantities and review.
- Reservation creation and reservation status.
- Destination, shipping, freight, and incoterm capture.
- Structured vehicle or part purchase requests.
- Payment/deposit or payment-proof flow.
- Order or request timeline.
- Offer-specific actions such as “Apply offer,” “Request this deal,” or “Reserve.”
- Support thread history inside the app.
- Readable invoice detail and document actions.
- Notification settings and visible notification registration state.
- Offline, retry, stale-data, and network-error states.

The app should not be described as a complete ecommerce APK until these workflows exist. Inquiry submission is a valid first conversion step, but it should be the fallback path rather than the entire commerce model.

### 1.4 Route and auth risks

The native auth flow uses `ansha://auth/callback?next=/mobile/account`, while `docs/Mobile.md` contains a conflicting `/portal/account` contract. The callback route itself has a useful safety boundary for `/portal/` and `/mobile/`, but the documented and implemented destinations should be unified.

Native push handling currently assigns `notification.data.url` directly. Without a strict allowlist, a notification can route to a legacy website path, an admin route, or an external URL. The APK should translate supported destinations into `/mobile` routes and show a safe in-app fallback for unknown destinations.

### 1.5 Mobile visual and accessibility gaps

The current visual language is clean but too close to a basic responsive website. It lacks the depth expected from a premium app: stronger hierarchy between discovery and conversion, richer inventory cards, clear availability and trust signals, more deliberate loading states, polished empty/error screens, and a consistent action hierarchy.

Specific issues include:

- Two-column catalog cards at all mobile widths, which can become cramped at 320–375px.
- Inquiry contact fields forced into two columns.
- Placeholder-only form labeling.
- Icon-only carousel controls without accessible names.
- Low-opacity text used for important metadata and empty-state copy.
- A “Refresh catalog” link that only navigates to the same route and does not refetch.
- No reduced-motion or large-text validation evidence.
- No visible notification settings/status surface.
- No route-aware protection for unsaved inquiry forms when pressing Android back.

The premium redesign should use a clear visual system: one primary red action, one dark trust/navigation surface, lighter neutral content surfaces, larger touch targets, stronger product imagery, and a consistent card structure that separates price, availability, specifications, and the main action.

## 2. APK release and update audit

### 2.1 Current release status

The current artifact is explicitly documented as a debug APK for testing in `docs/Mobile.md:147-149`. The Android configuration shows:

- `android/app/build.gradle:7-11`: `applicationId com.anshatrading.app`, `versionCode 1`, `versionName 1.0`.
- `android/app/build.gradle:19-23`: minification disabled.
- `AndroidManifest.xml:4-10`: backup is enabled.
- `AndroidManifest.xml:44-47`: only basic network permissions are declared in the inspected section.

There is no visible production release signing configuration or automated versioning policy in the inspected repository.

**Recommendation:** do not distribute this artifact as the final public release. Create a signed release build with a keystore strategy, Play App Signing or controlled signed APK distribution, version automation, release notes, checksum publication, and a clean release verification job.

### 2.2 Update strategy

The remote WebView approach allows website UI and data changes to appear without reinstalling the APK. It does not update native code. Notification plugins, permissions, Android back handling, splash behavior, native security fixes, and Capacitor upgrades still require a new binary.

Choose one of these strategies:

1. **Google Play distribution**, preferred for reliable version management and Android in-app updates.
2. **Signed direct APK distribution**, with an in-app version check, a trusted download URL, checksum/signature verification, clear release notes, rollback support, and an update prompt.
3. A staged combination: direct APK for testing and Play Store for production.

The current `/download` page should not advertise the debug artifact as the final production app.

## 3. Public website audit

### 3.1 Strengths

The public website has a broad catalog, shared image abstractions, responsive navigation, PWA support, language switching, customer lists, inquiry surfaces, and a working production deployment. The latest Vercel production deployment is `READY` and is connected to the merged `main` commit for PR #56. The deployed `/download` page and `/downloads/ansha-trading-mobile.apk` both returned HTTP 200 during the audit.

Vercel grouped production logs for the inspected seven-day window showed 913 responses with status 200, 80 responses with status 304, and 29 responses with status 307 among the returned top groups. Vercel reported no grouped runtime errors in the selected seven-day range.

### 3.2 Website conversion gap

The public cart is currently an inquiry shortlist backed by browser `localStorage`. The populated state routes users toward WhatsApp rather than a structured quote or order flow. Favorites and cart intent can therefore fragment across devices and browsers. The website does not yet capture a complete export-ready request with destination, quantity, incoterm, shipping needs, and preferred contact channel.

The website and APK should share one clear conversion model. A good intermediate model is a **Request a quote** workflow rather than pretending to provide checkout before payment, shipping, and fulfillment logic are ready.

### 3.3 Responsive and visual gaps

The public layout mounts several fixed surfaces at once: the bottom navigation, install prompt, header drawer, and global chat. The layout reserves only limited mobile bottom padding, so short-height devices may experience overlay collisions with form submission buttons and catalog content.

The desktop header contains a utility strip, market strip, category/deals row, a long primary navigation set, and a quote action. The mobile drawer duplicates much of the taxonomy. This makes navigation feel dense and increases the cost of finding the next action.

The smallest catalog breakpoint uses two columns while cards contain image, metadata, pricing, favorites, cart, WhatsApp, and view actions. The experience is likely cramped on compact phones. The public visual system also mixes semantic tokens with hard-coded values such as `#101114`, `#f4f6f8`, and `#d21e1e`, which makes theme and surface consistency harder to maintain.

The PWA install prompt and native APK download page currently use “app” language for different products. The website should explain the distinction clearly:

- Browser/PWA: install from the browser, no APK, browser notification behavior.
- Native APK: Android-only, native notification permissions, direct APK or Play Store update behavior.

## 4. Admin UI and operations audit

### 4.1 Strengths

The admin site has substantial operational coverage across inventory, imports, offers, invoices, reservations, reports, remittances, support, notifications, and customer operations. The route proxy applies role-specific allowlists, and the admin shell filters navigation by role. Recipient-scoped RLS for admin notifications and realtime publication are positive foundations.

### 4.2 High-risk workflows

**Bulk imports.** The import interface previews only a limited sample before enabling the full import. There is no sufficiently strong dry-run, row-level duplicate/overwrite review, failed-row export, resumable job view, or rollback/cleanup path. The image ZIP importer writes storage and database records sequentially, so partial failures can leave orphaned files or incomplete records.

**Offers.** Offers publish immediately. There is no draft, preview, review, scheduled publish, archive/unpublish, or reversible state transition. Delete uses a native confirmation dialog rather than a structured impact review.

**Remittances.** The remittance page contains a visible comment that date filters are ignored because the underlying `remit_date` column does not exist. A visible filter that does not affect the query is an operational correctness problem. The filter should be removed or implemented against a real persisted field.

**Dashboard and reports.** Several data-heavy screens do not clearly distinguish failed data from zero data, and some loads can leave operators with a spinner or partial state. Reports need explicit query failure, retry, filter summary, and “no data” states.

**Reservations.** Long independently scrollable selection lists lack sufficient search and filtering. Large inventories will be difficult to operate, and stale selections may fail at submission time without a useful recovery path.

### 4.3 Admin UI modernization direction

The admin site should become an operations workspace rather than a collection of pages. The highest-value improvements are:

- A universal command/search surface for vehicles, parts, customers, invoices, inquiries, and reservations.
- Standardized data grids with visible identifier/status/action columns on mobile.
- Shared empty, loading, failure, retry, and partial-success states.
- A consistent destructive-action component with impact summary and audit record.
- Draft/preview/publish states for all public content.
- Import jobs with progress, row-level errors, resumability, and downloadable remediation files.
- Clear role-based action explanations rather than simply hiding controls.
- Persistent audit history for offers, inventory movement, invoice allocation, and notification sends.

## 5. Supabase, auth, notification, and business-logic audit

### 5.1 Native FCM is not end-to-end

The native bridge registers an FCM token through `register_fcm_push_token`, but the inspected send functions implement Web Push fields and do not contain an FCM sender branch. Native records therefore enter the shared subscription table without a working native delivery path.

This is the most important logic gap because the UI can imply that notifications are enabled while delivery is not actually complete.

The implementation should use a platform-aware notification service:

- `platform = web`, `android`, or `ios`.
- Web Push sender reads only Web Push subscriptions.
- Android sender uses FCM HTTP v1 or a trusted provider.
- Each registration has authenticated owner/device identity where appropriate.
- Invalid tokens are removed or disabled after delivery failure.
- Users can opt in, opt out, and see current permission/registration state.
- Notification tap routes are same-origin and allowlisted.

### 5.2 Subscription ownership and access

The native registration RPC is callable by anonymous and authenticated clients and accepts arbitrary token values without ownership binding or rate limiting. The Web Push registration RPC can update the user association for an endpoint without proving endpoint ownership. The audit also found a legacy workspace-wide delete policy that remains broader than the intended owner-scoped model.

Subscriber tables contain sensitive endpoint and encryption-key material. Ordinary workspace clients should not receive the full values. Subscriber listing, test sends, deletion, and token lifecycle operations should be performed through narrowly authorized server or Edge Function paths with redacted metadata.

### 5.3 Authorization gaps

The Web Push sender checks for the existence of an `admin_profiles` row rather than requiring an active, permitted role. Offer table permissions are also broader than a marketing/admin-specific role model. UI route filtering is not enough; mutation authorization must be enforced by RLS, RPC checks, or server-side role checks.

### 5.4 CI and validation gap

The repository lint gate currently fails because generated Android output is being linted and references an unavailable `@typescript-eslint/no-unused-vars` rule/plugin. TypeScript passes, but the release gate is not healthy until generated build output is excluded or the matching dependency/configuration is corrected.

CI currently covers dependency installation, lint, typecheck, brand verification, and build. It does not reliably validate Supabase migrations, Edge Functions, RLS adversarial behavior, realtime publication, or non-skipped end-to-end workflows.

## 6. Vercel and deployment audit

The Vercel connector identified project `anshanew` with project ID `prj_T4lY4CHqnmMbgghiZskgXgWq1mAU`. The latest production deployment inspected was `READY`, connected to the ANSHA GitHub repository and the merged `main` commit for PR #56.

The production download route is currently live:

- `https://www.anshatradingco.com/download` returned HTTP 200.
- `https://www.anshatradingco.com/downloads/ansha-trading-mobile.apk` returned HTTP 200 with Android APK content type.
- Vercel reported no grouped runtime errors in the selected seven-day window.

This confirms deployment availability, not product completeness. The APK asset being live should be treated as a distribution risk until it is replaced with a signed release build and accompanied by a version/update policy.

## 7. Mobbin design-reference audit

The Mobbin connector was enabled in the session, but its screen and flow search tools require a paid Mobbin plan. No Mobbin reference screens were used as evidence and no design recommendation should be attributed to a specific Mobbin screen from this audit.

The premium redesign recommendations below are therefore based on the ANSHA source audit and established mobile commerce usability principles rather than copied references.

## 8. Recommended product roadmap

### Phase 0: Stabilize before public distribution

Do not promote the current debug APK as the final application. Fix the lint gate, create a signed release variant, set versioning, decide Play Store versus direct APK distribution, and add release smoke tests. Fix native FCM delivery and secure token ownership before advertising push notifications.

### Phase 1: Correct discovery and navigation

Replace the 24-record cap with server-side search and pagination. Add truthful result counts, load-more behavior, retry/error states, and a real refresh action. Rework the mobile shell around Home, Browse, Saved, Requests, and Account, with Offers and Support discoverable from the relevant task surfaces.

### Phase 2: Premium visual redesign

Redesign the mobile home page around a strong hero, search-first discovery, trust signals, featured inventory, saved searches, and current deals. Use larger product imagery, clearer price/availability hierarchy, fewer secondary actions per card, consistent pill/badge treatment, and a single primary action per screen. Add skeletons, empty states, offline states, and polished transitions.

### Phase 3: Real commerce workflow

Implement a structured quote/request cart that captures item, quantity, destination, shipping needs, incoterm, contact method, and notes. Add authenticated request history, reservation status, invoice detail, payment-proof actions, and support threads. Keep WhatsApp as an optional contact channel, not the only conversion path.

### Phase 4: Admin operational safety

Add import preflight and job tracking, row-level validation, duplicate policy, rollback/cleanup, offer drafts and previews, publish scheduling, archive/unpublish, consistent destructive dialogs, report failure states, searchable reservation selection, and audit history.

### Phase 5: Quality and observability

Add migration and RLS tests, Edge Function checks, notification delivery tests, Playwright smoke flows, runtime error monitoring, performance budgets, accessibility checks, and production release dashboards. Test at 320px, 360px, 390px, 430px, tablet, and desktop widths.

## 9. Acceptance criteria for a premium APK release

The APK should not be considered ready until all of the following are true:

- Inventory search can find records beyond the first 24 items.
- Product detail has a clear primary conversion action and a structured request/order path.
- Favorites and requests synchronize with the authenticated customer account.
- Push notification registration, delivery, opt-out, invalid-token cleanup, and tap routing are tested end to end.
- Auth callback and notification navigation cannot escape into unauthorized or legacy routes.
- A signed release APK/AAB has version automation and a documented update strategy.
- The APK has explicit loading, error, retry, offline, empty, and stale-data states.
- Forms have visible labels, accessible controls, sufficient contrast, and narrow-screen layouts.
- Admin imports, offers, reservations, invoice actions, and remittance filters accurately represent their effects.
- CI validates code, migrations, Edge Functions, RLS boundaries, and core customer/admin smoke paths.
- Public download messaging clearly distinguishes PWA from native APK behavior.

## References

[1]: https://github.com/afridisalesteampew252-crypto/ANSHA "ANSHA GitHub repository"
[2]: https://www.anshatradingco.com/download "ANSHA production APK download page"
[3]: https://www.anshatradingco.com/downloads/ansha-trading-mobile.apk "ANSHA production APK file"
[4]: https://vercel.com/afridisales-projects/anshanew "ANSHA Vercel project"
[5]: https://mobbin.com/pricing "Mobbin pricing and plan availability"

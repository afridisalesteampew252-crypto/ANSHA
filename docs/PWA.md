# PWA

Installable public catalog. Staff ERP and portal stay online-only.

App name: **Anshatradingco APP** (`app/manifest.ts` + Apple web-app title).

## Current (shipped)

- Cache bucket in `public/sw.js` — precaches public shell (`/`, `/offline`, `/favicon.ico`, `/icons/favicon-48.png`, PWA icons). Version bump when icons change so clients refresh.
- Never caches `/admin`, `/api`, `/portal`, `/auth`, or `/verify/*`.
- Offline navigations fall back to `/offline`.
- **Update available — Refresh** banner when a new service worker is waiting (`SKIP_WAITING`).
- Install UX: sticky banner, header/footer **Install app**, iOS “Add to Home Screen” hints when `beforeinstallprompt` is unavailable.
- Web Push opt-in (`components/pwa/push-opt-in.tsx`) for deals / insights topics → `push_subscriptions`.
- Staff send via Edge `send-web-push` (Deno `@negrel/webpush`). Requires Edge secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — must be real URL-safe base64 matching Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (no `…` placeholders).
- Brand icons / favicon regenerate via `scripts/generate-brand-icons.mjs` → `/favicon.ico`, `/icons/*`, and default OG `/images/og-default.jpg` (also used by Search / social share — see `docs/Deployment.md` SEO section).

Files: `public/sw.js`, `components/pwa/*`, `app/manifest.ts`, `app/api` excluded from SW cache.

Admin Marketing → **PWA subscribers** (`/admin/subscribers`) lists opt-ins.

## Later ideas

Background sync for quote requests, richer offline catalog snapshots, Web Share Target for RFQs, periodic `registration.update()` on tab focus, richer topic preferences once campaigns mature.

See also `docs/Mobile.md` for the Capacitor store shell and `docs/Deployment.md` for VAPID setup.

# PWA

Installable public catalog (Phase 22). Staff ERP and portal stay online-only.

## v1.2.0 (shipped)

- Cache bucket `ansha-pwa-v1.2.0` — precaches public shell only: `/`, `/offline`, and icons.
- Never caches `/admin`, `/api`, `/portal`, `/auth`, or `/verify/*`.
- Offline navigations fall back to `/offline`.
- **Update available — Refresh** banner when a new service worker is waiting; user-triggered reload via `SKIP_WAITING`.

Files: `public/sw.js`, `components/pwa/register-service-worker.tsx`, `components/pwa/install-prompt.tsx`, `app/manifest.ts`.

## v1.3 (ideas)

Background sync for quote requests, richer offline catalog pages (parts/vehicles list snapshots), optional Web Share Target for inbound RFQs, and periodic `registration.update()` checks on tab focus. Push opt-in (`components/pwa/push-opt-in.tsx`) may get topic preferences once campaign tooling matures.

See also `docs/Mobile.md` for the Capacitor store shell.

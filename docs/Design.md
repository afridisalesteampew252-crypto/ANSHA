# Design

## Current system

Public and admin share Tailwind tokens, shadcn/Radix components, Inter, and `next-themes` (default light, persisted light/dark/system). Brand color language is black/white/ANSHA red as described in `docs/phase-13-public-redesign.md`. Logo: `/images/ansha-logo-transparent.webp`.

Do not replace the design system in one pass. Extend existing `components/ui` and public/admin components.

## Public

- Three-level desktop header, manufacturer directory, catalog cards, uncropped galleries
- Mobile bottom nav: Home, Parts, Vehicles, Search, WhatsApp
- Honest empty states (Phase 13); do not invent inventory in UI
- Banking page is reachable but noindex
- Admin login is linked from the public header (“Staff login”)

## Admin

- Collapsible desktop sidebar, mobile drawer, sticky titles
- Quick add: part, vehicle, invoice, remittance, import
- Dense tables and dialogs; charts on dashboard (recharts)
- Print-oriented invoice layout with QR and banking blocks

## Consistency rules

- Use `cn()` and existing Button/Input/Card/Table primitives
- Prefer existing spacing scale and `container-page` on public pages
- Keep destructive actions behind confirmation where the UI already does (part delete, remittance delete)
- Forms: current mix of controlled inputs and some react-hook-form; do not introduce a second UI kit

## Accessibility / motion

Phase 13 called for reduced-motion and keyboard-focus support on the public catalog. Continue that on new public work. Admin mobile is functional, not a native-app layout.

## Future

Public site and ERP may diverge in density while sharing tokens. PWA chrome (install prompt + push opt-in + standalone display) is live for the public catalog (Phases 22–24). Customer portal chrome is a light `/portal` shell (Phase 23). Capacitor shell MVP loads the public URL in a native WebView (Phase 44); see `docs/Mobile.md`.

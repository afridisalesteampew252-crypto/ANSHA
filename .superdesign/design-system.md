# ANSHA Trading Co. — Redesign Design System (2026) · v4 Craft Pass

> Target visual system for the public Next.js site redesign. Preserves brand identity (ANSHA / anshatradingco) while elevating to a premium B2B Japanese/export vehicle marketplace. **Export Yard Editorial — craft-elevated** (not a cosmetic restyle of the denser marketing stack).

## Theme policy — ONE fixed theme only

- **Single product theme.** No light/dark modes, no `ThemeToggle`, no dual token sets, no `.dark` variants.
- Fixed look: **Export Yard Editorial v4** — deeper atmospheric canvas, ink section bands, steel daylight, brand red signal. Brand-first export energy — not sterile white, not purple-AI, not cream+terracotta.
- Implementation later: remove theme toggle; ship one CSS variable set only.

### CRITICAL — Light header / logo ground (non-negotiable)

- ANSHA logo wordmark uses **dark writing**. It must **never** sit on a dark nav/header background.
- **Sticky / top header + logo area = LIGHT always:** paper `#ffffff` or frost `#f7f8fa`. Optional light frosted bar over heroes only if logo stays clearly legible.
- Do **not** use ink (`#171415`) or dark photo as header chrome behind the logo.
- Full-bleed dark/photo heroes sit **below** the light header.
- Nav text: ink / steel; brand red for active + primary CTA only.
- Header may stay near-white; **page body must feel atmospheric** — color in canvas, bands, accents, chips, CTAs.

## Product context

- **Company:** ANSHA Trading Co. LLC-FZ — Dubai-based global exporter
- **Catalog:** Japanese/export vehicles, automotive parts, heavy machinery & trucks
- **Jobs:** Browse published stock → evaluate specs/photos → request quote / WhatsApp → export shipping
- **Audience:** Overseas buyers, dealers, fleet/machinery — trust + clarity over consumer flash
- **Live:** https://www.anshatradingco.com
- **Brand:** `#d21e1e`, `#c35252`, `#828789`, `#171415`, `#cdbfc1`
- **Routes:** `/`, `/vehicles`, `/vehicles/[slug]`, `/parts`, `/parts/[slug]`, `/machinery`, `/markets/[code]`, `/contact`, `/offers`, `/categories`

## Brand DNA — richer controlled color (v4)

| Role | Hex / value | Notes |
|------|-------------|-------|
| Brand red | `#d21e1e` | Primary CTA / active chip / signal — keep strong |
| Soft red | `#c35252` | Hover / secondary accent |
| Red wash | `rgba(210, 30, 30, 0.10)`–`0.18` | Stronger atmospheric tint than v3 |
| Steel | `#828789` | Meta labels, borders |
| Steel deep | `#5c6366` | Secondary text on mist |
| Ink | `#171415` | Heroes / dark bands — **never** header behind logo |
| Ink deep | `#0b0c0f` | Hero radial base |
| Mist | `#cdbfc1` | Cool surface tint |
| Mist wash | `rgba(205, 191, 193, 0.40)` | Inter-section band |
| Canvas | `#d8dee6` | Deeper cool page bg (v4: less washed-out than `#e4e8ed`) |
| Canvas deep | `#c8d0db` | Filter rail / tooling ground |
| Steel-sky | `#b8c6d4` | Cool daylight gradient stop |
| Paper | `#ffffff` | Cards / forms / **sticky header only** |
| Ink haze | `linear-gradient(180deg, #0b0c0f 0%, #171415 45%, #2a2224 100%)` | Dark hero depth |
| Yard dawn | `linear-gradient(165deg, #d8dee6 0%, #c8d0db 38%, rgba(210,30,30,0.12) 72%, #b8c6d4 100%)` | Page atmospheric ground |
| Signal band | `linear-gradient(90deg, rgba(210,30,30,0.16), rgba(205,191,193,0.28), rgba(184,198,212,0.45))` | Slim accent / deals cue |
| Section ink band | `linear-gradient(135deg, #171415 0%, #1f1819 55%, #2a1a1c 100%)` | Markets / inquiry CTA bands |

**Color application (v4 craft)**

1. **Body:** `Canvas` + `Yard dawn` — never flat `#ffffff` full-page.
2. **Section rhythm:** Alternate full-bleed ink/photo → mist-wash → canvas-deep tooling → ink inquiry band. Scrolling must feel colored.
3. **Accent moments:** Brand-red primary CTAs, active filters, selected market chips, focus rings, Inquire emphasis. Soft red wash behind key CTA clusters.
4. **Chips:** Idle = mist / red-wash + steel border; active = brand red fill + white text.
5. **Cards:** Paper OK for inventory/forms — always on tinted canvas. Prefer **fewer, larger** inventory rows over dense card grids where possible.
6. **Header exception:** Paper / `#f7f8fa` only in sticky logo chrome.

**Avoid:** purple/indigo glow, cream+terracotta, broadsheet/newspaper density, Inter/Roboto/Arial/system as marketing faces, hero stickers/badges/overlays, fake awards/prices/legal claims, flat all-white shells, icon-stat SaaS strips in the first viewport.

## Visual direction — "Export Yard Editorial" · v4 craft

Industrial-premium, photography-led, **brand-first**. Bonded yard atmosphere + Dubai export desk. One composition per first viewport. Full-bleed real vehicle atmosphere on landing. Cards only when choosing/filtering inventory.

### Brand-first hero (homepage)

First viewport below light header must read as **one composition**:

1. **Brand dominant** — oversized display word **ANSHA** (Outfit 800–900) as the hero-level brand signal (logo remains in light header; do not hide brand behind a tiny eyebrow).
2. **One headline** only (export-yard promise, not a feature list).
3. **One short supporting sentence**.
4. **One CTA group** (primary Request quote / Browse stock + secondary WhatsApp).
5. **Full-bleed vehicle/yard photography** edge-to-edge under the light header — atmospheric gradient scrim for type legibility. No inset media cards, no floating badges, no stats strip in hero.

### Typography (more expressive)

| Role | Family | Fallback | Usage |
|------|--------|----------|-------|
| Brand / Display | **Outfit** | `Outfit, "Segoe UI", sans-serif` | Hero ANSHA, H1/H2 — weight 700–900, tight tracking |
| Body / UI | **Plus Jakarta Sans** | `"Plus Jakarta Sans", "Segoe UI", sans-serif` | Nav, body, forms — 400–600 |
| Specs / IDs | **JetBrains Mono** | `"JetBrains Mono", ui-monospace, monospace` | Chassis, OEM, stock |

**Scale rhythm (desktop)**

| Token | Size / line / tracking |
|-------|------------------------|
| Brand display (hero ANSHA) | 64–88px / 0.92 / -0.05em |
| H1 headline | 36–44px / 1.08 / -0.03em |
| H2 section | 28–34px / 1.15 / -0.02em |
| Body | 15–16px / 1.55 |
| Meta / labels | 11–12px uppercase / 0.16–0.22em |

**Mobile scale:** Brand display 40–52; H1 28–32; section pad 40–48; tighter filter chrome.

**Never use Inter, Roboto, Arial, or system-ui as the marketing face.**

### Spacing rhythm (consistent 8px)

- Base unit: **8**
- Section vertical: **80 / 96** desktop · **48 / 64** mobile
- Content max: **1200–1280** (`.container-page`); hero full-bleed outside container
- Gutter: **16 / 24 / 32**
- Stack gaps: 8 / 16 / 24 / 32 / 48 — avoid arbitrary 18/22/26
- Radius: **12** controls · **16–20** inventory media · pills for primary CTA only

### Elevation

- Border + soft cool shadow; soft red-tinged CTA hover `rgba(210,30,30,0.22)`
- Inventory: 1px steel/25; hover = 2–4px lift + red border hint + image scale
- No neon / purple glow

### Motion notes (2–3 intentional — implement later)

1. **Hero entrance:** staggered fade-up — brand display (0ms) → headline (80ms) → sentence (140ms) → CTA group (200ms); 520ms ease-out; respect `prefers-reduced-motion`.
2. **Inventory hover / focus:** media `scale(1.04)` 280ms + 1px brand-red border fade; list-row highlight soft red-wash.
3. **Detail sticky inquiry (mobile):** after scroll past gallery fold, bottom bar slides up 240ms with Request quote + WhatsApp; dismiss/hide when near footer.

Optional micro: market chip active fill crossfade 160ms.

## Information architecture

**Primary nav (6):** Vehicles · Machinery · Parts · Markets · Deals · Contact  
Collapse About + Insights to footer. Global search (OEM / chassis / make / model). Favorites + Inquiry cart utilities. Persistent WhatsApp.

**Trust (every catalog surface):** “Published ANSHA inventory” + stock origin + clear inquiry CTAs — no invented certifications or awards.

## Page patterns (v4)

### 1. Homepage `/`
- Light sticky header (logo dark wordmark). Slim utility strip optional (no logo there). Prefer **compact header** (logo + search + utilities + one nav row) — avoid four stacked chrome bands when possible; market chips can live below fold or as a slim signal strip.
- **Hero:** full-bleed yard/vehicle photo + brand display ANSHA + one headline + one sentence + one CTA group.
- Below: signal deals cue → catalog finder on canvas-deep → **featured stock as larger media rows / 2-col max** (not 4-col card spam) → machinery → parts → export markets (mist/red chips) → ink inquiry band. One job per section.

### 2. Vehicles listing `/vehicles`
- Page ground: yard-dawn / canvas-deep — not white.
- **Filters first:** sticky left rail (desktop) with clear Make / Year / Origin / Type; active = brand red. Mobile: bottom or top filter sheet + result count in red.
- **Results:** prefer hybrid — primary featured as large photo row; secondary as compact list/grid (2-col desktop). Less card spam. Strong **Inquire / Request quote** on each unit (brand red), not buried.
- Empty/loading: calm mist band, not blank white.

### 3. Vehicle detail `/vehicles/[slug]`
- Gallery dominant (large photo plane). Specs on mist/canvas band with mono stock IDs.
- **Sticky inquiry:** brand-red Request quote + WhatsApp + save — always visible desktop (side) / mobile (bottom bar after fold).
- Incoterms strip with soft red wash. No white-on-white around gallery.

### 4. Parts hub `/parts`
- Finder-first on canvas-deep. OEM chips red-active. Request-part fallback with brand-red CTA. Sparse results density.

### 5. Markets `/markets/[code]` (+ home strip)
- Destination-led. Mist idle / brand-red active chips. Ink or steel-sky hero. Link into filtered stock. No invented market claims.

### 6. Contact / inquiry `/contact`
- Form on paper card over yard-dawn. Dual path: form + WhatsApp (green OK for WA only). Prefill from vehicle/part. Brand-red submit.

## Component rules

- **Logo invariant:** Real Brand Asset `public-images-ansha-logo-transparent.webp` in every logo position — never initials/emoji/fake SVG/text-only marks. Header logo on **light** ground only.
- **Buttons:** Brand red filled (primary), ink outline (secondary), ghost tertiary.
- **Cards:** Only for selectable inventory / form containers; contrast against tinted ground. Prefer fewer larger units.
- **Chips:** Mist/red-wash idle; brand red active.
- **Copy:** Vehicles, parts, machinery, export — **no** awards, fake “#1”, invented prices, or legal claims.

## Mobile density (Home + Listing variants)

When designing `--device mobile`:

- Collapse header to logo + search icon + menu + red Inquire.
- Hero: brand display still dominant; shorter supporting line; stacked CTAs full-bleed width.
- Listing: filter trigger + count sticky; results as single-column large photo rows with inline Inquire.
- Touch targets ≥ 44px; section pads 48–64.

## Mapping to existing code

| Design screen | Route / files |
|---------------|---------------|
| Home | `app/(public)/home-page-client.tsx` |
| Vehicles listing | `vehicles-catalog.tsx` |
| Vehicle detail | `vehicle-detail-client.tsx` |
| Parts | `app/(public)/parts/*` |
| Markets | `export-markets-strip.tsx`, `markets/[code]` |
| Contact | `contact/page.tsx`, `inquiry-dialog.tsx` |
| Shell | `site-header.tsx`, `site-footer.tsx` |
| Tokens | `app/globals.css` |

## Style fidelity constraint

Use ONLY fonts, colors, spacing, and components in this design system. No Inter/Roboto/Arial, no purple gradients, no cream+terracotta, no flat-white page shells. Light header + real ANSHA logo + brand red `#d21e1e` accents are mandatory on every screen.

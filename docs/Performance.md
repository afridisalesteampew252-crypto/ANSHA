# Performance guardrails

## Current instrumentation

- Vercel Analytics and Speed Insights are mounted in `app/layout.tsx`.
- Public list queries use explicit card field lists; article body content is never sent to Home or Insights cards.
- Home uses small serializable DTOs for categories, parts, vehicles, machinery, and posts.
- Insights server-renders its initial nine articles and hydrates client filtering from that payload.
- Product JSON-LD is assembled in server pages, not client components.
- Admin vehicle and parts stock screens load 200 enriched rows at a time.

## Bundle baseline

Run before adding a new dynamic library:

```bash
npm run analyze:bundle
```

Archive `.next/diagnostics/analyze` with the change or record the affected route's client size in the pull request. Compare Home, Insights, Parts, Vehicles, and Machinery routes.

## Core Web Vitals gate

Use Vercel Speed Insights production p75 data after enough traffic is available:

- LCP: good at or below 2.5 s
- INP: good at or below 200 ms
- CLS: good at or below 0.1

Do not add a chart, editor, carousel, or other dynamic library to public routes without recording the before/after bundle output and checking its effect on these p75 metrics.

# Performance guardrails

## Current instrumentation

- Vercel Analytics and Speed Insights are mounted in `app/layout.tsx`.
- Public list queries use explicit card field lists; article body content is never sent to Home or Insights cards.
- Home uses small serializable DTOs for categories, parts, vehicles, machinery, and posts.
- Insights server-renders its initial nine articles and hydrates client filtering from that payload.
- Product JSON-LD is assembled in server pages, not client components.
- Admin vehicle and parts stock screens load 200 enriched rows at a time.

## Supabase catalog query optimization — 2026-09-29

The Supabase `pg_stat_statements` snapshot highlighted repeated published vehicle and parts listings ordered by featured status and creation time. The listing tables are currently small, so the purpose is to avoid repeated sort work and keep the query shape efficient as inventory grows.

Migrations applied:

- `20260928221630_optimize_public_inventory_listing_indexes.sql`
- `20260928222037_make_public_listing_indexes_parameter_safe.sql`

The final indexes are `vehicles_public_listing_order_idx` and `parts_public_listing_order_idx`, each on `(is_published, stock_status, is_featured DESC, created_at DESC)`. A forced generic-plan `EXPLAIN EXECUTE` confirmed both parameterized queries use the matching index and no longer have a `Sort` or `Incremental Sort` node.

The earlier query statistics were cumulative from the 2026-09-09 reset, so they do not show a before/after result for the new indexes. Compare a fresh interval after normal traffic before claiming a measured latency reduction. Supabase's high-call `realtime.list_changes` statement is internal Realtime processing; do not change application subscriptions without evidence tying them to a specific app path.

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

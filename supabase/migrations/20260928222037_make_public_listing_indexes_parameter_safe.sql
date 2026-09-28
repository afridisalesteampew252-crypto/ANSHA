-- PostgREST may choose generic prepared-query plans, which cannot prove
-- that a parameterized is_published predicate matches a partial index.
drop index if exists public.vehicles_public_listing_order_idx;
drop index if exists public.parts_public_listing_order_idx;

create index vehicles_public_listing_order_idx
  on public.vehicles (is_published, stock_status, is_featured desc, created_at desc);

create index parts_public_listing_order_idx
  on public.parts (is_published, stock_status, is_featured desc, created_at desc);

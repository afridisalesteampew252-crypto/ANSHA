-- Support the public inventory filters and featured-first ordering without sorting.
create index if not exists vehicles_public_listing_order_idx
  on public.vehicles (stock_status, is_featured desc, created_at desc)
  where is_published = true;

create index if not exists parts_public_listing_order_idx
  on public.parts (stock_status, is_featured desc, created_at desc)
  where is_published = true;

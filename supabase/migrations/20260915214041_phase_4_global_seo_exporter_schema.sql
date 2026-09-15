/* Phase 4: searchable global vehicle and parts exporter metadata. */

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS meta_title text,
  ADD COLUMN IF NOT EXISTS meta_description text,
  ADD COLUMN IF NOT EXISTS search_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS manufacturer_part_number text,
  ADD COLUMN IF NOT EXISTS interchange_numbers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS superseded_part_numbers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS export_markets text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS meta_title text,
  ADD COLUMN IF NOT EXISTS meta_description text,
  ADD COLUMN IF NOT EXISTS search_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS chassis_number text,
  ADD COLUMN IF NOT EXISTS stock_number text,
  ADD COLUMN IF NOT EXISTS destination_markets text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS shipping_methods text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS meta_title text,
  ADD COLUMN IF NOT EXISTS meta_description text;

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_chassis_number_unique_idx
  ON public.vehicles (lower(chassis_number))
  WHERE chassis_number IS NOT NULL AND btrim(chassis_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_stock_number_unique_idx
  ON public.vehicles (lower(stock_number))
  WHERE stock_number IS NOT NULL AND btrim(stock_number) <> '';

CREATE INDEX IF NOT EXISTS parts_published_updated_idx
  ON public.parts (updated_at DESC) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS vehicles_published_updated_idx
  ON public.vehicles (updated_at DESC) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS parts_part_number_trgm_idx
  ON public.parts USING gin (lower(part_number) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS parts_oem_number_trgm_idx
  ON public.parts USING gin (lower(oem_number) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS parts_name_trgm_idx
  ON public.parts USING gin (lower(name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vehicles_make_trgm_idx
  ON public.vehicles USING gin (lower(make) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vehicles_model_trgm_idx
  ON public.vehicles USING gin (lower(model) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vehicles_chassis_code_trgm_idx
  ON public.vehicles USING gin (lower(chassis_code) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS part_compatibility_vehicle_lookup_idx
  ON public.part_compatibility (lower(make), lower(model), year_from, year_to);
CREATE INDEX IF NOT EXISTS parts_search_keywords_idx
  ON public.parts USING gin (search_keywords);
CREATE INDEX IF NOT EXISTS vehicles_search_keywords_idx
  ON public.vehicles USING gin (search_keywords);

COMMENT ON COLUMN public.vehicles.chassis_number IS 'Full unique chassis/VIN identifier used for imports and ZIP image matching.';
COMMENT ON COLUMN public.parts.interchange_numbers IS 'Equivalent cross-brand or aftermarket part numbers used for buyer search.';

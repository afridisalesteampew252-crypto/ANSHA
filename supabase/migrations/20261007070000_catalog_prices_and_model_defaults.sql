-- Restore pricing guarantees overwritten by the later September model-volume migration.
CREATE OR REPLACE FUNCTION public.bulk_update_vehicle_prices(
  vehicle_ids uuid[], price_field text, adjustment_mode text, adjustment_value numeric
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Not authorized to update vehicle prices';
  END IF;
  IF coalesce(cardinality(vehicle_ids), 0) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Select between 1 and 5000 vehicles';
  END IF;
  IF price_field IS NULL OR price_field NOT IN ('price_fob', 'price_cf', 'price_cif') THEN
    RAISE EXCEPTION 'Unsupported vehicle price field';
  END IF;
  IF adjustment_mode IS NULL OR adjustment_mode NOT IN ('set', 'increase_percent', 'decrease_percent') THEN
    RAISE EXCEPTION 'Unsupported price adjustment';
  END IF;
  IF adjustment_value IS NULL OR adjustment_value < 0 OR adjustment_value::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Price adjustment must be a finite value zero or greater';
  END IF;

  EXECUTE format(
    'UPDATE public.vehicles AS vehicle
     SET %1$I = changed.amount,
         price = CASE WHEN $4 THEN changed.amount ELSE vehicle.price END,
         show_price = coalesce(vehicle.show_price, false) OR coalesce(changed.amount, 0) > 0,
         updated_at = now()
     FROM (
       SELECT id, CASE
         WHEN $2 = ''set'' THEN $1
         WHEN %1$I IS NULL THEN NULL
         WHEN $2 = ''increase_percent'' THEN round(%1$I * (1 + $1 / 100), 2)
         ELSE round(%1$I * greatest(0, 1 - least($1, 100) / 100), 2)
       END AS amount
       FROM public.vehicles WHERE id = ANY($3)
     ) AS changed
     WHERE vehicle.id = changed.id',
    price_field
  ) USING adjustment_value, adjustment_mode, vehicle_ids, price_field = 'price_fob';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_vehicle_prices(uuid[], text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_vehicle_prices(uuid[], text, text, numeric) TO authenticated;

-- An invoker trigger applies the same defaults for manual, spreadsheet and future API uploads.
-- RLS on vehicle_model_specs remains in force; this function does not elevate the caller.
CREATE OR REPLACE FUNCTION public.apply_vehicle_model_volume_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.make IS DISTINCT FROM OLD.make OR NEW.model IS DISTINCT FROM OLD.model)
       AND NEW.volume_m3 IS NOT DISTINCT FROM OLD.volume_m3 THEN
      NEW.volume_m3 := NULL;
    END IF;
  END IF;
  IF NEW.volume_m3 IS NULL THEN
    SELECT spec.volume_m3 INTO NEW.volume_m3
    FROM public.vehicle_model_specs AS spec
    WHERE spec.normalized_make = btrim(regexp_replace(lower(NEW.make), '[^a-z0-9]+', ' ', 'g'))
      AND spec.normalized_model = btrim(regexp_replace(lower(NEW.model), '[^a-z0-9]+', ' ', 'g'))
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_vehicle_model_volume_default() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS apply_vehicle_model_volume_default ON public.vehicles;
CREATE TRIGGER apply_vehicle_model_volume_default
BEFORE INSERT OR UPDATE OF make, model, volume_m3 ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.apply_vehicle_model_volume_default();

-- Existing country selections retain their meaning while matching the uppercase page code.
UPDATE public.vehicles AS vehicle
SET destination_markets = normalized.codes
FROM (
  SELECT id, ARRAY(
    SELECT DISTINCT upper(btrim(code)) FROM unnest(destination_markets) AS code
    WHERE btrim(code) ~ '^[A-Za-z]{2}$' ORDER BY upper(btrim(code))
  ) AS codes
  FROM public.vehicles
) AS normalized
WHERE vehicle.id = normalized.id AND vehicle.destination_markets IS DISTINCT FROM normalized.codes;

CREATE OR REPLACE FUNCTION public.normalize_vehicle_destination_markets()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.destination_markets := ARRAY(
    SELECT DISTINCT upper(btrim(code)) FROM unnest(NEW.destination_markets) AS code
    WHERE btrim(code) ~ '^[A-Za-z]{2}$' ORDER BY upper(btrim(code))
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_vehicle_destination_markets() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS normalize_vehicle_destination_markets ON public.vehicles;
CREATE TRIGGER normalize_vehicle_destination_markets
BEFORE INSERT OR UPDATE OF destination_markets ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.normalize_vehicle_destination_markets();

-- Keep the legacy list-price consumers (sorts, deal previews) aligned with FOB for every write path.
CREATE OR REPLACE FUNCTION public.sync_vehicle_fob_listing_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.price_fob IS NOT NULL THEN
    NEW.price := NEW.price_fob;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.price_fob IS NOT NULL AND NEW.price IS NOT DISTINCT FROM OLD.price THEN
      NEW.price := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_vehicle_fob_listing_price() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_vehicle_fob_listing_price ON public.vehicles;
CREATE TRIGGER sync_vehicle_fob_listing_price
BEFORE INSERT OR UPDATE OF price_fob, price ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.sync_vehicle_fob_listing_price();

UPDATE public.vehicles SET price = price_fob
WHERE price_fob IS NOT NULL AND price IS DISTINCT FROM price_fob;

-- A public projection of the already-public tags allows case-insensitive substring searches.
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS catalog_search_text text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION public.sync_part_catalog_search_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.catalog_search_text := array_to_string(coalesce(NEW.search_keywords, ARRAY[]::text[]), ' ');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_part_catalog_search_text() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_part_catalog_search_text ON public.parts;
CREATE TRIGGER sync_part_catalog_search_text
BEFORE INSERT OR UPDATE OF search_keywords, catalog_search_text ON public.parts
FOR EACH ROW EXECUTE FUNCTION public.sync_part_catalog_search_text();
UPDATE public.parts SET catalog_search_text = array_to_string(coalesce(search_keywords, ARRAY[]::text[]), ' ')
WHERE catalog_search_text IS DISTINCT FROM array_to_string(coalesce(search_keywords, ARRAY[]::text[]), ' ');
GRANT SELECT (catalog_search_text) ON public.parts TO anon;

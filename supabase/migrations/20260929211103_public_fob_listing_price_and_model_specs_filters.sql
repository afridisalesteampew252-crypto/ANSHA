-- Keep public listing price aligned with FOB, show available export terms, and normalize saved model keys.
DELETE FROM public.vehicle_model_specs
WHERE make = 'HONDA' AND model = 'CR V';

UPDATE public.vehicle_model_specs
SET volume_m3 = 14.297, updated_at = now()
WHERE make = 'HONDA' AND model = 'CR-V';

DELETE FROM public.vehicle_model_specs
WHERE make = 'TOYOTA' AND model = 'C HR';

WITH duplicate_specs AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY lower(make), btrim(regexp_replace(lower(model), '[^a-z0-9]+', ' ', 'g'))
           ORDER BY created_at, id
         ) AS row_number
  FROM public.vehicle_model_specs
)
DELETE FROM public.vehicle_model_specs AS specs
USING duplicate_specs
WHERE specs.id = duplicate_specs.id AND duplicate_specs.row_number > 1;

UPDATE public.vehicle_model_specs
SET normalized_make = btrim(regexp_replace(lower(make), '[^a-z0-9]+', ' ', 'g')),
    normalized_model = btrim(regexp_replace(lower(model), '[^a-z0-9]+', ' ', 'g')),
    updated_at = now()
WHERE normalized_make IS DISTINCT FROM btrim(regexp_replace(lower(make), '[^a-z0-9]+', ' ', 'g'))
   OR normalized_model IS DISTINCT FROM btrim(regexp_replace(lower(model), '[^a-z0-9]+', ' ', 'g'));

UPDATE public.vehicles
SET price = price_fob,
    show_price = true,
    updated_at = now()
WHERE coalesce(price_fob, 0) > 0
  AND (price IS DISTINCT FROM price_fob OR NOT coalesce(show_price, false));

UPDATE public.vehicles
SET show_price = true,
    updated_at = now()
WHERE NOT coalesce(show_price, false)
  AND (coalesce(price_cf, 0) > 0 OR coalesce(price_cif, 0) > 0);

CREATE OR REPLACE FUNCTION public.bulk_update_vehicle_prices(
  vehicle_ids uuid[],
  price_field text,
  adjustment_mode text,
  adjustment_value numeric
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
  IF coalesce(array_length(vehicle_ids, 1), 0) = 0 OR array_length(vehicle_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'Select between 1 and 5000 vehicles';
  END IF;
  IF price_field NOT IN ('price_fob', 'price_cf', 'price_cif') THEN
    RAISE EXCEPTION 'Unsupported vehicle price field';
  END IF;
  IF adjustment_mode NOT IN ('set', 'increase_percent', 'decrease_percent') THEN
    RAISE EXCEPTION 'Unsupported price adjustment';
  END IF;
  IF adjustment_value IS NULL OR adjustment_value < 0 THEN
    RAISE EXCEPTION 'Price adjustment must be zero or greater';
  END IF;

  IF price_field = 'price_fob' THEN
    IF adjustment_mode = 'set' THEN
      UPDATE public.vehicles
      SET price_fob = adjustment_value,
          price = adjustment_value,
          show_price = coalesce(show_price, false) OR adjustment_value > 0,
          updated_at = now()
      WHERE id = ANY(vehicle_ids);
    ELSIF adjustment_mode = 'increase_percent' THEN
      UPDATE public.vehicles
      SET price_fob = CASE WHEN price_fob IS NULL THEN NULL ELSE round(price_fob * (1 + adjustment_value / 100), 2) END,
          price = CASE WHEN price_fob IS NULL THEN NULL ELSE round(price_fob * (1 + adjustment_value / 100), 2) END,
          show_price = coalesce(show_price, false) OR
            coalesce(CASE WHEN price_fob IS NULL THEN NULL ELSE round(price_fob * (1 + adjustment_value / 100), 2) END, 0) > 0,
          updated_at = now()
      WHERE id = ANY(vehicle_ids);
    ELSE
      UPDATE public.vehicles
      SET price_fob = CASE WHEN price_fob IS NULL THEN NULL ELSE round(price_fob * greatest(0, 1 - least(adjustment_value, 100) / 100), 2) END,
          price = CASE WHEN price_fob IS NULL THEN NULL ELSE round(price_fob * greatest(0, 1 - least(adjustment_value, 100) / 100), 2) END,
          show_price = coalesce(show_price, false) OR
            coalesce(CASE WHEN price_fob IS NULL THEN NULL ELSE round(price_fob * greatest(0, 1 - least(adjustment_value, 100) / 100), 2) END, 0) > 0,
          updated_at = now()
      WHERE id = ANY(vehicle_ids);
    END IF;
  ELSIF adjustment_mode = 'set' THEN
    EXECUTE format(
      'UPDATE public.vehicles
       SET %1$I = $1,
           show_price = coalesce(show_price, false) OR ($1 > 0),
           updated_at = now()
       WHERE id = ANY($2)',
      price_field
    ) USING adjustment_value, vehicle_ids;
  ELSIF adjustment_mode = 'increase_percent' THEN
    EXECUTE format(
      'UPDATE public.vehicles
       SET %1$I = CASE WHEN %1$I IS NULL THEN NULL ELSE round(%1$I * (1 + $1 / 100), 2) END,
           show_price = coalesce(show_price, false) OR
             coalesce(CASE WHEN %1$I IS NULL THEN NULL ELSE round(%1$I * (1 + $1 / 100), 2) END, 0) > 0,
           updated_at = now()
       WHERE id = ANY($2)',
      price_field
    ) USING adjustment_value, vehicle_ids;
  ELSE
    EXECUTE format(
      'UPDATE public.vehicles
       SET %1$I = CASE WHEN %1$I IS NULL THEN NULL ELSE round(%1$I * greatest(0, 1 - $1 / 100), 2) END,
           show_price = coalesce(show_price, false) OR
             coalesce(CASE WHEN %1$I IS NULL THEN NULL ELSE round(%1$I * greatest(0, 1 - $1 / 100), 2) END, 0) > 0,
           updated_at = now()
       WHERE id = ANY($2)',
      price_field
    ) USING least(adjustment_value, 100), vehicle_ids;
  END IF;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_vehicle_prices(uuid[], text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_vehicle_prices(uuid[], text, text, numeric) TO authenticated;

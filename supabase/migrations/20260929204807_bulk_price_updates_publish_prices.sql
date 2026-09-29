-- Automatically publish vehicles when a bulk price update gives them a positive price.
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
  IF price_field NOT IN ('price', 'price_fob', 'price_cf', 'price_cif') THEN
    RAISE EXCEPTION 'Unsupported vehicle price field';
  END IF;
  IF adjustment_mode NOT IN ('set', 'increase_percent', 'decrease_percent') THEN
    RAISE EXCEPTION 'Unsupported price adjustment';
  END IF;
  IF adjustment_value IS NULL OR adjustment_value < 0 THEN
    RAISE EXCEPTION 'Price adjustment must be zero or greater';
  END IF;

  IF adjustment_mode = 'set' THEN
    EXECUTE format(
      'UPDATE public.vehicles
       SET %1$I = $1,
           show_price = show_price OR ($1 > 0),
           updated_at = now()
       WHERE id = ANY($2)',
      price_field
    ) USING adjustment_value, vehicle_ids;
  ELSIF adjustment_mode = 'increase_percent' THEN
    EXECUTE format(
      'UPDATE public.vehicles
       SET %1$I = CASE WHEN %1$I IS NULL THEN NULL ELSE round(%1$I * (1 + $1 / 100), 2) END,
           show_price = show_price OR
             (CASE WHEN %1$I IS NULL THEN NULL ELSE round(%1$I * (1 + $1 / 100), 2) END) > 0,
           updated_at = now()
       WHERE id = ANY($2)',
      price_field
    ) USING adjustment_value, vehicle_ids;
  ELSE
    EXECUTE format(
      'UPDATE public.vehicles
       SET %1$I = CASE WHEN %1$I IS NULL THEN NULL ELSE round(%1$I * greatest(0, 1 - $1 / 100), 2) END,
           show_price = show_price OR
             (CASE WHEN %1$I IS NULL THEN NULL ELSE round(%1$I * greatest(0, 1 - $1 / 100), 2) END) > 0,
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

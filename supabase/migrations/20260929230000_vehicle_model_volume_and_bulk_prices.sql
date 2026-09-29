-- Saved make/model volume defaults plus a guarded RPC for bulk price updates.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS volume_m3 numeric(10, 3)
  CHECK (volume_m3 IS NULL OR volume_m3 > 0);

CREATE TABLE IF NOT EXISTS public.vehicle_model_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  make text NOT NULL CHECK (char_length(btrim(make)) BETWEEN 1 AND 120),
  model text NOT NULL CHECK (char_length(btrim(model)) BETWEEN 1 AND 120),
  normalized_make text NOT NULL,
  normalized_model text NOT NULL,
  length_m numeric(8, 3) CHECK (length_m IS NULL OR length_m > 0),
  width_m numeric(8, 3) CHECK (width_m IS NULL OR width_m > 0),
  height_m numeric(8, 3) CHECK (height_m IS NULL OR height_m > 0),
  volume_m3 numeric(10, 3) NOT NULL CHECK (volume_m3 > 0),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_make, normalized_model)
);

CREATE INDEX IF NOT EXISTS vehicle_model_specs_make_model_idx
  ON public.vehicle_model_specs (normalized_make, normalized_model);

DROP TRIGGER IF EXISTS vehicle_model_specs_updated_at ON public.vehicle_model_specs;
CREATE TRIGGER vehicle_model_specs_updated_at
BEFORE UPDATE ON public.vehicle_model_specs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.vehicle_model_specs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_select_vehicle_model_specs ON public.vehicle_model_specs;
CREATE POLICY workspace_select_vehicle_model_specs
  ON public.vehicle_model_specs FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS receivables_write_vehicle_model_specs ON public.vehicle_model_specs;
CREATE POLICY receivables_write_vehicle_model_specs
  ON public.vehicle_model_specs FOR ALL TO authenticated
  USING ((SELECT private.can_manage_receivables()))
  WITH CHECK ((SELECT private.can_manage_receivables()));

REVOKE ALL ON public.vehicle_model_specs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_model_specs TO authenticated;

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
    EXECUTE format('UPDATE public.vehicles SET %I = $1, updated_at = now() WHERE id = ANY($2)', price_field)
      USING adjustment_value, vehicle_ids;
  ELSIF adjustment_mode = 'increase_percent' THEN
    EXECUTE format('UPDATE public.vehicles SET %I = CASE WHEN %I IS NULL THEN NULL ELSE round(%I * (1 + $1 / 100), 2) END, updated_at = now() WHERE id = ANY($2)', price_field, price_field, price_field)
      USING adjustment_value, vehicle_ids;
  ELSE
    EXECUTE format('UPDATE public.vehicles SET %I = CASE WHEN %I IS NULL THEN NULL ELSE round(%I * greatest(0, 1 - $1 / 100), 2) END, updated_at = now() WHERE id = ANY($2)', price_field, price_field, price_field)
      USING least(adjustment_value, 100), vehicle_ids;
  END IF;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_vehicle_prices(uuid[], text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_vehicle_prices(uuid[], text, text, numeric) TO authenticated;

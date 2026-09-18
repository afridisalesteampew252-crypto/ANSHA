/* Phase 18: additive vehicle operational lifecycle. Preserves stock_status. */

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'unassigned';

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_lifecycle_stage_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_lifecycle_stage_check
  CHECK (lifecycle_stage IN ('unassigned', 'auction', 'yard', 'port', 'sold'));

CREATE INDEX IF NOT EXISTS vehicles_lifecycle_stage_idx
  ON public.vehicles (lifecycle_stage, created_at DESC);

UPDATE public.vehicles
SET lifecycle_stage = 'sold'
WHERE stock_status = 'sold'
  AND lifecycle_stage = 'unassigned';

CREATE TABLE IF NOT EXISTS public.vehicle_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'stage_change',
    'reauction',
    'yard_transfer',
    'export_request',
    'inspection',
    'export_certificate',
    'bl',
    'original_bl',
    'surrender_bl',
    'bl_amendment',
    'courier',
    'roro',
    'container_20ft',
    'container_40ft',
    'parts_shipping',
    'meter_reverse',
    'yard_images',
    'note'
  )),
  from_stage text CHECK (from_stage IS NULL OR from_stage IN ('unassigned', 'auction', 'yard', 'port', 'sold')),
  to_stage text CHECK (to_stage IS NULL OR to_stage IN ('unassigned', 'auction', 'yard', 'port', 'sold')),
  title text CHECK (title IS NULL OR char_length(trim(title)) BETWEEN 1 AND 160),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_lifecycle_events_vehicle_created_idx
  ON public.vehicle_lifecycle_events (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_lifecycle_events_created_by_idx
  ON public.vehicle_lifecycle_events (created_by);
CREATE INDEX IF NOT EXISTS vehicle_lifecycle_events_type_idx
  ON public.vehicle_lifecycle_events (event_type, created_at DESC);

ALTER TABLE public.vehicle_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_read_vehicle_lifecycle_events ON public.vehicle_lifecycle_events;
CREATE POLICY workspace_read_vehicle_lifecycle_events
  ON public.vehicle_lifecycle_events FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS workspace_insert_vehicle_lifecycle_events ON public.vehicle_lifecycle_events;
CREATE POLICY workspace_insert_vehicle_lifecycle_events
  ON public.vehicle_lifecycle_events FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_workspace_user())
    AND created_by = (SELECT auth.uid())
  );

REVOKE ALL ON public.vehicle_lifecycle_events FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.vehicle_lifecycle_events TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_vehicle_lifecycle(
  p_vehicle_id uuid,
  p_to_stage text,
  p_notes text DEFAULT NULL,
  p_sync_stock_sold boolean DEFAULT true
)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_row public.vehicles%ROWTYPE;
  previous_stage text;
  actor uuid := auth.uid();
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_to_stage NOT IN ('unassigned', 'auction', 'yard', 'port', 'sold') THEN
    RAISE EXCEPTION 'Invalid lifecycle stage';
  END IF;

  SELECT * INTO current_row
  FROM public.vehicles
  WHERE id = p_vehicle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  previous_stage := current_row.lifecycle_stage;

  IF previous_stage IS NOT DISTINCT FROM p_to_stage THEN
    RAISE EXCEPTION 'Vehicle is already in that lifecycle stage';
  END IF;

  UPDATE public.vehicles
  SET
    lifecycle_stage = p_to_stage,
    stock_status = CASE
      WHEN p_sync_stock_sold AND p_to_stage = 'sold' THEN 'sold'
      ELSE stock_status
    END,
    updated_at = now()
  WHERE id = p_vehicle_id
  RETURNING * INTO current_row;

  INSERT INTO public.vehicle_lifecycle_events (
    vehicle_id, event_type, from_stage, to_stage, title, notes, created_by
  ) VALUES (
    p_vehicle_id,
    'stage_change',
    previous_stage,
    p_to_stage,
    'Moved to ' || initcap(replace(p_to_stage, '_', ' ')),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    actor
  );

  RETURN current_row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_vehicle_lifecycle(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_vehicle_lifecycle(uuid, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_vehicle_lifecycle_event(
  p_vehicle_id uuid,
  p_event_type text,
  p_title text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.vehicle_lifecycle_events
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_row public.vehicles%ROWTYPE;
  event_row public.vehicle_lifecycle_events%ROWTYPE;
  actor uuid := auth.uid();
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_event_type NOT IN (
    'reauction','yard_transfer','export_request','inspection','export_certificate',
    'bl','original_bl','surrender_bl','bl_amendment','courier','roro',
    'container_20ft','container_40ft','parts_shipping','meter_reverse','yard_images','note'
  ) THEN
    RAISE EXCEPTION 'Invalid lifecycle event type';
  END IF;

  SELECT * INTO current_row FROM public.vehicles WHERE id = p_vehicle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  INSERT INTO public.vehicle_lifecycle_events (
    vehicle_id, event_type, from_stage, to_stage, title, notes, metadata, created_by
  ) VALUES (
    p_vehicle_id,
    p_event_type,
    current_row.lifecycle_stage,
    current_row.lifecycle_stage,
    NULLIF(btrim(COALESCE(p_title, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb),
    actor
  )
  RETURNING * INTO event_row;

  UPDATE public.vehicles SET updated_at = now() WHERE id = p_vehicle_id;

  RETURN event_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_vehicle_lifecycle_event(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_vehicle_lifecycle_event(uuid, text, text, text, jsonb) TO authenticated;

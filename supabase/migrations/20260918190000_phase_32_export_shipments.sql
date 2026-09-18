/* Phase 32: export shipments (booking/BL header + vehicle lines). */

CREATE TABLE IF NOT EXISTS public.export_shipment_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

ALTER TABLE public.export_shipment_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_direct_export_shipment_sequence_access ON public.export_shipment_sequences;
CREATE POLICY deny_direct_export_shipment_sequence_access
  ON public.export_shipment_sequences FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.export_shipment_sequences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_export_shipment_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  fy integer := EXTRACT(YEAR FROM (now() AT TIME ZONE 'UTC'))::integer;
  n integer;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  INSERT INTO public.export_shipment_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.export_shipment_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  RETURN 'EXP-' || fy::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_export_shipment_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_export_shipment_number() TO authenticated;

CREATE TABLE IF NOT EXISTS public.export_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'booked', 'loaded', 'sailed', 'arrived', 'completed', 'cancelled')
  ),
  mode text NOT NULL DEFAULT 'roro' CHECK (
    mode IN ('roro', 'container_20ft', 'container_40ft', 'other')
  ),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  destination_country text CHECK (destination_country IS NULL OR char_length(trim(destination_country)) BETWEEN 1 AND 80),
  loading_port text CHECK (loading_port IS NULL OR char_length(trim(loading_port)) BETWEEN 1 AND 120),
  destination_port text CHECK (destination_port IS NULL OR char_length(trim(destination_port)) BETWEEN 1 AND 120),
  bl_number text CHECK (bl_number IS NULL OR char_length(trim(bl_number)) BETWEEN 1 AND 80),
  vessel_name text CHECK (vessel_name IS NULL OR char_length(trim(vessel_name)) BETWEEN 1 AND 120),
  voyage_no text CHECK (voyage_no IS NULL OR char_length(trim(voyage_no)) BETWEEN 1 AND 80),
  booking_ref text CHECK (booking_ref IS NULL OR char_length(trim(booking_ref)) BETWEEN 1 AND 120),
  etd date,
  eta date,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  workspace_request_id uuid REFERENCES public.workspace_requests(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_shipments_shipment_number_uidx UNIQUE (shipment_number)
);

CREATE TABLE IF NOT EXISTS public.export_shipment_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_shipment_id uuid NOT NULL REFERENCES public.export_shipments(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_shipment_vehicles_unique UNIQUE (export_shipment_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS export_shipments_status_idx ON public.export_shipments (status);
CREATE INDEX IF NOT EXISTS export_shipments_customer_idx ON public.export_shipments (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS export_shipment_vehicles_vehicle_idx ON public.export_shipment_vehicles (vehicle_id);
CREATE INDEX IF NOT EXISTS export_shipment_vehicles_shipment_idx ON public.export_shipment_vehicles (export_shipment_id);

DROP TRIGGER IF EXISTS export_shipments_updated_at ON public.export_shipments;
CREATE TRIGGER export_shipments_updated_at
BEFORE UPDATE ON public.export_shipments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.export_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_shipment_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_export_shipments ON public.export_shipments;
CREATE POLICY workspace_manage_export_shipments
  ON public.export_shipments FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS workspace_manage_export_shipment_vehicles ON public.export_shipment_vehicles;
CREATE POLICY workspace_manage_export_shipment_vehicles
  ON public.export_shipment_vehicles FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.export_shipments FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_shipments TO authenticated;
REVOKE ALL ON public.export_shipment_vehicles FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_shipment_vehicles TO authenticated;

CREATE OR REPLACE FUNCTION public.set_export_shipment_status(
  p_shipment_id uuid,
  p_status text
)
RETURNS public.export_shipments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ship public.export_shipments%ROWTYPE;
  veh record;
  event_type text;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF p_status NOT IN ('draft', 'booked', 'loaded', 'sailed', 'arrived', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO ship FROM public.export_shipments WHERE id = p_shipment_id FOR UPDATE;
  IF ship.id IS NULL THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF ship.status = p_status THEN
    RETURN ship;
  END IF;
  IF ship.status = 'cancelled' AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled shipments cannot be reopened';
  END IF;

  UPDATE public.export_shipments SET
    status = p_status,
    updated_at = now()
  WHERE id = p_shipment_id
  RETURNING * INTO ship;

  -- Soft lifecycle hooks: log events; move to port when booked/loaded/sailed if still earlier.
  event_type := CASE p_status
    WHEN 'booked' THEN 'export_request'
    WHEN 'loaded' THEN CASE ship.mode
      WHEN 'container_20ft' THEN 'container_20ft'
      WHEN 'container_40ft' THEN 'container_40ft'
      WHEN 'roro' THEN 'roro'
      ELSE 'parts_shipping'
    END
    WHEN 'sailed' THEN 'bl'
    ELSE NULL
  END;

  IF event_type IS NOT NULL THEN
    FOR veh IN
      SELECT vehicle_id FROM public.export_shipment_vehicles WHERE export_shipment_id = p_shipment_id
    LOOP
      PERFORM public.record_vehicle_lifecycle_event(
        veh.vehicle_id,
        event_type,
        'Export ' || ship.shipment_number,
        COALESCE(ship.bl_number, ship.booking_ref, ship.vessel_name),
        jsonb_build_object('export_shipment_id', ship.id, 'status', p_status)
      );
      IF p_status IN ('booked', 'loaded', 'sailed') THEN
        BEGIN
          PERFORM public.transition_vehicle_lifecycle(
            veh.vehicle_id,
            'port',
            'Export shipment ' || ship.shipment_number,
            false
          );
        EXCEPTION WHEN OTHERS THEN
          NULL; -- ignore if already past port or transition blocked
        END;
      END IF;
    END LOOP;
  END IF;

  RETURN ship;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_export_shipment(
  p_customer_id uuid,
  p_mode text,
  p_destination_country text,
  p_loading_port text,
  p_destination_port text,
  p_bl_number text,
  p_vessel_name text,
  p_voyage_no text,
  p_booking_ref text,
  p_etd date,
  p_eta date,
  p_notes text,
  p_vehicle_ids uuid[],
  p_confirm boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  shipment_id uuid;
  shipment_no text;
  vid uuid;
  sort_i integer := 0;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;
  IF COALESCE(p_mode, 'roro') NOT IN ('roro', 'container_20ft', 'container_40ft', 'other') THEN
    RAISE EXCEPTION 'Invalid shipment mode';
  END IF;
  IF p_vehicle_ids IS NULL OR cardinality(p_vehicle_ids) = 0 THEN
    RAISE EXCEPTION 'At least one vehicle is required';
  END IF;

  shipment_no := public.next_export_shipment_number();

  INSERT INTO public.export_shipments (
    shipment_number, status, mode, customer_id, destination_country,
    loading_port, destination_port, bl_number, vessel_name, voyage_no,
    booking_ref, etd, eta, notes, created_by
  ) VALUES (
    shipment_no,
    'draft',
    COALESCE(NULLIF(btrim(p_mode), ''), 'roro'),
    p_customer_id,
    NULLIF(btrim(p_destination_country), ''),
    NULLIF(btrim(p_loading_port), ''),
    NULLIF(btrim(p_destination_port), ''),
    NULLIF(btrim(p_bl_number), ''),
    NULLIF(btrim(p_vessel_name), ''),
    NULLIF(btrim(p_voyage_no), ''),
    NULLIF(btrim(p_booking_ref), ''),
    p_etd,
    p_eta,
    NULLIF(btrim(p_notes), ''),
    (SELECT auth.uid())
  ) RETURNING id INTO shipment_id;

  FOREACH vid IN ARRAY p_vehicle_ids
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = vid) THEN
      RAISE EXCEPTION 'Vehicle not found: %', vid;
    END IF;
    INSERT INTO public.export_shipment_vehicles (export_shipment_id, vehicle_id, sort_order)
    VALUES (shipment_id, vid, sort_i)
    ON CONFLICT (export_shipment_id, vehicle_id) DO NOTHING;
    sort_i := sort_i + 1;
  END LOOP;

  IF COALESCE(p_confirm, false) THEN
    PERFORM public.set_export_shipment_status(shipment_id, 'booked');
  END IF;

  RETURN shipment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_export_shipment(
  p_shipment_id uuid,
  p_customer_id uuid,
  p_mode text,
  p_destination_country text,
  p_loading_port text,
  p_destination_port text,
  p_bl_number text,
  p_vessel_name text,
  p_voyage_no text,
  p_booking_ref text,
  p_etd date,
  p_eta date,
  p_notes text
)
RETURNS public.export_shipments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ship public.export_shipments%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  SELECT * INTO ship FROM public.export_shipments WHERE id = p_shipment_id FOR UPDATE;
  IF ship.id IS NULL THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF ship.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Completed or cancelled shipments cannot be edited';
  END IF;

  UPDATE public.export_shipments SET
    customer_id = p_customer_id,
    mode = COALESCE(NULLIF(btrim(p_mode), ''), mode),
    destination_country = NULLIF(btrim(p_destination_country), ''),
    loading_port = NULLIF(btrim(p_loading_port), ''),
    destination_port = NULLIF(btrim(p_destination_port), ''),
    bl_number = NULLIF(btrim(p_bl_number), ''),
    vessel_name = NULLIF(btrim(p_vessel_name), ''),
    voyage_no = NULLIF(btrim(p_voyage_no), ''),
    booking_ref = NULLIF(btrim(p_booking_ref), ''),
    etd = p_etd,
    eta = p_eta,
    notes = NULLIF(btrim(p_notes), ''),
    updated_at = now()
  WHERE id = p_shipment_id
  RETURNING * INTO ship;

  RETURN ship;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_export_shipment_vehicle(
  p_shipment_id uuid,
  p_vehicle_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ship public.export_shipments%ROWTYPE;
  line_id uuid;
  next_sort integer;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  SELECT * INTO ship FROM public.export_shipments WHERE id = p_shipment_id;
  IF ship.id IS NULL THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF ship.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot add vehicles to this shipment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = p_vehicle_id) THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO next_sort
  FROM public.export_shipment_vehicles WHERE export_shipment_id = p_shipment_id;

  INSERT INTO public.export_shipment_vehicles (export_shipment_id, vehicle_id, sort_order, notes)
  VALUES (p_shipment_id, p_vehicle_id, next_sort, NULLIF(btrim(p_notes), ''))
  ON CONFLICT (export_shipment_id, vehicle_id) DO UPDATE
    SET notes = COALESCE(EXCLUDED.notes, public.export_shipment_vehicles.notes)
  RETURNING id INTO line_id;

  RETURN line_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_export_shipment_vehicle(
  p_shipment_id uuid,
  p_vehicle_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ship public.export_shipments%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  SELECT * INTO ship FROM public.export_shipments WHERE id = p_shipment_id;
  IF ship.id IS NULL THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF ship.status IN ('sailed', 'arrived', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot remove vehicles after sailing';
  END IF;
  DELETE FROM public.export_shipment_vehicles
  WHERE export_shipment_id = p_shipment_id AND vehicle_id = p_vehicle_id;
  RETURN true;
END;
$$;

-- create_export_shipment references set_export_shipment_status; ensure grants after both exist
REVOKE ALL ON FUNCTION public.create_export_shipment(uuid, text, text, text, text, text, text, text, text, date, date, text, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_export_shipment(uuid, text, text, text, text, text, text, text, text, date, date, text, uuid[], boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.set_export_shipment_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_export_shipment_status(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_export_shipment(uuid, uuid, text, text, text, text, text, text, text, text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_export_shipment(uuid, uuid, text, text, text, text, text, text, text, text, date, date, text) TO authenticated;
REVOKE ALL ON FUNCTION public.add_export_shipment_vehicle(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_export_shipment_vehicle(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.remove_export_shipment_vehicle(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_export_shipment_vehicle(uuid, uuid) TO authenticated;

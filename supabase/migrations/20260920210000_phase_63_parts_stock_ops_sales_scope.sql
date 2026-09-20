-- Phase 63: Parts stock ops parity with vehicles (Phase 62)
-- - reserved_by / VAT / ETD / ETA / requester on parts
-- - field-agent SELECT scope (available + own reserved)
-- - reserve / proforma / release RPCs for parts
-- - export_shipment_parts + create_export_shipment part_ids
-- - requester_role includes 'freelancer'; locked for field agents in RPCs
-- Additive only.

-- ---------------------------------------------------------------------------
-- 1) Parts reservation ownership + buy/reserve metadata (mirror vehicles)
-- ---------------------------------------------------------------------------
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS reserved_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservation_vat_applicable boolean,
  ADD COLUMN IF NOT EXISTS reservation_etd date,
  ADD COLUMN IF NOT EXISTS reservation_eta date,
  ADD COLUMN IF NOT EXISTS reservation_requester_name text
    CHECK (
      reservation_requester_name IS NULL
      OR char_length(btrim(reservation_requester_name)) BETWEEN 1 AND 120
    ),
  ADD COLUMN IF NOT EXISTS reservation_requester_role text;

COMMENT ON COLUMN public.parts.reserved_by IS
  'Admin profile who reserved the part; field agents only see own reserved rows.';
COMMENT ON COLUMN public.parts.reservation_vat_applicable IS
  'Whether VAT applies on the reservation proforma; cleared on release.';
COMMENT ON COLUMN public.parts.reservation_etd IS 'Planned ETD captured at reserve/buy.';
COMMENT ON COLUMN public.parts.reservation_eta IS 'Planned ETA captured at reserve/buy.';
COMMENT ON COLUMN public.parts.reservation_requester_name IS 'Name of person requesting the buy/reserve.';
COMMENT ON COLUMN public.parts.reservation_requester_role IS
  'Requester role: sales | freelancer | manager | admin (form enum, not RBAC).';

CREATE INDEX IF NOT EXISTS parts_reserved_by_idx
  ON public.parts (reserved_by)
  WHERE reserved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS parts_reserved_customer_idx
  ON public.parts (reserved_customer_id)
  WHERE reserved_customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Requester role: allow freelancer on vehicles + parts
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_reservation_requester_role_check;

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_reservation_requester_role_check
  CHECK (
    reservation_requester_role IS NULL
    OR reservation_requester_role IN ('sales', 'freelancer', 'manager', 'admin')
  );

ALTER TABLE public.parts
  DROP CONSTRAINT IF EXISTS parts_reservation_requester_role_check;

ALTER TABLE public.parts
  ADD CONSTRAINT parts_reservation_requester_role_check
  CHECK (
    reservation_requester_role IS NULL
    OR reservation_requester_role IN ('sales', 'freelancer', 'manager', 'admin')
  );

-- ---------------------------------------------------------------------------
-- 3) Field-agent scoped parts SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_read_all_parts" ON public.parts;
CREATE POLICY "admin_read_all_parts"
  ON public.parts FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    AND (
      NOT private.is_field_agent()
      OR stock_status = 'available'
      OR reserved_by = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 4) export_shipment_parts (DHL / small parts packing list)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.export_shipment_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_shipment_id uuid NOT NULL REFERENCES public.export_shipments(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  sort_order integer NOT NULL DEFAULT 0,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_shipment_parts_unique UNIQUE (export_shipment_id, part_id)
);

CREATE INDEX IF NOT EXISTS export_shipment_parts_part_idx
  ON public.export_shipment_parts (part_id);
CREATE INDEX IF NOT EXISTS export_shipment_parts_shipment_idx
  ON public.export_shipment_parts (export_shipment_id);

ALTER TABLE public.export_shipment_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_export_shipment_parts ON public.export_shipment_parts;
CREATE POLICY workspace_manage_export_shipment_parts
  ON public.export_shipment_parts FOR ALL
  TO authenticated
  USING ((SELECT private.is_workspace_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.export_shipment_parts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_shipment_parts TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) create_export_shipment: optional part_ids (esp. DHL)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_export_shipment(
  uuid, text, text, text, text, text, text, text, text, date, date, text, uuid[], boolean
);

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
  p_confirm boolean DEFAULT false,
  p_part_ids uuid[] DEFAULT NULL
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
  pid uuid;
  sort_i integer := 0;
  v_mode text := COALESCE(NULLIF(btrim(p_mode), ''), 'roro');
  vehicle_count integer := COALESCE(cardinality(p_vehicle_ids), 0);
  part_count integer := COALESCE(cardinality(p_part_ids), 0);
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;
  IF v_mode NOT IN ('dhl', 'roro', 'container_20ft', 'container_40ft') THEN
    RAISE EXCEPTION 'Invalid shipment mode';
  END IF;
  -- DHL may ship parts only (or empty booking); vehicle modes need ≥1 vehicle.
  IF v_mode <> 'dhl' AND vehicle_count = 0 THEN
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
    v_mode,
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

  IF p_vehicle_ids IS NOT NULL THEN
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
  END IF;

  sort_i := 0;
  IF p_part_ids IS NOT NULL AND part_count > 0 THEN
    FOREACH pid IN ARRAY p_part_ids
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.parts WHERE id = pid) THEN
        RAISE EXCEPTION 'Part not found: %', pid;
      END IF;
      INSERT INTO public.export_shipment_parts (export_shipment_id, part_id, sort_order, quantity)
      VALUES (shipment_id, pid, sort_i, 1)
      ON CONFLICT (export_shipment_id, part_id) DO NOTHING;
      sort_i := sort_i + 1;
    END LOOP;
  END IF;

  IF COALESCE(p_confirm, false) THEN
    PERFORM public.set_export_shipment_status(shipment_id, 'booked');
  END IF;

  RETURN shipment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_export_shipment(
  uuid, text, text, text, text, text, text, text, text, date, date, text, uuid[], boolean, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_export_shipment(
  uuid, text, text, text, text, text, text, text, text, date, date, text, uuid[], boolean, uuid[]
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Helper: resolve locked requester for field agents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.field_agent_requester()
RETURNS TABLE (requester_name text, requester_role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prof record;
BEGIN
  SELECT full_name, email, role INTO prof
  FROM public.admin_profiles
  WHERE id = (SELECT auth.uid());

  IF prof IS NULL THEN
    requester_name := NULL;
    requester_role := 'sales';
    RETURN NEXT;
    RETURN;
  END IF;

  requester_name := NULLIF(btrim(COALESCE(prof.full_name, '')), '');
  IF requester_name IS NULL THEN
    requester_name := NULLIF(btrim(COALESCE(prof.email, '')), '');
  END IF;
  requester_role := CASE
    WHEN prof.role = 'freelancer' THEN 'freelancer'
    ELSE 'sales'
  END;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Vehicle reserve RPCs: freelancer role + lock requester for field agents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_vehicle_stock(
  p_vehicle_id uuid,
  p_customer_id uuid,
  p_price_term text DEFAULT NULL,
  p_shipment_term text DEFAULT NULL,
  p_inspection_required boolean DEFAULT NULL,
  p_vat_applicable boolean DEFAULT true,
  p_etd date DEFAULT NULL,
  p_eta date DEFAULT NULL,
  p_requester_name text DEFAULT NULL,
  p_requester_role text DEFAULT NULL
)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.vehicles%ROWTYPE;
  v_price_term text := NULLIF(lower(btrim(COALESCE(p_price_term, ''))), '');
  v_shipment_term text := NULLIF(lower(btrim(COALESCE(p_shipment_term, ''))), '');
  v_requester_role text := NULLIF(lower(btrim(COALESCE(p_requester_role, ''))), '');
  v_requester_name text := NULLIF(btrim(COALESCE(p_requester_name, '')), '');
  locked record;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF p_customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;
  IF v_price_term IS NOT NULL AND v_price_term NOT IN ('fob', 'cf', 'cif') THEN
    RAISE EXCEPTION 'Invalid price term';
  END IF;
  IF v_shipment_term IS NOT NULL AND v_shipment_term NOT IN ('dhl', 'roro', 'container_20ft', 'container_40ft') THEN
    RAISE EXCEPTION 'Invalid shipment term';
  END IF;

  IF private.is_field_agent() THEN
    SELECT * INTO locked FROM private.field_agent_requester();
    v_requester_name := locked.requester_name;
    v_requester_role := locked.requester_role;
  ELSE
    IF v_requester_role IS NOT NULL AND v_requester_role NOT IN ('sales', 'freelancer', 'manager', 'admin') THEN
      RAISE EXCEPTION 'Invalid requester role';
    END IF;
  END IF;

  UPDATE public.vehicles SET
    stock_status = 'reserved',
    reserved_customer_id = p_customer_id,
    reserved_by = (SELECT auth.uid()),
    is_published = false,
    reservation_price_term = v_price_term,
    reservation_shipment_term = v_shipment_term,
    reservation_inspection_required = p_inspection_required,
    reservation_vat_applicable = COALESCE(p_vat_applicable, true),
    reservation_etd = p_etd,
    reservation_eta = p_eta,
    reservation_requester_name = v_requester_name,
    reservation_requester_role = v_requester_role,
    updated_at = now()
  WHERE id = p_vehicle_id
    AND stock_status = 'available'
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Vehicle is not available to reserve';
  END IF;
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_vehicle_reservation_proforma(
  p_vehicle_id uuid,
  p_customer_id uuid,
  p_unit_price numeric,
  p_currency text,
  p_tax_rate numeric,
  p_due_date date,
  p_notes text,
  p_reference text,
  p_price_term text DEFAULT NULL,
  p_shipment_term text DEFAULT NULL,
  p_inspection_required boolean DEFAULT NULL,
  p_vat_applicable boolean DEFAULT true,
  p_etd date DEFAULT NULL,
  p_eta date DEFAULT NULL,
  p_requester_name text DEFAULT NULL,
  p_requester_role text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  veh public.vehicles%ROWTYPE;
  cust public.customers%ROWTYPE;
  invoice_id uuid;
  v_price numeric;
  v_currency text;
  v_ref text;
  v_desc text;
  v_price_term text := NULLIF(lower(btrim(COALESCE(p_price_term, ''))), '');
  v_shipment_term text := NULLIF(lower(btrim(COALESCE(p_shipment_term, ''))), '');
  v_term_label text;
  v_ship_label text;
  v_vat boolean := COALESCE(p_vat_applicable, true);
  v_tax numeric;
  v_requester_role text := NULLIF(lower(btrim(COALESCE(p_requester_role, ''))), '');
  v_requester_name text := NULLIF(btrim(COALESCE(p_requester_name, '')), '');
  locked record;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  SELECT * INTO cust FROM public.customers WHERE id = p_customer_id;
  IF cust.id IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;

  IF v_price_term IS NOT NULL AND v_price_term NOT IN ('fob', 'cf', 'cif') THEN
    RAISE EXCEPTION 'Invalid price term';
  END IF;
  IF v_shipment_term IS NOT NULL AND v_shipment_term NOT IN ('dhl', 'roro', 'container_20ft', 'container_40ft') THEN
    RAISE EXCEPTION 'Invalid shipment term';
  END IF;

  IF private.is_field_agent() THEN
    SELECT * INTO locked FROM private.field_agent_requester();
    v_requester_name := locked.requester_name;
    v_requester_role := locked.requester_role;
  ELSE
    IF v_requester_role IS NOT NULL AND v_requester_role NOT IN ('sales', 'freelancer', 'manager', 'admin') THEN
      RAISE EXCEPTION 'Invalid requester role';
    END IF;
  END IF;

  v_tax := CASE WHEN v_vat THEN COALESCE(p_tax_rate, 5) ELSE 0 END;

  UPDATE public.vehicles SET
    stock_status = 'reserved',
    reserved_customer_id = p_customer_id,
    reserved_by = (SELECT auth.uid()),
    is_published = false,
    reservation_price_term = v_price_term,
    reservation_shipment_term = v_shipment_term,
    reservation_inspection_required = p_inspection_required,
    reservation_vat_applicable = v_vat,
    reservation_etd = p_etd,
    reservation_eta = p_eta,
    reservation_requester_name = v_requester_name,
    reservation_requester_role = v_requester_role,
    updated_at = now()
  WHERE id = p_vehicle_id
    AND stock_status = 'available'
  RETURNING * INTO veh;

  IF veh.id IS NULL THEN
    RAISE EXCEPTION 'Vehicle is not available to reserve';
  END IF;

  v_price := COALESCE(
    p_unit_price,
    CASE v_price_term
      WHEN 'fob' THEN veh.price_fob
      WHEN 'cf' THEN veh.price_cf
      WHEN 'cif' THEN veh.price_cif
      ELSE NULL
    END,
    veh.price,
    0
  );
  v_currency := upper(COALESCE(NULLIF(btrim(p_currency), ''), veh.currency, 'AED'));
  v_ref := COALESCE(
    NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(veh.stock_number), ''),
    NULLIF(btrim(veh.chassis_number), ''),
    NULLIF(btrim(veh.chassis_code), ''),
    left(veh.id::text, 8)
  );

  v_term_label := CASE v_price_term
    WHEN 'fob' THEN 'FOB'
    WHEN 'cf' THEN 'C&F'
    WHEN 'cif' THEN 'CIF'
    ELSE NULL
  END;
  v_ship_label := CASE v_shipment_term
    WHEN 'dhl' THEN 'DHL (small parts)'
    WHEN 'roro' THEN 'RoRo'
    WHEN 'container_20ft' THEN '20 feet container'
    WHEN 'container_40ft' THEN '40 feet container'
    ELSE NULL
  END;

  v_desc := veh.title || E'\nReference: ' || v_ref;
  IF v_term_label IS NOT NULL THEN
    v_desc := v_desc || E'\nPrice term: ' || v_term_label;
  END IF;
  IF v_ship_label IS NOT NULL THEN
    v_desc := v_desc || E'\nShipment term: ' || v_ship_label;
  END IF;
  IF p_inspection_required IS NOT NULL THEN
    v_desc := v_desc || E'\nInspection: ' || CASE WHEN p_inspection_required THEN 'Yes' ELSE 'No' END;
  END IF;
  v_desc := v_desc || E'\nVAT: ' || CASE WHEN v_vat THEN 'Yes' ELSE 'No' END;
  IF v_requester_name IS NOT NULL THEN
    v_desc := v_desc || E'\nRequester: ' || v_requester_name;
  END IF;
  IF v_requester_role IS NOT NULL THEN
    v_desc := v_desc || E'\nRequester role: ' || initcap(v_requester_role);
  END IF;
  IF p_etd IS NOT NULL THEN
    v_desc := v_desc || E'\nETD: ' || p_etd::text;
  END IF;
  IF p_eta IS NOT NULL THEN
    v_desc := v_desc || E'\nETA: ' || p_eta::text;
  END IF;

  invoice_id := public.create_invoice_v3(
    NULL,
    'proforma_invoice',
    cust.id,
    COALESCE(NULLIF(btrim(cust.full_name), ''), NULLIF(btrim(cust.company_name), ''), 'Customer'),
    COALESCE(cust.company_name, ''),
    COALESCE(cust.email, ''),
    COALESCE(cust.phone, ''),
    COALESCE(cust.address, ''),
    COALESCE(cust.tax_registration_number, ''),
    (now() AT TIME ZONE 'UTC')::date,
    COALESCE(p_due_date, ((now() AT TIME ZONE 'UTC')::date + 30)),
    v_currency,
    v_ref,
    COALESCE(NULLIF(btrim(p_notes), ''), 'Reserved via sales reservation screen.'),
    'Payment is due by the date shown on the invoice.',
    jsonb_build_array(
      jsonb_build_object(
        'description', v_desc,
        'quantity', 1,
        'unit_price', v_price,
        'discount_percent', 0,
        'tax_rate', v_tax,
        'inventory_type', 'vehicle',
        'part_id', null,
        'vehicle_id', veh.id,
        'inventory_reference', v_ref,
        'price_term', v_price_term
      )
    ),
    v_price_term,
    v_shipment_term
  );

  UPDATE public.invoices
  SET vat_applicable = v_vat,
      updated_at = now()
  WHERE id = invoice_id;

  RETURN jsonb_build_object(
    'vehicle_id', veh.id,
    'invoice_id', invoice_id,
    'stock_status', 'reserved',
    'is_published', false,
    'reservation_price_term', v_price_term,
    'reservation_shipment_term', v_shipment_term,
    'reservation_inspection_required', p_inspection_required,
    'reservation_vat_applicable', v_vat,
    'reserved_by', (SELECT auth.uid())
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Parts reserve / proforma / release RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_part_stock(
  p_part_id uuid,
  p_customer_id uuid,
  p_price_term text DEFAULT NULL,
  p_shipment_term text DEFAULT NULL,
  p_inspection_required boolean DEFAULT NULL,
  p_vat_applicable boolean DEFAULT true,
  p_etd date DEFAULT NULL,
  p_eta date DEFAULT NULL,
  p_requester_name text DEFAULT NULL,
  p_requester_role text DEFAULT NULL
)
RETURNS public.parts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.parts%ROWTYPE;
  v_price_term text := NULLIF(lower(btrim(COALESCE(p_price_term, ''))), '');
  v_shipment_term text := NULLIF(lower(btrim(COALESCE(p_shipment_term, ''))), '');
  v_requester_role text := NULLIF(lower(btrim(COALESCE(p_requester_role, ''))), '');
  v_requester_name text := NULLIF(btrim(COALESCE(p_requester_name, '')), '');
  locked record;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  IF p_customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;
  IF v_price_term IS NOT NULL AND v_price_term NOT IN ('fob', 'cf', 'cif') THEN
    RAISE EXCEPTION 'Invalid price term';
  END IF;
  IF v_shipment_term IS NOT NULL AND v_shipment_term NOT IN ('dhl', 'roro', 'container_20ft', 'container_40ft') THEN
    RAISE EXCEPTION 'Invalid shipment term';
  END IF;

  IF private.is_field_agent() THEN
    SELECT * INTO locked FROM private.field_agent_requester();
    v_requester_name := locked.requester_name;
    v_requester_role := locked.requester_role;
  ELSE
    IF v_requester_role IS NOT NULL AND v_requester_role NOT IN ('sales', 'freelancer', 'manager', 'admin') THEN
      RAISE EXCEPTION 'Invalid requester role';
    END IF;
  END IF;

  -- Default shipment for parts is DHL when omitted
  IF v_shipment_term IS NULL THEN
    v_shipment_term := 'dhl';
  END IF;

  UPDATE public.parts SET
    stock_status = 'reserved',
    reserved_customer_id = p_customer_id,
    reserved_by = (SELECT auth.uid()),
    is_published = false,
    reservation_price_term = v_price_term,
    reservation_shipment_term = v_shipment_term,
    reservation_inspection_required = p_inspection_required,
    reservation_vat_applicable = COALESCE(p_vat_applicable, true),
    reservation_etd = p_etd,
    reservation_eta = p_eta,
    reservation_requester_name = v_requester_name,
    reservation_requester_role = v_requester_role,
    updated_at = now()
  WHERE id = p_part_id
    AND stock_status = 'available'
    AND quantity > 0
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Part is not available to reserve';
  END IF;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_part_stock(
  uuid, uuid, text, text, boolean, boolean, date, date, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_part_stock(
  uuid, uuid, text, text, boolean, boolean, date, date, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_part_reservation_proforma(
  p_part_id uuid,
  p_customer_id uuid,
  p_unit_price numeric,
  p_currency text,
  p_tax_rate numeric,
  p_due_date date,
  p_notes text,
  p_reference text,
  p_price_term text DEFAULT NULL,
  p_shipment_term text DEFAULT NULL,
  p_inspection_required boolean DEFAULT NULL,
  p_vat_applicable boolean DEFAULT true,
  p_etd date DEFAULT NULL,
  p_eta date DEFAULT NULL,
  p_requester_name text DEFAULT NULL,
  p_requester_role text DEFAULT NULL,
  p_quantity numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  part_row public.parts%ROWTYPE;
  cust public.customers%ROWTYPE;
  invoice_id uuid;
  v_price numeric;
  v_currency text;
  v_ref text;
  v_desc text;
  v_price_term text := NULLIF(lower(btrim(COALESCE(p_price_term, ''))), '');
  v_shipment_term text := NULLIF(lower(btrim(COALESCE(p_shipment_term, ''))), '');
  v_term_label text;
  v_ship_label text;
  v_vat boolean := COALESCE(p_vat_applicable, true);
  v_tax numeric;
  v_qty numeric := GREATEST(COALESCE(p_quantity, 1), 1);
  v_requester_role text := NULLIF(lower(btrim(COALESCE(p_requester_role, ''))), '');
  v_requester_name text := NULLIF(btrim(COALESCE(p_requester_name, '')), '');
  locked record;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  SELECT * INTO cust FROM public.customers WHERE id = p_customer_id;
  IF cust.id IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;

  IF v_price_term IS NOT NULL AND v_price_term NOT IN ('fob', 'cf', 'cif') THEN
    RAISE EXCEPTION 'Invalid price term';
  END IF;
  IF v_shipment_term IS NOT NULL AND v_shipment_term NOT IN ('dhl', 'roro', 'container_20ft', 'container_40ft') THEN
    RAISE EXCEPTION 'Invalid shipment term';
  END IF;

  IF private.is_field_agent() THEN
    SELECT * INTO locked FROM private.field_agent_requester();
    v_requester_name := locked.requester_name;
    v_requester_role := locked.requester_role;
  ELSE
    IF v_requester_role IS NOT NULL AND v_requester_role NOT IN ('sales', 'freelancer', 'manager', 'admin') THEN
      RAISE EXCEPTION 'Invalid requester role';
    END IF;
  END IF;

  IF v_shipment_term IS NULL THEN
    v_shipment_term := 'dhl';
  END IF;

  v_tax := CASE WHEN v_vat THEN COALESCE(p_tax_rate, 5) ELSE 0 END;

  UPDATE public.parts SET
    stock_status = 'reserved',
    reserved_customer_id = p_customer_id,
    reserved_by = (SELECT auth.uid()),
    is_published = false,
    reservation_price_term = v_price_term,
    reservation_shipment_term = v_shipment_term,
    reservation_inspection_required = p_inspection_required,
    reservation_vat_applicable = v_vat,
    reservation_etd = p_etd,
    reservation_eta = p_eta,
    reservation_requester_name = v_requester_name,
    reservation_requester_role = v_requester_role,
    updated_at = now()
  WHERE id = p_part_id
    AND stock_status = 'available'
    AND quantity > 0
  RETURNING * INTO part_row;

  IF part_row.id IS NULL THEN
    RAISE EXCEPTION 'Part is not available to reserve';
  END IF;

  IF v_qty > part_row.quantity THEN
    v_qty := part_row.quantity;
  END IF;

  v_price := COALESCE(
    p_unit_price,
    CASE v_price_term
      WHEN 'fob' THEN part_row.price_fob
      WHEN 'cf' THEN part_row.price_cf
      WHEN 'cif' THEN part_row.price_cif
      ELSE NULL
    END,
    part_row.price,
    0
  );
  v_currency := upper(COALESCE(NULLIF(btrim(p_currency), ''), part_row.currency, 'AED'));
  v_ref := COALESCE(
    NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(part_row.part_code), ''),
    NULLIF(btrim(part_row.oem_number), ''),
    left(part_row.id::text, 8)
  );

  v_term_label := CASE v_price_term
    WHEN 'fob' THEN 'FOB'
    WHEN 'cf' THEN 'C&F'
    WHEN 'cif' THEN 'CIF'
    ELSE NULL
  END;
  v_ship_label := CASE v_shipment_term
    WHEN 'dhl' THEN 'DHL (small parts)'
    WHEN 'roro' THEN 'RoRo'
    WHEN 'container_20ft' THEN '20 feet container'
    WHEN 'container_40ft' THEN '40 feet container'
    ELSE NULL
  END;

  v_desc := part_row.name || E'\nPart code: ' || v_ref;
  IF v_term_label IS NOT NULL THEN
    v_desc := v_desc || E'\nPrice term: ' || v_term_label;
  END IF;
  IF v_ship_label IS NOT NULL THEN
    v_desc := v_desc || E'\nShipment term: ' || v_ship_label;
  END IF;
  IF p_inspection_required IS NOT NULL THEN
    v_desc := v_desc || E'\nInspection: ' || CASE WHEN p_inspection_required THEN 'Yes' ELSE 'No' END;
  END IF;
  v_desc := v_desc || E'\nVAT: ' || CASE WHEN v_vat THEN 'Yes' ELSE 'No' END;
  IF v_requester_name IS NOT NULL THEN
    v_desc := v_desc || E'\nRequester: ' || v_requester_name;
  END IF;
  IF v_requester_role IS NOT NULL THEN
    v_desc := v_desc || E'\nRequester role: ' || initcap(v_requester_role);
  END IF;
  IF p_etd IS NOT NULL THEN
    v_desc := v_desc || E'\nETD: ' || p_etd::text;
  END IF;
  IF p_eta IS NOT NULL THEN
    v_desc := v_desc || E'\nETA: ' || p_eta::text;
  END IF;

  invoice_id := public.create_invoice_v3(
    NULL,
    'proforma_invoice',
    cust.id,
    COALESCE(NULLIF(btrim(cust.full_name), ''), NULLIF(btrim(cust.company_name), ''), 'Customer'),
    COALESCE(cust.company_name, ''),
    COALESCE(cust.email, ''),
    COALESCE(cust.phone, ''),
    COALESCE(cust.address, ''),
    COALESCE(cust.tax_registration_number, ''),
    (now() AT TIME ZONE 'UTC')::date,
    COALESCE(p_due_date, ((now() AT TIME ZONE 'UTC')::date + 30)),
    v_currency,
    v_ref,
    COALESCE(NULLIF(btrim(p_notes), ''), 'Reserved via parts reservation screen.'),
    'Payment is due by the date shown on the invoice.',
    jsonb_build_array(
      jsonb_build_object(
        'description', v_desc,
        'quantity', v_qty,
        'unit_price', v_price,
        'discount_percent', 0,
        'tax_rate', v_tax,
        'inventory_type', 'part',
        'part_id', part_row.id,
        'vehicle_id', null,
        'inventory_reference', v_ref,
        'price_term', v_price_term
      )
    ),
    v_price_term,
    v_shipment_term
  );

  UPDATE public.invoices
  SET vat_applicable = v_vat,
      updated_at = now()
  WHERE id = invoice_id;

  RETURN jsonb_build_object(
    'part_id', part_row.id,
    'invoice_id', invoice_id,
    'stock_status', 'reserved',
    'is_published', false,
    'reservation_price_term', v_price_term,
    'reservation_shipment_term', v_shipment_term,
    'reservation_inspection_required', p_inspection_required,
    'reservation_vat_applicable', v_vat,
    'reserved_by', (SELECT auth.uid())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_part_reservation_proforma(
  uuid, uuid, numeric, text, numeric, date, text, text, text, text, boolean, boolean, date, date, text, text, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_part_reservation_proforma(
  uuid, uuid, numeric, text, numeric, date, text, text, text, text, boolean, boolean, date, date, text, text, numeric
) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_part_reservation(
  p_part_id uuid,
  p_republish boolean DEFAULT false
)
RETURNS public.parts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.parts%ROWTYPE;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  IF private.is_field_agent() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.parts
      WHERE id = p_part_id
        AND stock_status = 'reserved'
        AND reserved_by = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'You can only release your own reservations';
    END IF;
  END IF;

  UPDATE public.parts SET
    stock_status = 'available',
    reserved_customer_id = NULL,
    reserved_by = NULL,
    reservation_price_term = NULL,
    reservation_shipment_term = NULL,
    reservation_inspection_required = NULL,
    reservation_vat_applicable = NULL,
    reservation_etd = NULL,
    reservation_eta = NULL,
    reservation_requester_name = NULL,
    reservation_requester_role = NULL,
    is_published = CASE WHEN COALESCE(p_republish, false) THEN true ELSE is_published END,
    updated_at = now()
  WHERE id = p_part_id
    AND stock_status = 'reserved'
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Part is not reserved';
  END IF;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.release_part_reservation(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_part_reservation(uuid, boolean) TO authenticated;

-- Keep vehicle release grants (unchanged body already in Phase 62)
REVOKE ALL ON FUNCTION public.reserve_vehicle_stock(
  uuid, uuid, text, text, boolean, boolean, date, date, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_vehicle_stock(
  uuid, uuid, text, text, boolean, boolean, date, date, text, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.create_vehicle_reservation_proforma(
  uuid, uuid, numeric, text, numeric, date, text, text, text, text, boolean, boolean, date, date, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vehicle_reservation_proforma(
  uuid, uuid, numeric, text, numeric, date, text, text, text, text, boolean, boolean, date, date, text, text
) TO authenticated;

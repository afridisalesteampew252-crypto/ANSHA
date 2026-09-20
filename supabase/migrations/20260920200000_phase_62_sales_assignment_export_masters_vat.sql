-- Phase 62: sales agent reservation assignment + scoped catalog visibility,
-- export master data (country/ports/vessel/voyage), document-driven shipment
-- status (BOL→shipped/sailed, waybill/surrendered→delivered/arrived),
-- reservation requester + ETA/ETD, VAT Yes/No on reservation proforma.
-- Additive only — does not alter existing stock_status enum values.

-- ---------------------------------------------------------------------------
-- 1) Vehicle reservation ownership + buy/reserve metadata + VAT flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS reserved_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservation_vat_applicable boolean,
  ADD COLUMN IF NOT EXISTS reservation_etd date,
  ADD COLUMN IF NOT EXISTS reservation_eta date,
  ADD COLUMN IF NOT EXISTS reservation_requester_name text
    CHECK (
      reservation_requester_name IS NULL
      OR char_length(btrim(reservation_requester_name)) BETWEEN 1 AND 120
    ),
  ADD COLUMN IF NOT EXISTS reservation_requester_role text
    CHECK (
      reservation_requester_role IS NULL
      OR reservation_requester_role IN ('sales', 'manager', 'admin')
    );

COMMENT ON COLUMN public.vehicles.reserved_by IS
  'Admin profile who reserved the unit; field agents only see own reserved rows.';
COMMENT ON COLUMN public.vehicles.reservation_vat_applicable IS
  'Whether VAT applies on the reservation proforma; cleared on release.';
COMMENT ON COLUMN public.vehicles.reservation_etd IS 'Planned ETD captured at reserve/buy.';
COMMENT ON COLUMN public.vehicles.reservation_eta IS 'Planned ETA captured at reserve/buy.';
COMMENT ON COLUMN public.vehicles.reservation_requester_name IS 'Name of person requesting the buy/reserve.';
COMMENT ON COLUMN public.vehicles.reservation_requester_role IS
  'Requester role type: sales | manager | admin (form enum, not RBAC).';

CREATE INDEX IF NOT EXISTS vehicles_reserved_by_idx
  ON public.vehicles (reserved_by)
  WHERE reserved_by IS NOT NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS vat_applicable boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.invoices.vat_applicable IS
  'When false, line tax rates are expected to be 0 (VAT not applied).';

-- ---------------------------------------------------------------------------
-- 2) Field-agent scoped vehicle SELECT (ops/manager/accounts still see all)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_read_all_vehicles" ON public.vehicles;
CREATE POLICY "admin_read_all_vehicles"
  ON public.vehicles FOR SELECT
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
-- 3) Export master options (Configuration menu)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.export_master_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (
    kind IN (
      'destination_country',
      'loading_port',
      'destination_port',
      'vessel',
      'voyage'
    )
  ),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  code text CHECK (code IS NULL OR char_length(btrim(code)) BETWEEN 1 AND 40),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS export_master_options_kind_name_uidx
  ON public.export_master_options (kind, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS export_master_options_kind_active_idx
  ON public.export_master_options (kind, is_active, sort_order, name);

ALTER TABLE public.export_master_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_read_export_master_options ON public.export_master_options;
CREATE POLICY workspace_read_export_master_options
  ON public.export_master_options FOR SELECT
  TO authenticated
  USING ((SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS ops_write_export_master_options ON public.export_master_options;
CREATE POLICY ops_write_export_master_options
  ON public.export_master_options FOR ALL
  TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

-- ---------------------------------------------------------------------------
-- 4) Export doc type: surrendered BL (→ Delivered alongside waybill)
-- ---------------------------------------------------------------------------
ALTER TABLE public.export_shipment_documents
  DROP CONSTRAINT IF EXISTS export_shipment_documents_doc_type_check;

ALTER TABLE public.export_shipment_documents
  ADD CONSTRAINT export_shipment_documents_doc_type_check
  CHECK (
    doc_type IN (
      'bill_of_lading',
      'export_certificate',
      'waybill',
      'courier',
      'inspection_certificate',
      'surrendered_bl'
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Document upload → shipment status automation
--    Booking apply already sets booked via create_export_shipment(p_confirm).
--    BOL → sailed (UI: Shipped); waybill / surrendered_bl → arrived (UI: Delivered).
--    draft with no booking remains Not Booked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.apply_export_doc_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ship public.export_shipments%ROWTYPE;
  target text;
BEGIN
  IF NOT private.is_ops_user() THEN
    RETURN NEW;
  END IF;

  SELECT * INTO ship
  FROM public.export_shipments
  WHERE id = NEW.export_shipment_id
  FOR UPDATE;

  IF ship.id IS NULL THEN
    RETURN NEW;
  END IF;
  IF ship.status IN ('cancelled', 'completed') THEN
    RETURN NEW;
  END IF;

  target := CASE NEW.doc_type
    WHEN 'bill_of_lading' THEN 'sailed'
    WHEN 'waybill' THEN 'arrived'
    WHEN 'surrendered_bl' THEN 'arrived'
    ELSE NULL
  END;

  IF target IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only advance forward in the lifecycle (never regress).
  IF target = 'sailed' AND ship.status IN ('draft', 'booked', 'loaded') THEN
    PERFORM public.set_export_shipment_status(ship.id, 'sailed');
  ELSIF target = 'arrived' AND ship.status IN ('draft', 'booked', 'loaded', 'sailed') THEN
    PERFORM public.set_export_shipment_status(ship.id, 'arrived');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS export_shipment_documents_status_ai ON public.export_shipment_documents;
CREATE TRIGGER export_shipment_documents_status_ai
  AFTER INSERT ON public.export_shipment_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.apply_export_doc_status_transition();

-- ---------------------------------------------------------------------------
-- 6) Reservation RPCs: assign reserved_by, requester, ETA/ETD, VAT
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reserve_vehicle_stock(uuid, uuid, text, text, boolean);

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
  IF v_requester_role IS NOT NULL AND v_requester_role NOT IN ('sales', 'manager', 'admin') THEN
    RAISE EXCEPTION 'Invalid requester role';
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

REVOKE ALL ON FUNCTION public.reserve_vehicle_stock(
  uuid, uuid, text, text, boolean, boolean, date, date, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_vehicle_stock(
  uuid, uuid, text, text, boolean, boolean, date, date, text, text
) TO authenticated;

DROP FUNCTION IF EXISTS public.create_vehicle_reservation_proforma(
  uuid, uuid, numeric, text, numeric, date, text, text, text, text, boolean
);

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
  IF v_requester_role IS NOT NULL AND v_requester_role NOT IN ('sales', 'manager', 'admin') THEN
    RAISE EXCEPTION 'Invalid requester role';
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

REVOKE ALL ON FUNCTION public.create_vehicle_reservation_proforma(
  uuid, uuid, numeric, text, numeric, date, text, text, text, text, boolean, boolean, date, date, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vehicle_reservation_proforma(
  uuid, uuid, numeric, text, numeric, date, text, text, text, text, boolean, boolean, date, date, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_vehicle_reservation(
  p_vehicle_id uuid,
  p_republish boolean DEFAULT false
)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.vehicles%ROWTYPE;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  -- Field agents may only release their own reservations.
  IF private.is_field_agent() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE id = p_vehicle_id
        AND stock_status = 'reserved'
        AND reserved_by = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'You can only release your own reservations';
    END IF;
  END IF;

  UPDATE public.vehicles SET
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
  WHERE id = p_vehicle_id
    AND stock_status = 'reserved'
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Vehicle is not reserved';
  END IF;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.release_vehicle_reservation(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_vehicle_reservation(uuid, boolean) TO authenticated;

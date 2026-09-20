-- Phase 61: export shipment docs + Incoterms + reservation price/shipment terms.
-- Additive: preserves existing shipments (mode `other` → `dhl`).

-- ---------------------------------------------------------------------------
-- 1) Shipment modes: DHL / RoRo / 20ft / 40ft
-- ---------------------------------------------------------------------------
UPDATE public.export_shipments
SET mode = 'dhl'
WHERE mode = 'other';

ALTER TABLE public.export_shipments
  DROP CONSTRAINT IF EXISTS export_shipments_mode_check;

ALTER TABLE public.export_shipments
  ADD CONSTRAINT export_shipments_mode_check
  CHECK (mode IN ('dhl', 'roro', 'container_20ft', 'container_40ft'));

ALTER TABLE public.export_shipments
  ALTER COLUMN mode SET DEFAULT 'roro';

CREATE INDEX IF NOT EXISTS export_shipments_mode_idx ON public.export_shipments (mode);

-- ---------------------------------------------------------------------------
-- 2) Catalog Incoterm quote prices (parts + vehicles)
-- ---------------------------------------------------------------------------
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS price_fob numeric(12,2) CHECK (price_fob IS NULL OR price_fob >= 0),
  ADD COLUMN IF NOT EXISTS price_cf numeric(12,2) CHECK (price_cf IS NULL OR price_cf >= 0),
  ADD COLUMN IF NOT EXISTS price_cif numeric(12,2) CHECK (price_cif IS NULL OR price_cif >= 0);

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS price_fob numeric(12,2) CHECK (price_fob IS NULL OR price_fob >= 0),
  ADD COLUMN IF NOT EXISTS price_cf numeric(12,2) CHECK (price_cf IS NULL OR price_cf >= 0),
  ADD COLUMN IF NOT EXISTS price_cif numeric(12,2) CHECK (price_cif IS NULL OR price_cif >= 0);

COMMENT ON COLUMN public.parts.price_fob IS 'FOB sell quote (catalog currency).';
COMMENT ON COLUMN public.parts.price_cf IS 'C&F / CFR sell quote (catalog currency).';
COMMENT ON COLUMN public.parts.price_cif IS 'CIF sell quote (catalog currency).';
COMMENT ON COLUMN public.vehicles.price_fob IS 'FOB sell quote (catalog currency).';
COMMENT ON COLUMN public.vehicles.price_cf IS 'C&F / CFR sell quote (catalog currency).';
COMMENT ON COLUMN public.vehicles.price_cif IS 'CIF sell quote (catalog currency).';

-- ---------------------------------------------------------------------------
-- 3) Reservation terms (stored on reserved vehicles; cleared on release)
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS reservation_price_term text
    CHECK (reservation_price_term IS NULL OR reservation_price_term IN ('fob', 'cf', 'cif')),
  ADD COLUMN IF NOT EXISTS reservation_shipment_term text
    CHECK (
      reservation_shipment_term IS NULL
      OR reservation_shipment_term IN ('dhl', 'roro', 'container_20ft', 'container_40ft')
    );

COMMENT ON COLUMN public.vehicles.reservation_price_term IS 'Incoterm for active reservation: fob | cf (C&F) | cif.';
COMMENT ON COLUMN public.vehicles.reservation_shipment_term IS 'Shipment mode for active reservation; aligns with export_shipments.mode.';

ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS reservation_price_term text
    CHECK (reservation_price_term IS NULL OR reservation_price_term IN ('fob', 'cf', 'cif')),
  ADD COLUMN IF NOT EXISTS reservation_shipment_term text
    CHECK (
      reservation_shipment_term IS NULL
      OR reservation_shipment_term IN ('dhl', 'roro', 'container_20ft', 'container_40ft')
    );

-- ---------------------------------------------------------------------------
-- 4) Export shipment documents (BOL, export cert, waybill, courier, inspection)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.export_shipment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_shipment_id uuid NOT NULL REFERENCES public.export_shipments(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (
    doc_type IN (
      'bill_of_lading',
      'export_certificate',
      'waybill',
      'courier',
      'inspection_certificate'
    )
  ),
  country_code text CHECK (
    country_code IS NULL OR char_length(btrim(country_code)) BETWEEN 2 AND 8
  ),
  country_name text CHECK (
    country_name IS NULL OR char_length(btrim(country_name)) BETWEEN 1 AND 120
  ),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR (size_bytes >= 0 AND size_bytes <= 26214400)),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  uploaded_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_shipment_documents_inspection_country_chk CHECK (
    (doc_type = 'inspection_certificate' AND country_code IS NOT NULL)
    OR (doc_type <> 'inspection_certificate')
  )
);

-- One file per single-slot type; inspection certs allow many (per country).
CREATE UNIQUE INDEX IF NOT EXISTS export_shipment_documents_single_slot_uidx
  ON public.export_shipment_documents (export_shipment_id, doc_type)
  WHERE doc_type <> 'inspection_certificate';

CREATE INDEX IF NOT EXISTS export_shipment_documents_shipment_idx
  ON public.export_shipment_documents (export_shipment_id);

CREATE INDEX IF NOT EXISTS export_shipment_documents_type_idx
  ON public.export_shipment_documents (doc_type);

CREATE INDEX IF NOT EXISTS export_shipment_documents_country_idx
  ON public.export_shipment_documents (country_code)
  WHERE country_code IS NOT NULL;

ALTER TABLE public.export_shipment_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_export_shipment_documents ON public.export_shipment_documents;
CREATE POLICY workspace_manage_export_shipment_documents
  ON public.export_shipment_documents FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.export_shipment_documents FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_shipment_documents TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'export-shipment-documents',
  'export-shipment-documents',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS export_shipment_documents_storage_select ON storage.objects;
CREATE POLICY export_shipment_documents_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'export-shipment-documents' AND (SELECT private.is_ops_user()));

DROP POLICY IF EXISTS export_shipment_documents_storage_insert ON storage.objects;
CREATE POLICY export_shipment_documents_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'export-shipment-documents'
  AND owner_id = (SELECT auth.uid()::text)
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  AND (SELECT private.is_ops_user())
);

DROP POLICY IF EXISTS export_shipment_documents_storage_delete ON storage.objects;
CREATE POLICY export_shipment_documents_storage_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'export-shipment-documents'
  AND (
    (SELECT private.is_platform_admin())
    OR owner_id = (SELECT auth.uid()::text)
    OR (SELECT private.is_ops_user())
  )
);

-- ---------------------------------------------------------------------------
-- 5) Export shipment RPCs (modes + DHL without vehicles)
-- ---------------------------------------------------------------------------
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

  event_type := CASE p_status
    WHEN 'booked' THEN 'export_request'
    WHEN 'loaded' THEN CASE ship.mode
      WHEN 'container_20ft' THEN 'container_20ft'
      WHEN 'container_40ft' THEN 'container_40ft'
      WHEN 'roro' THEN 'roro'
      WHEN 'dhl' THEN 'parts_shipping'
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
        jsonb_build_object('export_shipment_id', ship.id, 'status', p_status, 'mode', ship.mode)
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
          NULL;
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
  v_mode text := COALESCE(NULLIF(btrim(p_mode), ''), 'roro');
  vehicle_count integer := COALESCE(cardinality(p_vehicle_ids), 0);
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
  -- DHL (small parts) may have no vehicles; vehicle modes require at least one.
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
  v_mode text;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  SELECT * INTO ship FROM public.export_shipments WHERE id = p_shipment_id FOR UPDATE;
  IF ship.id IS NULL THEN RAISE EXCEPTION 'Shipment not found'; END IF;
  IF ship.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Completed or cancelled shipments cannot be edited';
  END IF;

  v_mode := COALESCE(NULLIF(btrim(p_mode), ''), ship.mode);
  IF v_mode NOT IN ('dhl', 'roro', 'container_20ft', 'container_40ft') THEN
    RAISE EXCEPTION 'Invalid shipment mode';
  END IF;

  UPDATE public.export_shipments SET
    customer_id = p_customer_id,
    mode = v_mode,
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

REVOKE ALL ON FUNCTION public.create_export_shipment(uuid, text, text, text, text, text, text, text, text, date, date, text, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_export_shipment(uuid, text, text, text, text, text, text, text, text, date, date, text, uuid[], boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.set_export_shipment_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_export_shipment_status(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_export_shipment(uuid, uuid, text, text, text, text, text, text, text, text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_export_shipment(uuid, uuid, text, text, text, text, text, text, text, text, date, date, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Reservation RPCs with price term + shipment term
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reserve_vehicle_stock(uuid, uuid);

CREATE OR REPLACE FUNCTION public.reserve_vehicle_stock(
  p_vehicle_id uuid,
  p_customer_id uuid,
  p_price_term text DEFAULT NULL,
  p_shipment_term text DEFAULT NULL
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

  UPDATE public.vehicles SET
    stock_status = 'reserved',
    reserved_customer_id = p_customer_id,
    is_published = false,
    reservation_price_term = v_price_term,
    reservation_shipment_term = v_shipment_term,
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

REVOKE ALL ON FUNCTION public.reserve_vehicle_stock(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_vehicle_stock(uuid, uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.create_vehicle_reservation_proforma(uuid, uuid, numeric, text, numeric, date, text, text);

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
  p_shipment_term text DEFAULT NULL
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

  UPDATE public.vehicles SET
    stock_status = 'reserved',
    reserved_customer_id = p_customer_id,
    is_published = false,
    reservation_price_term = v_price_term,
    reservation_shipment_term = v_shipment_term,
    updated_at = now()
  WHERE id = p_vehicle_id
    AND stock_status = 'available'
  RETURNING * INTO veh;

  IF veh.id IS NULL THEN
    RAISE EXCEPTION 'Vehicle is not available to reserve';
  END IF;

  -- Prefer explicit unit price; else price for selected Incoterm; else list price.
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
        'tax_rate', COALESCE(p_tax_rate, 5),
        'inventory_type', 'vehicle',
        'part_id', null,
        'vehicle_id', veh.id,
        'inventory_reference', v_ref
      )
    )
  );

  RETURN jsonb_build_object(
    'vehicle_id', veh.id,
    'invoice_id', invoice_id,
    'stock_status', 'reserved',
    'is_published', false,
    'reservation_price_term', v_price_term,
    'reservation_shipment_term', v_shipment_term
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_vehicle_reservation_proforma(uuid, uuid, numeric, text, numeric, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vehicle_reservation_proforma(uuid, uuid, numeric, text, numeric, date, text, text, text, text) TO authenticated;

-- Clear reservation terms on release (keep phase_31 republish behaviour).
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

  UPDATE public.vehicles SET
    stock_status = 'available',
    reserved_customer_id = NULL,
    reservation_price_term = NULL,
    reservation_shipment_term = NULL,
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

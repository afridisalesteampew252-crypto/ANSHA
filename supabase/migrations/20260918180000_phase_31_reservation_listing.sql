/* Phase 31: listing publish helpers + reserve-with-proforma for sales. */

-- Publish only when available; unpublish when reserved/sold (guards).
CREATE OR REPLACE FUNCTION public.set_vehicle_public_listing(
  p_vehicle_id uuid,
  p_publish boolean
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

  SELECT * INTO row FROM public.vehicles WHERE id = p_vehicle_id FOR UPDATE;
  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  IF p_publish THEN
    IF row.stock_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'Only available vehicles can be published';
    END IF;
    UPDATE public.vehicles SET
      is_published = true,
      updated_at = now()
    WHERE id = p_vehicle_id
    RETURNING * INTO row;
  ELSE
    UPDATE public.vehicles SET
      is_published = false,
      updated_at = now()
    WHERE id = p_vehicle_id
    RETURNING * INTO row;
  END IF;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_vehicle_public_listing(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_vehicle_public_listing(uuid, boolean) TO authenticated;

-- One-shot: reserve vehicle for customer and create proforma invoice draft.
CREATE OR REPLACE FUNCTION public.create_vehicle_reservation_proforma(
  p_vehicle_id uuid,
  p_customer_id uuid,
  p_unit_price numeric,
  p_currency text,
  p_tax_rate numeric,
  p_due_date date,
  p_notes text,
  p_reference text
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
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  SELECT * INTO cust FROM public.customers WHERE id = p_customer_id;
  IF cust.id IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;

  -- Reserve (same rules as reserve_vehicle_stock)
  UPDATE public.vehicles SET
    stock_status = 'reserved',
    reserved_customer_id = p_customer_id,
    is_published = false,
    updated_at = now()
  WHERE id = p_vehicle_id
    AND stock_status = 'available'
  RETURNING * INTO veh;

  IF veh.id IS NULL THEN
    RAISE EXCEPTION 'Vehicle is not available to reserve';
  END IF;

  v_price := COALESCE(p_unit_price, veh.price, 0);
  v_currency := upper(COALESCE(NULLIF(btrim(p_currency), ''), veh.currency, 'AED'));
  v_ref := COALESCE(
    NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(veh.stock_number), ''),
    NULLIF(btrim(veh.chassis_number), ''),
    NULLIF(btrim(veh.chassis_code), ''),
    left(veh.id::text, 8)
  );
  v_desc := veh.title || E'\nReference: ' || v_ref;

  invoice_id := public.create_invoice_v3(
    NULL, -- auto INV number
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
    'is_published', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_vehicle_reservation_proforma(uuid, uuid, numeric, text, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vehicle_reservation_proforma(uuid, uuid, numeric, text, numeric, date, text, text) TO authenticated;

-- When releasing a reservation, optionally re-publish (default false keeps prior behavior).
DROP FUNCTION IF EXISTS public.release_vehicle_reservation(uuid);

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

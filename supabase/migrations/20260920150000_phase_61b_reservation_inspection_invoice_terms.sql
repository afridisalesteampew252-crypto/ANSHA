-- Phase 61b: reservation inspection Yes/No + invoice header price/shipment terms.
-- Additive on top of applied Phase 61 (export docs / Incoterms / reservation terms).

-- ---------------------------------------------------------------------------
-- 1) Reservation inspection on vehicles + parts
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS reservation_inspection_required boolean;

ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS reservation_inspection_required boolean;

COMMENT ON COLUMN public.vehicles.reservation_inspection_required IS
  'Whether inspection is required for the active reservation (Yes/No); cleared on release.';
COMMENT ON COLUMN public.parts.reservation_inspection_required IS
  'Whether inspection is required for the active reservation (Yes/No); cleared on release.';

-- ---------------------------------------------------------------------------
-- 2) Invoice header trade terms (shown on print / PDF / verify)
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS price_term text
    CHECK (price_term IS NULL OR price_term IN ('fob', 'cf', 'cif')),
  ADD COLUMN IF NOT EXISTS shipment_term text
    CHECK (
      shipment_term IS NULL
      OR shipment_term IN ('dhl', 'roro', 'container_20ft', 'container_40ft')
    );

COMMENT ON COLUMN public.invoices.price_term IS 'Document Incoterm: fob | cf (C&F) | cif.';
COMMENT ON COLUMN public.invoices.shipment_term IS
  'Document shipment mode; aligns with export_shipments.mode / reservation_shipment_term.';

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS price_term text
    CHECK (price_term IS NULL OR price_term IN ('fob', 'cf', 'cif'));

COMMENT ON COLUMN public.invoice_items.price_term IS
  'Optional per-line Incoterm when unit price was taken from a catalog quote.';

-- ---------------------------------------------------------------------------
-- 3) Reservation RPCs: inspection required
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reserve_vehicle_stock(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.reserve_vehicle_stock(
  p_vehicle_id uuid,
  p_customer_id uuid,
  p_price_term text DEFAULT NULL,
  p_shipment_term text DEFAULT NULL,
  p_inspection_required boolean DEFAULT NULL
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
    reservation_inspection_required = p_inspection_required,
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

REVOKE ALL ON FUNCTION public.reserve_vehicle_stock(uuid, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_vehicle_stock(uuid, uuid, text, text, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.create_vehicle_reservation_proforma(uuid, uuid, numeric, text, numeric, date, text, text, text, text);

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
  p_inspection_required boolean DEFAULT NULL
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
    reservation_inspection_required = p_inspection_required,
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
        'inventory_reference', v_ref,
        'price_term', v_price_term
      )
    ),
    v_price_term,
    v_shipment_term
  );

  RETURN jsonb_build_object(
    'vehicle_id', veh.id,
    'invoice_id', invoice_id,
    'stock_status', 'reserved',
    'is_published', false,
    'reservation_price_term', v_price_term,
    'reservation_shipment_term', v_shipment_term,
    'reservation_inspection_required', p_inspection_required
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_vehicle_reservation_proforma(uuid, uuid, numeric, text, numeric, date, text, text, text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vehicle_reservation_proforma(uuid, uuid, numeric, text, numeric, date, text, text, text, text, boolean)
  TO authenticated;

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
    reservation_inspection_required = NULL,
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

-- ---------------------------------------------------------------------------
-- 4) create_invoice_v3 / update_invoice_v4 — header + line price_term
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_invoice_v3(
  text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.create_invoice_v3(
  p_invoice_number text,
  p_document_type text,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_company text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_tax_registration_number text,
  p_issue_date date,
  p_due_date date,
  p_currency text,
  p_reference text,
  p_notes text,
  p_terms text,
  p_items jsonb,
  p_price_term text DEFAULT NULL,
  p_shipment_term text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  new_invoice_id uuid;
  item jsonb;
  item_count integer := 0;
  normalized_invoice_number text := NULLIF(upper(btrim(p_invoice_number)), '');
  item_type text;
  item_part_id uuid;
  item_vehicle_id uuid;
  item_price_term text;
  v_price_term text := NULLIF(lower(btrim(COALESCE(p_price_term, ''))), '');
  v_shipment_term text := NULLIF(lower(btrim(COALESCE(p_shipment_term, ''))), '');
BEGIN
  IF NOT private.is_workspace_user() THEN RAISE EXCEPTION 'Workspace access required'; END IF;

  IF private.is_field_agent() THEN
    IF p_document_type IS DISTINCT FROM 'proforma_invoice' THEN
      RAISE EXCEPTION 'Field agents may only create proforma invoices';
    END IF;
  ELSIF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Invoice create not allowed for this role';
  END IF;

  IF btrim(COALESCE(p_customer_name, '')) = '' THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF p_due_date < p_issue_date THEN RAISE EXCEPTION 'Due date cannot be before issue date'; END IF;
  IF p_document_type NOT IN ('delivery_note','tax_invoice','proforma_invoice','quotation','purchase_invoice','commercial_invoice') THEN
    RAISE EXCEPTION 'Invalid document type';
  END IF;
  IF normalized_invoice_number IS NOT NULL AND normalized_invoice_number !~ '^[A-Z0-9][A-Z0-9/_-]{2,39}$' THEN
    RAISE EXCEPTION 'Invoice number may contain only letters, numbers, slash, underscore, and hyphen';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one invoice item is required';
  END IF;
  IF v_price_term IS NOT NULL AND v_price_term NOT IN ('fob', 'cf', 'cif') THEN
    RAISE EXCEPTION 'Invalid price term';
  END IF;
  IF v_shipment_term IS NOT NULL AND v_shipment_term NOT IN ('dhl', 'roro', 'container_20ft', 'container_40ft') THEN
    RAISE EXCEPTION 'Invalid shipment term';
  END IF;

  INSERT INTO public.invoices (
    invoice_number, document_type, customer_id, customer_name, customer_company,
    customer_email, customer_phone, customer_address, customer_tax_registration_number,
    seller_name, seller_tax_registration_number, seller_address, issue_date, due_date,
    currency, reference, notes, terms, status, created_by, price_term, shipment_term
  ) VALUES (
    normalized_invoice_number, p_document_type, p_customer_id, btrim(p_customer_name),
    NULLIF(btrim(p_customer_company), ''), NULLIF(btrim(p_customer_email), ''),
    NULLIF(btrim(p_customer_phone), ''), NULLIF(btrim(p_customer_address), ''),
    NULLIF(btrim(p_customer_tax_registration_number), ''), '', '', '', p_issue_date,
    p_due_date, upper(p_currency), NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(p_notes), ''), NULLIF(btrim(p_terms), ''), 'draft', (SELECT auth.uid()),
    v_price_term, v_shipment_term
  ) RETURNING id INTO new_invoice_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF btrim(COALESCE(item->>'description', '')) = '' THEN
      RAISE EXCEPTION 'Every line needs a description';
    END IF;
    item_type := NULLIF(item->>'inventory_type', '');
    item_part_id := CASE WHEN item_type = 'part' AND NULLIF(item->>'part_id', '') IS NOT NULL THEN (item->>'part_id')::uuid ELSE NULL END;
    item_vehicle_id := CASE WHEN item_type = 'vehicle' AND NULLIF(item->>'vehicle_id', '') IS NOT NULL THEN (item->>'vehicle_id')::uuid ELSE NULL END;
    item_price_term := NULLIF(lower(btrim(COALESCE(item->>'price_term', ''))), '');
    IF item_price_term IS NOT NULL AND item_price_term NOT IN ('fob', 'cf', 'cif') THEN
      RAISE EXCEPTION 'Invalid line price term';
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, unit_price, discount_percent, tax_rate, sort_order,
      inventory_type, part_id, vehicle_id, inventory_reference, price_term
    ) VALUES (
      new_invoice_id, btrim(item->>'description'),
      COALESCE((item->>'quantity')::numeric, 1),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount_percent')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 5),
      item_count, item_type, item_part_id, item_vehicle_id,
      NULLIF(btrim(item->>'inventory_reference'), ''),
      item_price_term
    );
    item_count := item_count + 1;
  END LOOP;

  PERFORM public.apply_invoice_stock(new_invoice_id);
  RETURN new_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_v3(
  text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_v3(
  text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, text, text
) TO authenticated;

DROP FUNCTION IF EXISTS public.update_invoice_v4(
  uuid, text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.update_invoice_v4(
  p_invoice_id uuid,
  p_invoice_number text,
  p_document_type text,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_company text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_tax_registration_number text,
  p_issue_date date,
  p_due_date date,
  p_currency text,
  p_reference text,
  p_notes text,
  p_terms text,
  p_items jsonb,
  p_price_term text DEFAULT NULL,
  p_shipment_term text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_invoice public.invoices%ROWTYPE;
  item jsonb;
  item_count integer := 0;
  normalized_invoice_number text := NULLIF(upper(btrim(p_invoice_number)), '');
  item_type text;
  item_part_id uuid;
  item_vehicle_id uuid;
  item_price_term text;
  prospective_total numeric(14,2);
  v_price_term text := NULLIF(lower(btrim(COALESCE(p_price_term, ''))), '');
  v_shipment_term text := NULLIF(lower(btrim(COALESCE(p_shipment_term, ''))), '');
BEGIN
  IF NOT private.is_workspace_user() THEN RAISE EXCEPTION 'Workspace access required'; END IF;
  SELECT * INTO current_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found or access denied'; END IF;

  IF private.is_field_agent() THEN
    IF current_invoice.document_type IS DISTINCT FROM 'proforma_invoice'
       OR current_invoice.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Field agents may only edit draft proforma invoices';
    END IF;
    IF p_document_type IS DISTINCT FROM 'proforma_invoice' THEN
      RAISE EXCEPTION 'Field agents may only keep document type as proforma';
    END IF;
    IF current_invoice.created_by IS DISTINCT FROM (SELECT auth.uid())
       AND NOT EXISTS (
         SELECT 1 FROM public.customers c
         WHERE c.id = current_invoice.customer_id AND c.owner_id = (SELECT auth.uid())
       )
    THEN
      RAISE EXCEPTION 'Field agents may only edit their own-book proforma invoices';
    END IF;
  ELSIF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Invoice update not allowed for this role';
  END IF;

  IF btrim(COALESCE(p_customer_name, '')) = '' THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF p_due_date < p_issue_date THEN RAISE EXCEPTION 'Due date cannot be before issue date'; END IF;
  IF p_document_type NOT IN ('delivery_note','tax_invoice','proforma_invoice','quotation','purchase_invoice','commercial_invoice') THEN
    RAISE EXCEPTION 'Invalid document type';
  END IF;
  IF normalized_invoice_number IS NULL OR normalized_invoice_number !~ '^[A-Z0-9][A-Z0-9/_-]{2,39}$' THEN
    RAISE EXCEPTION 'Invoice number may contain only letters, numbers, slash, underscore, and hyphen';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one invoice item is required';
  END IF;
  IF v_price_term IS NOT NULL AND v_price_term NOT IN ('fob', 'cf', 'cif') THEN
    RAISE EXCEPTION 'Invalid price term';
  END IF;
  IF v_shipment_term IS NOT NULL AND v_shipment_term NOT IN ('dhl', 'roro', 'container_20ft', 'container_40ft') THEN
    RAISE EXCEPTION 'Invalid shipment term';
  END IF;

  SELECT COALESCE(sum(round(
    (
      COALESCE((value->>'quantity')::numeric, 1)
      * COALESCE((value->>'unit_price')::numeric, 0)
      * (1 - COALESCE((value->>'discount_percent')::numeric, 0) / 100)
    )
    * (1 + COALESCE((value->>'tax_rate')::numeric, 5) / 100)
  , 2)), 0)
  INTO prospective_total
  FROM jsonb_array_elements(p_items);

  IF current_invoice.amount_paid > 0 AND upper(p_currency) <> current_invoice.currency THEN
    RAISE EXCEPTION 'Currency cannot change after a payment has been recorded';
  END IF;
  IF prospective_total < current_invoice.amount_paid THEN
    RAISE EXCEPTION 'Invoice total cannot be lower than the amount already paid';
  END IF;

  UPDATE public.invoices SET
    invoice_number = normalized_invoice_number,
    document_type = p_document_type,
    customer_id = p_customer_id,
    customer_name = btrim(p_customer_name),
    customer_company = NULLIF(btrim(p_customer_company), ''),
    customer_email = NULLIF(btrim(p_customer_email), ''),
    customer_phone = NULLIF(btrim(p_customer_phone), ''),
    customer_address = NULLIF(btrim(p_customer_address), ''),
    customer_tax_registration_number = NULLIF(btrim(p_customer_tax_registration_number), ''),
    issue_date = p_issue_date,
    due_date = p_due_date,
    currency = upper(p_currency),
    reference = NULLIF(btrim(p_reference), ''),
    notes = NULLIF(btrim(p_notes), ''),
    terms = NULLIF(btrim(p_terms), ''),
    price_term = v_price_term,
    shipment_term = v_shipment_term
  WHERE id = p_invoice_id;

  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF btrim(COALESCE(item->>'description', '')) = '' THEN
      RAISE EXCEPTION 'Every line needs a description';
    END IF;
    item_type := NULLIF(item->>'inventory_type', '');
    item_part_id := CASE WHEN item_type = 'part' AND NULLIF(item->>'part_id', '') IS NOT NULL THEN (item->>'part_id')::uuid ELSE NULL END;
    item_vehicle_id := CASE WHEN item_type = 'vehicle' AND NULLIF(item->>'vehicle_id', '') IS NOT NULL THEN (item->>'vehicle_id')::uuid ELSE NULL END;
    item_price_term := NULLIF(lower(btrim(COALESCE(item->>'price_term', ''))), '');
    IF item_price_term IS NOT NULL AND item_price_term NOT IN ('fob', 'cf', 'cif') THEN
      RAISE EXCEPTION 'Invalid line price term';
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, unit_price, discount_percent, tax_rate, sort_order,
      inventory_type, part_id, vehicle_id, inventory_reference, price_term
    ) VALUES (
      p_invoice_id, btrim(item->>'description'),
      COALESCE((item->>'quantity')::numeric, 1),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount_percent')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 5),
      item_count, item_type, item_part_id, item_vehicle_id,
      NULLIF(btrim(item->>'inventory_reference'), ''),
      item_price_term
    );
    item_count := item_count + 1;
  END LOOP;

  RETURN p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_v4(
  uuid, text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_invoice_v4(
  uuid, text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, text, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Public verify: include price/shipment terms
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_invoice(p_verification_code uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'valid', true,
      'verification_code', invoice.verification_code,
      'verified_at', now(),
      'document_type', invoice.document_type,
      'invoice_number', invoice.invoice_number,
      'status', invoice.status,
      'issue_date', invoice.issue_date,
      'due_date', invoice.due_date,
      'reference', invoice.reference,
      'price_term', invoice.price_term,
      'shipment_term', invoice.shipment_term,
      'seller', jsonb_build_object(
        'name', invoice.seller_name,
        'tax_registration_number', invoice.seller_tax_registration_number,
        'address', invoice.seller_address
      ),
      'customer', jsonb_build_object(
        'name', invoice.customer_name,
        'company', invoice.customer_company,
        'tax_registration_number', invoice.customer_tax_registration_number
      ),
      'currency', invoice.currency,
      'subtotal', invoice.subtotal,
      'discount_amount', invoice.discount_amount,
      'tax_amount', invoice.tax_amount,
      'total_amount', invoice.total_amount,
      'amount_paid', invoice.amount_paid,
      'balance_due', invoice.balance_due,
      'provider_status', invoice.provider_status,
      'reported_at', invoice.reported_at,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'description', item.description,
          'quantity', item.quantity,
          'unit_price', item.unit_price,
          'discount_percent', item.discount_percent,
          'tax_rate', item.tax_rate,
          'line_total', item.line_total,
          'price_term', item.price_term
        ) ORDER BY item.sort_order, item.created_at)
        FROM public.invoice_items item
        WHERE item.invoice_id = invoice.id
      ), '[]'::jsonb)
    )
    FROM public.invoices invoice
    WHERE invoice.verification_code = p_verification_code
      AND invoice.verification_enabled
  ), jsonb_build_object('valid', false));
$$;

REVOKE ALL ON FUNCTION public.verify_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_invoice(uuid) TO anon, authenticated;

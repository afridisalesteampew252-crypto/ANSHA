/* Phase 28: suppliers master, purchase-costed inventory, GRN receipts, sales stock sync. */

-- ---------------------------------------------------------------------------
-- Suppliers master
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code text NOT NULL,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 200),
  trn text CHECK (trn IS NULL OR char_length(trim(trn)) BETWEEN 1 AND 40),
  country text CHECK (country IS NULL OR char_length(trim(country)) BETWEEN 1 AND 80),
  email text CHECK (email IS NULL OR char_length(trim(email)) BETWEEN 3 AND 320),
  phone text CHECK (phone IS NULL OR char_length(trim(phone)) BETWEEN 1 AND 40),
  address text CHECK (address IS NULL OR char_length(address) <= 1000),
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_supplier_code_uidx UNIQUE (supplier_code)
);

CREATE INDEX IF NOT EXISTS suppliers_name_idx ON public.suppliers (lower(name));
CREATE INDEX IF NOT EXISTS suppliers_active_idx ON public.suppliers (is_active) WHERE is_active = true;

DROP TRIGGER IF EXISTS suppliers_updated_at ON public.suppliers;
CREATE TRIGGER suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_suppliers ON public.suppliers;
CREATE POLICY workspace_manage_suppliers
  ON public.suppliers FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.suppliers FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;

CREATE TABLE IF NOT EXISTS public.supplier_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

ALTER TABLE public.supplier_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_direct_supplier_sequence_access ON public.supplier_sequences;
CREATE POLICY deny_direct_supplier_sequence_access
  ON public.supplier_sequences FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.supplier_sequences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_supplier_code()
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
  INSERT INTO public.supplier_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.supplier_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  RETURN 'SUP-' || fy::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_supplier_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_supplier_code() TO authenticated;

-- ---------------------------------------------------------------------------
-- Cost / supplier columns on vehicles & parts
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS purchase_price numeric(14, 2) CHECK (purchase_price IS NULL OR purchase_price >= 0),
  ADD COLUMN IF NOT EXISTS purchase_currency text DEFAULT 'AED' CHECK (purchase_currency IS NULL OR char_length(purchase_currency) = 3),
  ADD COLUMN IF NOT EXISTS purchase_date date,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_invoice_id uuid REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS landed_cost numeric(14, 2) CHECK (landed_cost IS NULL OR landed_cost >= 0),
  ADD COLUMN IF NOT EXISTS reserved_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS purchase_price numeric(14, 2) CHECK (purchase_price IS NULL OR purchase_price >= 0),
  ADD COLUMN IF NOT EXISTS purchase_currency text DEFAULT 'AED' CHECK (purchase_currency IS NULL OR char_length(purchase_currency) = 3),
  ADD COLUMN IF NOT EXISTS purchase_date date,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_invoice_id uuid REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS landed_cost numeric(14, 2) CHECK (landed_cost IS NULL OR landed_cost >= 0),
  ADD COLUMN IF NOT EXISTS reserved_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vehicles_supplier_id_idx ON public.vehicles (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vehicles_reserved_customer_id_idx ON public.vehicles (reserved_customer_id) WHERE reserved_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS parts_supplier_id_idx ON public.parts (supplier_id) WHERE supplier_id IS NOT NULL;

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS supplier_invoices_supplier_id_idx
  ON public.supplier_invoices (supplier_id) WHERE supplier_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Inventory receipts (GRN)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_receipt_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

ALTER TABLE public.inventory_receipt_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_direct_inventory_receipt_sequence_access ON public.inventory_receipt_sequences;
CREATE POLICY deny_direct_inventory_receipt_sequence_access
  ON public.inventory_receipt_sequences FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.inventory_receipt_sequences FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.inventory_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL,
  received_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_invoice_id uuid REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_receipts_receipt_number_uidx UNIQUE (receipt_number)
);

CREATE TABLE IF NOT EXISTS public.inventory_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.inventory_receipts(id) ON DELETE CASCADE,
  inventory_type text NOT NULL CHECK (inventory_type IN ('part', 'vehicle')),
  part_id uuid REFERENCES public.parts(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  quantity numeric(14, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost numeric(14, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_receipt_lines_link_check CHECK (
    (inventory_type = 'part' AND part_id IS NOT NULL AND vehicle_id IS NULL)
    OR (inventory_type = 'vehicle' AND vehicle_id IS NOT NULL AND part_id IS NULL AND quantity = 1)
  )
);

CREATE INDEX IF NOT EXISTS inventory_receipts_supplier_idx ON public.inventory_receipts (supplier_id, received_date DESC);
CREATE INDEX IF NOT EXISTS inventory_receipt_lines_receipt_idx ON public.inventory_receipt_lines (receipt_id);
CREATE INDEX IF NOT EXISTS inventory_receipt_lines_vehicle_idx ON public.inventory_receipt_lines (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_receipt_lines_part_idx ON public.inventory_receipt_lines (part_id) WHERE part_id IS NOT NULL;

DROP TRIGGER IF EXISTS inventory_receipts_updated_at ON public.inventory_receipts;
CREATE TRIGGER inventory_receipts_updated_at
BEFORE UPDATE ON public.inventory_receipts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.inventory_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipt_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_inventory_receipts ON public.inventory_receipts;
CREATE POLICY workspace_manage_inventory_receipts
  ON public.inventory_receipts FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS workspace_manage_inventory_receipt_lines ON public.inventory_receipt_lines;
CREATE POLICY workspace_manage_inventory_receipt_lines
  ON public.inventory_receipt_lines FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.inventory_receipts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_receipts TO authenticated;
REVOKE ALL ON public.inventory_receipt_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_receipt_lines TO authenticated;

CREATE OR REPLACE FUNCTION public.create_inventory_receipt(
  p_received_date date,
  p_supplier_id uuid,
  p_supplier_invoice_id uuid,
  p_currency text,
  p_notes text,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  fy integer := EXTRACT(YEAR FROM (now() AT TIME ZONE 'UTC'))::integer;
  n integer;
  receipt_id uuid;
  receipt_no text;
  line jsonb;
  v_type text;
  v_part uuid;
  v_vehicle uuid;
  v_qty numeric;
  v_cost numeric;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one receipt line is required';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id) THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;

  INSERT INTO public.inventory_receipt_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.inventory_receipt_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  receipt_no := 'GRN-' || fy::text || '-' || lpad(n::text, 4, '0');

  INSERT INTO public.inventory_receipts (
    receipt_number, received_date, supplier_id, supplier_invoice_id, currency, notes, created_by
  ) VALUES (
    receipt_no,
    COALESCE(p_received_date, (now() AT TIME ZONE 'UTC')::date),
    p_supplier_id,
    p_supplier_invoice_id,
    upper(COALESCE(NULLIF(btrim(p_currency), ''), 'AED')),
    NULLIF(btrim(p_notes), ''),
    (SELECT auth.uid())
  ) RETURNING id INTO receipt_id;

  FOR line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_type := line->>'inventory_type';
    v_part := CASE WHEN NULLIF(line->>'part_id', '') IS NOT NULL THEN (line->>'part_id')::uuid ELSE NULL END;
    v_vehicle := CASE WHEN NULLIF(line->>'vehicle_id', '') IS NOT NULL THEN (line->>'vehicle_id')::uuid ELSE NULL END;
    v_qty := COALESCE((line->>'quantity')::numeric, 1);
    v_cost := COALESCE((line->>'unit_cost')::numeric, 0);

    IF v_type NOT IN ('part', 'vehicle') THEN
      RAISE EXCEPTION 'inventory_type must be part or vehicle';
    END IF;

    INSERT INTO public.inventory_receipt_lines (
      receipt_id, inventory_type, part_id, vehicle_id, quantity, unit_cost, notes
    ) VALUES (
      receipt_id, v_type, v_part, v_vehicle,
      CASE WHEN v_type = 'vehicle' THEN 1 ELSE v_qty END,
      v_cost,
      NULLIF(btrim(line->>'notes'), '')
    );

    IF v_type = 'vehicle' THEN
      IF v_vehicle IS NULL THEN RAISE EXCEPTION 'vehicle_id required'; END IF;
      UPDATE public.vehicles SET
        purchase_price = v_cost,
        purchase_currency = upper(COALESCE(NULLIF(btrim(p_currency), ''), 'AED')),
        purchase_date = COALESCE(p_received_date, (now() AT TIME ZONE 'UTC')::date),
        supplier_id = COALESCE(p_supplier_id, supplier_id),
        supplier_invoice_id = COALESCE(p_supplier_invoice_id, supplier_invoice_id),
        landed_cost = COALESCE(landed_cost, v_cost),
        stock_status = CASE WHEN stock_status = 'sold' THEN stock_status ELSE 'available' END,
        updated_at = now()
      WHERE id = v_vehicle;
    ELSIF v_type = 'part' THEN
      IF v_part IS NULL THEN RAISE EXCEPTION 'part_id required'; END IF;
      UPDATE public.parts SET
        purchase_price = v_cost,
        purchase_currency = upper(COALESCE(NULLIF(btrim(p_currency), ''), 'AED')),
        purchase_date = COALESCE(p_received_date, (now() AT TIME ZONE 'UTC')::date),
        supplier_id = COALESCE(p_supplier_id, supplier_id),
        supplier_invoice_id = COALESCE(p_supplier_invoice_id, supplier_invoice_id),
        landed_cost = COALESCE(landed_cost, v_cost),
        quantity = quantity + v_qty,
        stock_status = CASE WHEN stock_status = 'sold' THEN 'available' ELSE stock_status END,
        updated_at = now()
      WHERE id = v_part;
    END IF;
  END LOOP;

  RETURN receipt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_inventory_receipt(date, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_receipt(date, uuid, uuid, text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Sales stock: reserve / release / apply on receivable invoices
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_vehicle_stock(
  p_vehicle_id uuid,
  p_customer_id uuid
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
  IF p_customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;

  UPDATE public.vehicles SET
    stock_status = 'reserved',
    reserved_customer_id = p_customer_id,
    is_published = false,
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

CREATE OR REPLACE FUNCTION public.release_vehicle_reservation(p_vehicle_id uuid)
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

REVOKE ALL ON FUNCTION public.reserve_vehicle_stock(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_vehicle_stock(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.release_vehicle_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_vehicle_reservation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.apply_receivable_invoice_stock(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  item record;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id;
  IF inv.id IS NULL THEN RETURN; END IF;
  IF inv.document_type NOT IN ('tax_invoice', 'commercial_invoice') THEN RETURN; END IF;
  IF inv.status = 'cancelled' OR inv.status = 'draft' THEN RETURN; END IF;

  FOR item IN
    SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id
  LOOP
    IF item.inventory_type = 'vehicle' AND item.vehicle_id IS NOT NULL THEN
      UPDATE public.vehicles SET
        stock_status = 'sold',
        reserved_customer_id = COALESCE(inv.customer_id, reserved_customer_id),
        is_published = false,
        updated_at = now()
      WHERE id = item.vehicle_id
        AND stock_status IS DISTINCT FROM 'sold';
    ELSIF item.inventory_type = 'part' AND item.part_id IS NOT NULL THEN
      UPDATE public.parts SET
        quantity = GREATEST(0, quantity - COALESCE(item.quantity, 1)),
        stock_status = CASE
          WHEN GREATEST(0, quantity - COALESCE(item.quantity, 1)) <= 0 THEN 'sold'
          ELSE stock_status
        END,
        updated_at = now()
      WHERE id = item.part_id
        AND stock_status IS DISTINCT FROM 'sold';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_receivable_invoice_stock(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_invoice_stock(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;
  PERFORM private.apply_receivable_invoice_stock(p_invoice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_invoice_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_invoice_stock(uuid) TO authenticated;


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
  p_items jsonb
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
BEGIN
  IF NOT private.is_workspace_user() THEN RAISE EXCEPTION 'Workspace access required'; END IF;
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

  INSERT INTO public.invoices (
    invoice_number, document_type, customer_id, customer_name, customer_company,
    customer_email, customer_phone, customer_address, customer_tax_registration_number,
    seller_name, seller_tax_registration_number, seller_address, issue_date, due_date,
    currency, reference, notes, terms, created_by
  ) VALUES (
    normalized_invoice_number, p_document_type, p_customer_id, btrim(p_customer_name),
    NULLIF(btrim(p_customer_company), ''), NULLIF(btrim(p_customer_email), ''),
    NULLIF(btrim(p_customer_phone), ''), NULLIF(btrim(p_customer_address), ''),
    NULLIF(btrim(p_customer_tax_registration_number), ''), '', '', '', p_issue_date,
    p_due_date, upper(p_currency), NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(p_notes), ''), NULLIF(btrim(p_terms), ''), (SELECT auth.uid())
  ) RETURNING id INTO new_invoice_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF btrim(COALESCE(item->>'description', '')) = '' THEN
      RAISE EXCEPTION 'Every line needs a description';
    END IF;
    item_type := NULLIF(item->>'inventory_type', '');
    item_part_id := CASE WHEN item_type = 'part' AND NULLIF(item->>'part_id', '') IS NOT NULL THEN (item->>'part_id')::uuid ELSE NULL END;
    item_vehicle_id := CASE WHEN item_type = 'vehicle' AND NULLIF(item->>'vehicle_id', '') IS NOT NULL THEN (item->>'vehicle_id')::uuid ELSE NULL END;

    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, unit_price, discount_percent, tax_rate, sort_order,
      inventory_type, part_id, vehicle_id, inventory_reference
    ) VALUES (
      new_invoice_id, btrim(item->>'description'),
      COALESCE((item->>'quantity')::numeric, 1),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount_percent')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 5),
      item_count, item_type, item_part_id, item_vehicle_id,
      NULLIF(btrim(item->>'inventory_reference'), '')
    );
    item_count := item_count + 1;
  END LOOP;

  PERFORM private.apply_receivable_invoice_stock(new_invoice_id);
  RETURN new_invoice_id;
END;
$$;

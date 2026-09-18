/* Phase 29: purchase orders + 3-way match links (PO ↔ GRN ↔ supplier invoice). */

-- Replace empty legacy stub (different schema; 0 rows in production at apply time).
DROP TABLE IF EXISTS public.purchase_order_lines CASCADE;
DROP TABLE IF EXISTS public.purchase_orders CASCADE;

-- ---------------------------------------------------------------------------
-- Sequences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

ALTER TABLE public.purchase_order_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_direct_purchase_order_sequence_access ON public.purchase_order_sequences;
CREATE POLICY deny_direct_purchase_order_sequence_access
  ON public.purchase_order_sequences FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.purchase_order_sequences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_po_number()
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
  INSERT INTO public.purchase_order_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.purchase_order_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  RETURN 'PO-' || fy::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_po_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_po_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  order_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  vat_rate numeric(7, 4) NOT NULL DEFAULT 5 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  terms text CHECK (terms IS NULL OR char_length(terms) <= 5000),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'cancelled')),
  -- Match snapshot (refreshed when GRN / supplier invoice links change)
  amount_ordered numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount_ordered >= 0),
  amount_received numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount_received >= 0),
  amount_invoiced numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount_invoiced >= 0),
  amount_paid numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  qty_ordered numeric(14, 3) NOT NULL DEFAULT 0 CHECK (qty_ordered >= 0),
  qty_received numeric(14, 3) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  match_status text NOT NULL DEFAULT 'open' CHECK (
    match_status IN ('open', 'partially_received', 'received', 'invoiced', 'matched', 'cancelled')
  ),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_orders_po_number_uidx UNIQUE (po_number)
);

CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 500),
  inventory_type text CHECK (inventory_type IS NULL OR inventory_type IN ('part', 'vehicle')),
  part_id uuid REFERENCES public.parts(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  quantity numeric(14, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_rate numeric(7, 4) NOT NULL DEFAULT 5 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  sort_order integer NOT NULL DEFAULT 0,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_lines_link_check CHECK (
    inventory_type IS NULL
    OR (inventory_type = 'part' AND part_id IS NOT NULL AND vehicle_id IS NULL)
    OR (inventory_type = 'vehicle' AND vehicle_id IS NOT NULL AND part_id IS NULL AND quantity = 1)
  )
);

CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON public.purchase_orders (supplier_id, order_date DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_status_idx ON public.purchase_orders (status);
CREATE INDEX IF NOT EXISTS purchase_orders_match_status_idx ON public.purchase_orders (match_status);
CREATE INDEX IF NOT EXISTS purchase_order_lines_po_idx ON public.purchase_order_lines (purchase_order_id);

DROP TRIGGER IF EXISTS purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER purchase_orders_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_purchase_orders ON public.purchase_orders;
CREATE POLICY workspace_manage_purchase_orders
  ON public.purchase_orders FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS workspace_manage_purchase_order_lines ON public.purchase_order_lines;
CREATE POLICY workspace_manage_purchase_order_lines
  ON public.purchase_order_lines FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.purchase_orders FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
REVOKE ALL ON public.purchase_order_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated;

-- ---------------------------------------------------------------------------
-- Link GRN + supplier invoices to PO
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_receipts
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_receipt_lines
  ADD COLUMN IF NOT EXISTS purchase_order_line_id uuid REFERENCES public.purchase_order_lines(id) ON DELETE SET NULL;

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_receipts_po_idx
  ON public.inventory_receipts (purchase_order_id) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS supplier_invoices_po_idx
  ON public.supplier_invoices (purchase_order_id) WHERE purchase_order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Match refresh
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.refresh_purchase_order_match(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  po public.purchase_orders%ROWTYPE;
  v_qty_ordered numeric := 0;
  v_amount_ordered numeric := 0;
  v_qty_received numeric := 0;
  v_amount_received numeric := 0;
  v_amount_invoiced numeric := 0;
  v_match text;
BEGIN
  SELECT * INTO po FROM public.purchase_orders WHERE id = p_po_id;
  IF po.id IS NULL THEN RETURN; END IF;

  IF po.status = 'cancelled' THEN
    UPDATE public.purchase_orders SET
      match_status = 'cancelled',
      updated_at = now()
    WHERE id = p_po_id;
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(quantity), 0),
    COALESCE(SUM(quantity * unit_price * (1 + tax_rate / 100.0)), 0)
  INTO v_qty_ordered, v_amount_ordered
  FROM public.purchase_order_lines
  WHERE purchase_order_id = p_po_id;

  SELECT
    COALESCE(SUM(l.quantity), 0),
    COALESCE(SUM(l.quantity * l.unit_cost), 0)
  INTO v_qty_received, v_amount_received
  FROM public.inventory_receipt_lines l
  JOIN public.inventory_receipts r ON r.id = l.receipt_id
  WHERE r.purchase_order_id = p_po_id;

  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_amount_invoiced
  FROM public.supplier_invoices
  WHERE purchase_order_id = p_po_id;

  IF v_qty_received <= 0 AND v_amount_invoiced <= 0 THEN
    v_match := 'open';
  ELSIF v_qty_received > 0 AND v_qty_received + 0.0005 < v_qty_ordered AND v_amount_invoiced <= 0 THEN
    v_match := 'partially_received';
  ELSIF v_qty_received + 0.0005 >= v_qty_ordered AND v_amount_invoiced <= 0 THEN
    v_match := 'received';
  ELSIF v_amount_invoiced > 0 AND (
    v_qty_received + 0.0005 < v_qty_ordered
    OR abs(v_amount_invoiced - v_amount_ordered) > 0.05
    OR abs(v_amount_received - v_amount_ordered) > 0.05
  ) THEN
    v_match := 'invoiced';
  ELSIF v_amount_invoiced > 0
    AND v_qty_received + 0.0005 >= v_qty_ordered
    AND abs(v_amount_invoiced - v_amount_ordered) <= 0.05
    AND abs(v_amount_received - v_amount_ordered) <= 0.05 THEN
    v_match := 'matched';
  ELSE
    v_match := 'invoiced';
  END IF;

  UPDATE public.purchase_orders SET
    qty_ordered = v_qty_ordered,
    amount_ordered = round(v_amount_ordered, 2),
    qty_received = v_qty_received,
    amount_received = round(v_amount_received, 2),
    amount_invoiced = round(v_amount_invoiced, 2),
    match_status = v_match,
    updated_at = now()
  WHERE id = p_po_id;
END;
$$;

REVOKE ALL ON FUNCTION private.refresh_purchase_order_match(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_purchase_order_match(p_po_id uuid)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.purchase_orders%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  PERFORM private.refresh_purchase_order_match(p_po_id);
  SELECT * INTO row FROM public.purchase_orders WHERE id = p_po_id;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_purchase_order_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_purchase_order_match(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Create / confirm / cancel PO
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_supplier_id uuid,
  p_order_date date,
  p_currency text,
  p_vat_rate numeric,
  p_terms text,
  p_notes text,
  p_lines jsonb,
  p_confirm boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  po_id uuid;
  po_no text;
  line jsonb;
  item_count integer := 0;
  v_type text;
  v_part uuid;
  v_vehicle uuid;
  v_qty numeric;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF p_supplier_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND is_active) THEN
    RAISE EXCEPTION 'Active supplier is required';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one PO line is required';
  END IF;

  po_no := public.next_po_number();

  INSERT INTO public.purchase_orders (
    po_number, supplier_id, order_date, currency, vat_rate, terms, notes, status, created_by
  ) VALUES (
    po_no,
    p_supplier_id,
    COALESCE(p_order_date, (now() AT TIME ZONE 'UTC')::date),
    upper(COALESCE(NULLIF(btrim(p_currency), ''), 'AED')),
    COALESCE(p_vat_rate, 5),
    NULLIF(btrim(p_terms), ''),
    NULLIF(btrim(p_notes), ''),
    CASE WHEN COALESCE(p_confirm, false) THEN 'ordered' ELSE 'draft' END,
    (SELECT auth.uid())
  ) RETURNING id INTO po_id;

  FOR line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF btrim(COALESCE(line->>'description', '')) = '' THEN
      RAISE EXCEPTION 'Every PO line needs a description';
    END IF;
    v_type := NULLIF(line->>'inventory_type', '');
    v_part := CASE WHEN v_type = 'part' AND NULLIF(line->>'part_id', '') IS NOT NULL THEN (line->>'part_id')::uuid ELSE NULL END;
    v_vehicle := CASE WHEN v_type = 'vehicle' AND NULLIF(line->>'vehicle_id', '') IS NOT NULL THEN (line->>'vehicle_id')::uuid ELSE NULL END;
    v_qty := COALESCE((line->>'quantity')::numeric, 1);

    INSERT INTO public.purchase_order_lines (
      purchase_order_id, description, inventory_type, part_id, vehicle_id,
      quantity, unit_price, tax_rate, sort_order, notes
    ) VALUES (
      po_id,
      btrim(line->>'description'),
      v_type,
      v_part,
      v_vehicle,
      CASE WHEN v_type = 'vehicle' THEN 1 ELSE v_qty END,
      COALESCE((line->>'unit_price')::numeric, 0),
      COALESCE((line->>'tax_rate')::numeric, COALESCE(p_vat_rate, 5)),
      item_count,
      NULLIF(btrim(line->>'notes'), '')
    );
    item_count := item_count + 1;
  END LOOP;

  PERFORM private.refresh_purchase_order_match(po_id);
  RETURN po_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order(uuid, date, text, numeric, text, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(uuid, date, text, numeric, text, text, jsonb, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_purchase_order(p_po_id uuid)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.purchase_orders%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  UPDATE public.purchase_orders SET
    status = 'ordered',
    updated_at = now()
  WHERE id = p_po_id AND status = 'draft'
  RETURNING * INTO row;
  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Only draft purchase orders can be confirmed';
  END IF;
  PERFORM private.refresh_purchase_order_match(p_po_id);
  SELECT * INTO row FROM public.purchase_orders WHERE id = p_po_id;
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_po_id uuid)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.purchase_orders%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  UPDATE public.purchase_orders SET
    status = 'cancelled',
    match_status = 'cancelled',
    updated_at = now()
  WHERE id = p_po_id AND status <> 'cancelled'
  RETURNING * INTO row;
  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found or already cancelled';
  END IF;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_purchase_order(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_supplier_invoice_to_po(
  p_supplier_invoice_id uuid,
  p_purchase_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inv public.supplier_invoices%ROWTYPE;
  po public.purchase_orders%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  SELECT * INTO inv FROM public.supplier_invoices WHERE id = p_supplier_invoice_id;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Supplier invoice not found'; END IF;

  IF p_purchase_order_id IS NULL THEN
    UPDATE public.supplier_invoices SET purchase_order_id = NULL, updated_at = now() WHERE id = p_supplier_invoice_id;
    IF inv.purchase_order_id IS NOT NULL THEN
      PERFORM private.refresh_purchase_order_match(inv.purchase_order_id);
    END IF;
    RETURN;
  END IF;

  SELECT * INTO po FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF po.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot link to a cancelled PO'; END IF;

  UPDATE public.supplier_invoices SET
    purchase_order_id = p_purchase_order_id,
    supplier_id = COALESCE(supplier_id, po.supplier_id),
    updated_at = now()
  WHERE id = p_supplier_invoice_id;

  PERFORM private.refresh_purchase_order_match(p_purchase_order_id);
  IF inv.purchase_order_id IS NOT NULL AND inv.purchase_order_id IS DISTINCT FROM p_purchase_order_id THEN
    PERFORM private.refresh_purchase_order_match(inv.purchase_order_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.link_supplier_invoice_to_po(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_supplier_invoice_to_po(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Extend GRN create with optional PO (replace Phase 28 6-arg signature)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_inventory_receipt(date, uuid, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_inventory_receipt(
  p_received_date date,
  p_supplier_id uuid,
  p_supplier_invoice_id uuid,
  p_currency text,
  p_notes text,
  p_lines jsonb,
  p_purchase_order_id uuid DEFAULT NULL
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
  v_po_line uuid;
  po public.purchase_orders%ROWTYPE;
  effective_supplier uuid := p_supplier_id;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one receipt line is required';
  END IF;

  IF p_purchase_order_id IS NOT NULL THEN
    SELECT * INTO po FROM public.purchase_orders WHERE id = p_purchase_order_id;
    IF po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
    IF po.status <> 'ordered' THEN RAISE EXCEPTION 'PO must be ordered before receiving'; END IF;
    effective_supplier := COALESCE(p_supplier_id, po.supplier_id);
  END IF;

  IF effective_supplier IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = effective_supplier) THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;

  INSERT INTO public.inventory_receipt_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.inventory_receipt_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  receipt_no := 'GRN-' || fy::text || '-' || lpad(n::text, 4, '0');

  INSERT INTO public.inventory_receipts (
    receipt_number, received_date, supplier_id, supplier_invoice_id, purchase_order_id, currency, notes, created_by
  ) VALUES (
    receipt_no,
    COALESCE(p_received_date, (now() AT TIME ZONE 'UTC')::date),
    effective_supplier,
    p_supplier_invoice_id,
    p_purchase_order_id,
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
    v_po_line := CASE WHEN NULLIF(line->>'purchase_order_line_id', '') IS NOT NULL THEN (line->>'purchase_order_line_id')::uuid ELSE NULL END;

    IF v_type NOT IN ('part', 'vehicle') THEN
      RAISE EXCEPTION 'inventory_type must be part or vehicle';
    END IF;

    INSERT INTO public.inventory_receipt_lines (
      receipt_id, inventory_type, part_id, vehicle_id, quantity, unit_cost, notes, purchase_order_line_id
    ) VALUES (
      receipt_id, v_type, v_part, v_vehicle,
      CASE WHEN v_type = 'vehicle' THEN 1 ELSE v_qty END,
      v_cost,
      NULLIF(btrim(line->>'notes'), ''),
      v_po_line
    );

    IF v_type = 'vehicle' THEN
      IF v_vehicle IS NULL THEN RAISE EXCEPTION 'vehicle_id required'; END IF;
      UPDATE public.vehicles SET
        purchase_price = v_cost,
        purchase_currency = upper(COALESCE(NULLIF(btrim(p_currency), ''), 'AED')),
        purchase_date = COALESCE(p_received_date, (now() AT TIME ZONE 'UTC')::date),
        supplier_id = COALESCE(effective_supplier, supplier_id),
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
        supplier_id = COALESCE(effective_supplier, supplier_id),
        supplier_invoice_id = COALESCE(p_supplier_invoice_id, supplier_invoice_id),
        landed_cost = COALESCE(landed_cost, v_cost),
        quantity = quantity + v_qty,
        stock_status = CASE WHEN stock_status = 'sold' THEN 'available' ELSE stock_status END,
        updated_at = now()
      WHERE id = v_part;
    END IF;
  END LOOP;

  IF p_purchase_order_id IS NOT NULL THEN
    PERFORM private.refresh_purchase_order_match(p_purchase_order_id);
  END IF;

  RETURN receipt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_inventory_receipt(date, uuid, uuid, text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_receipt(date, uuid, uuid, text, text, jsonb, uuid) TO authenticated;

/* Phase 30: supplier payments + allocations; PO amount_paid; supplier SOA. */

-- ---------------------------------------------------------------------------
-- Sequences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_payment_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

ALTER TABLE public.supplier_payment_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_direct_supplier_payment_sequence_access ON public.supplier_payment_sequences;
CREATE POLICY deny_direct_supplier_payment_sequence_access
  ON public.supplier_payment_sequences FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.supplier_payment_sequences FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Supplier payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  paid_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  method text NOT NULL DEFAULT 'bank_transfer' CHECK (
    method IN ('bank_transfer', 'cash', 'card', 'cheque', 'remittance_company', 'other')
  ),
  bank_reference text CHECK (bank_reference IS NULL OR char_length(trim(bank_reference)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'rejected', 'reversed')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_payments_payment_number_uidx UNIQUE (payment_number)
);

CREATE TABLE IF NOT EXISTS public.supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.supplier_payments(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  supplier_invoice_id uuid REFERENCES public.supplier_invoices(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_payment_allocations_target_check CHECK (
    (purchase_order_id IS NOT NULL AND supplier_invoice_id IS NULL)
    OR (purchase_order_id IS NULL AND supplier_invoice_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx
  ON public.supplier_payments (supplier_id, paid_date DESC);
CREATE INDEX IF NOT EXISTS supplier_payments_status_idx
  ON public.supplier_payments (status);
CREATE INDEX IF NOT EXISTS supplier_payment_allocations_payment_idx
  ON public.supplier_payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS supplier_payment_allocations_po_idx
  ON public.supplier_payment_allocations (purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS supplier_payment_allocations_si_idx
  ON public.supplier_payment_allocations (supplier_invoice_id)
  WHERE supplier_invoice_id IS NOT NULL;

DROP TRIGGER IF EXISTS supplier_payments_updated_at ON public.supplier_payments;
CREATE TRIGGER supplier_payments_updated_at
BEFORE UPDATE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_supplier_payments ON public.supplier_payments;
CREATE POLICY workspace_manage_supplier_payments
  ON public.supplier_payments FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS workspace_manage_supplier_payment_allocations ON public.supplier_payment_allocations;
CREATE POLICY workspace_manage_supplier_payment_allocations
  ON public.supplier_payment_allocations FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.supplier_payments FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
REVOKE ALL ON public.supplier_payment_allocations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payment_allocations TO authenticated;

-- Widen match_status for paid states
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_match_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_match_status_check CHECK (
  match_status IN (
    'open', 'partially_received', 'received', 'invoiced', 'matched',
    'partially_paid', 'paid', 'cancelled'
  )
);

-- ---------------------------------------------------------------------------
-- Refresh PO match including amount_paid
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
  v_amount_paid numeric := 0;
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

  SELECT COALESCE(SUM(a.amount), 0)
  INTO v_amount_paid
  FROM public.supplier_payment_allocations a
  JOIN public.supplier_payments p ON p.id = a.payment_id
  WHERE a.purchase_order_id = p_po_id
    AND p.status = 'confirmed';

  IF v_qty_received <= 0 AND v_amount_invoiced <= 0 AND v_amount_paid <= 0 THEN
    v_match := 'open';
  ELSIF v_qty_received > 0 AND v_qty_received + 0.0005 < v_qty_ordered AND v_amount_invoiced <= 0 AND v_amount_paid <= 0 THEN
    v_match := 'partially_received';
  ELSIF v_qty_received + 0.0005 >= v_qty_ordered AND v_amount_invoiced <= 0 AND v_amount_paid <= 0 THEN
    v_match := 'received';
  ELSIF v_amount_invoiced > 0 AND v_amount_paid <= 0 AND (
    v_qty_received + 0.0005 < v_qty_ordered
    OR abs(v_amount_invoiced - v_amount_ordered) > 0.05
    OR abs(v_amount_received - v_amount_ordered) > 0.05
  ) THEN
    v_match := 'invoiced';
  ELSIF v_amount_invoiced > 0 AND v_amount_paid <= 0
    AND v_qty_received + 0.0005 >= v_qty_ordered
    AND abs(v_amount_invoiced - v_amount_ordered) <= 0.05
    AND abs(v_amount_received - v_amount_ordered) <= 0.05 THEN
    v_match := 'matched';
  ELSIF v_amount_paid > 0 AND v_amount_paid + 0.05 < v_amount_ordered THEN
    v_match := 'partially_paid';
  ELSIF v_amount_paid > 0 AND v_amount_paid + 0.05 >= v_amount_ordered THEN
    v_match := 'paid';
  ELSE
    v_match := 'invoiced';
  END IF;

  UPDATE public.purchase_orders SET
    qty_ordered = v_qty_ordered,
    amount_ordered = round(v_amount_ordered, 2),
    qty_received = v_qty_received,
    amount_received = round(v_amount_received, 2),
    amount_invoiced = round(v_amount_invoiced, 2),
    amount_paid = round(v_amount_paid, 2),
    match_status = v_match,
    updated_at = now()
  WHERE id = p_po_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Create / allocate / reverse supplier payments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_supplier_payment(
  p_supplier_id uuid,
  p_paid_date date,
  p_amount numeric,
  p_currency text,
  p_method text,
  p_bank_reference text,
  p_status text,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  fy integer := EXTRACT(YEAR FROM (now() AT TIME ZONE 'UTC'))::integer;
  n integer;
  payment_id uuid;
  payment_no text;
  v_status text := COALESCE(NULLIF(btrim(p_status), ''), 'confirmed');
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF p_supplier_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id) THEN
    RAISE EXCEPTION 'Supplier is required';
  END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF v_status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'New payments must be pending or confirmed';
  END IF;
  IF COALESCE(p_method, 'bank_transfer') NOT IN ('bank_transfer', 'cash', 'card', 'cheque', 'remittance_company', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  INSERT INTO public.supplier_payment_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.supplier_payment_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  payment_no := 'SPAY-' || fy::text || '-' || lpad(n::text, 4, '0');

  INSERT INTO public.supplier_payments (
    payment_number, supplier_id, paid_date, amount, currency, method, bank_reference, status, notes, created_by
  ) VALUES (
    payment_no,
    p_supplier_id,
    COALESCE(p_paid_date, (now() AT TIME ZONE 'UTC')::date),
    p_amount,
    upper(COALESCE(NULLIF(btrim(p_currency), ''), 'AED')),
    COALESCE(NULLIF(btrim(p_method), ''), 'bank_transfer'),
    NULLIF(btrim(p_bank_reference), ''),
    v_status,
    NULLIF(btrim(p_notes), ''),
    (SELECT auth.uid())
  ) RETURNING id INTO payment_id;

  RETURN payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_payment(uuid, date, numeric, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_payment(uuid, date, numeric, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.allocate_supplier_payment(
  p_payment_id uuid,
  p_purchase_order_id uuid,
  p_supplier_invoice_id uuid,
  p_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pay public.supplier_payments%ROWTYPE;
  po public.purchase_orders%ROWTYPE;
  inv public.supplier_invoices%ROWTYPE;
  payment_allocated numeric := 0;
  available numeric := 0;
  target_allocated numeric := 0;
  allocation_id uuid;
  target_remaining numeric := 0;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF (p_purchase_order_id IS NULL AND p_supplier_invoice_id IS NULL)
     OR (p_purchase_order_id IS NOT NULL AND p_supplier_invoice_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Allocate to either a purchase order or a supplier invoice';
  END IF;

  SELECT * INTO pay FROM public.supplier_payments WHERE id = p_payment_id FOR UPDATE;
  IF pay.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF pay.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed payments can be allocated'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO payment_allocated
  FROM public.supplier_payment_allocations WHERE payment_id = p_payment_id;
  available := pay.amount - payment_allocated;
  IF p_amount > available + 0.0001 THEN
    RAISE EXCEPTION 'Amount exceeds available payment balance';
  END IF;

  IF p_purchase_order_id IS NOT NULL THEN
    SELECT * INTO po FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
    IF po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
    IF po.supplier_id <> pay.supplier_id THEN RAISE EXCEPTION 'PO supplier must match payment'; END IF;
    IF po.currency <> pay.currency THEN RAISE EXCEPTION 'Currency must match'; END IF;
    IF po.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot allocate to a cancelled PO'; END IF;
    target_remaining := GREATEST(0, po.amount_ordered - po.amount_paid);
    IF p_amount > target_remaining + 0.0001 THEN
      RAISE EXCEPTION 'Amount exceeds PO outstanding balance';
    END IF;
  ELSE
    SELECT * INTO inv FROM public.supplier_invoices WHERE id = p_supplier_invoice_id FOR UPDATE;
    IF inv.id IS NULL THEN RAISE EXCEPTION 'Supplier invoice not found'; END IF;
    IF inv.currency <> pay.currency THEN RAISE EXCEPTION 'Currency must match'; END IF;
    IF inv.supplier_id IS NOT NULL AND inv.supplier_id <> pay.supplier_id THEN
      RAISE EXCEPTION 'Invoice supplier must match payment';
    END IF;
    SELECT COALESCE(SUM(amount), 0) INTO target_allocated
    FROM public.supplier_payment_allocations WHERE supplier_invoice_id = p_supplier_invoice_id;
    target_remaining := GREATEST(0, inv.total_amount - target_allocated);
    IF p_amount > target_remaining + 0.0001 THEN
      RAISE EXCEPTION 'Amount exceeds supplier invoice outstanding balance';
    END IF;
  END IF;

  INSERT INTO public.supplier_payment_allocations (
    payment_id, purchase_order_id, supplier_invoice_id, amount, created_by
  ) VALUES (
    p_payment_id, p_purchase_order_id, p_supplier_invoice_id, p_amount, (SELECT auth.uid())
  ) RETURNING id INTO allocation_id;

  IF p_purchase_order_id IS NOT NULL THEN
    PERFORM private.refresh_purchase_order_match(p_purchase_order_id);
  ELSIF inv.purchase_order_id IS NOT NULL THEN
    PERFORM private.refresh_purchase_order_match(inv.purchase_order_id);
  END IF;

  RETURN allocation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_supplier_payment(uuid, uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_supplier_payment(uuid, uuid, uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_supplier_payment_allocation(p_allocation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  alloc public.supplier_payment_allocations%ROWTYPE;
  inv public.supplier_invoices%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  SELECT * INTO alloc FROM public.supplier_payment_allocations WHERE id = p_allocation_id;
  IF alloc.id IS NULL THEN RAISE EXCEPTION 'Allocation not found'; END IF;

  DELETE FROM public.supplier_payment_allocations WHERE id = p_allocation_id;

  IF alloc.purchase_order_id IS NOT NULL THEN
    PERFORM private.refresh_purchase_order_match(alloc.purchase_order_id);
  ELSIF alloc.supplier_invoice_id IS NOT NULL THEN
    SELECT * INTO inv FROM public.supplier_invoices WHERE id = alloc.supplier_invoice_id;
    IF inv.purchase_order_id IS NOT NULL THEN
      PERFORM private.refresh_purchase_order_match(inv.purchase_order_id);
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_supplier_payment_allocation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_supplier_payment_allocation(uuid) TO authenticated;

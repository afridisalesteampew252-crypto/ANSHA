/* Phase 69: remittance module — offices/shifts masters, received_by tagging,
   unknown TTS queue, RLS for tagged staff SELECT (My remittances). */

-- ---------------------------------------------------------------------------
-- Masters: remittance offices & shifts (separate from HR shift_locations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.remittance_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  code text CHECK (code IS NULL OR char_length(btrim(code)) BETWEEN 1 AND 40),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS remittance_offices_code_uidx
  ON public.remittance_offices (lower(btrim(code)))
  WHERE code IS NOT NULL AND btrim(code) <> '';

CREATE INDEX IF NOT EXISTS remittance_offices_active_idx
  ON public.remittance_offices (is_active, sort_order, name);

COMMENT ON TABLE public.remittance_offices IS
  'Phase 69: remittance collection offices (name/code) for receive + office-wise reporting.';

CREATE TABLE IF NOT EXISTS public.remittance_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  office_id uuid REFERENCES public.remittance_offices(id) ON DELETE SET NULL,
  hours_label text CHECK (hours_label IS NULL OR char_length(btrim(hours_label)) <= 80),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS remittance_shifts_office_idx
  ON public.remittance_shifts (office_id);
CREATE INDEX IF NOT EXISTS remittance_shifts_active_idx
  ON public.remittance_shifts (is_active, sort_order, name);

COMMENT ON TABLE public.remittance_shifts IS
  'Phase 69: remittance desk shifts (optional office link + hours label).';

DROP TRIGGER IF EXISTS remittance_offices_updated_at ON public.remittance_offices;
CREATE TRIGGER remittance_offices_updated_at
BEFORE UPDATE ON public.remittance_offices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS remittance_shifts_updated_at ON public.remittance_shifts;
CREATE TRIGGER remittance_shifts_updated_at
BEFORE UPDATE ON public.remittance_shifts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.remittance_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_select_remittance_offices ON public.remittance_offices;
CREATE POLICY workspace_select_remittance_offices
  ON public.remittance_offices FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS receivables_write_remittance_offices ON public.remittance_offices;
CREATE POLICY receivables_write_remittance_offices
  ON public.remittance_offices FOR ALL TO authenticated
  USING ((SELECT private.can_manage_receivables()))
  WITH CHECK ((SELECT private.can_manage_receivables()));

DROP POLICY IF EXISTS workspace_select_remittance_shifts ON public.remittance_shifts;
CREATE POLICY workspace_select_remittance_shifts
  ON public.remittance_shifts FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_user()));

DROP POLICY IF EXISTS receivables_write_remittance_shifts ON public.remittance_shifts;
CREATE POLICY receivables_write_remittance_shifts
  ON public.remittance_shifts FOR ALL TO authenticated
  USING ((SELECT private.can_manage_receivables()))
  WITH CHECK ((SELECT private.can_manage_receivables()));

REVOKE ALL ON public.remittance_offices, public.remittance_shifts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittance_offices, public.remittance_shifts TO authenticated;

-- ---------------------------------------------------------------------------
-- Extend remittances
-- ---------------------------------------------------------------------------
ALTER TABLE public.remittances
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS office_id uuid REFERENCES public.remittance_offices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.remittance_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_unknown boolean NOT NULL DEFAULT false;

-- Allow status = unknown (unmatched TTS / needs customer link)
ALTER TABLE public.remittances DROP CONSTRAINT IF EXISTS remittances_status_check;
ALTER TABLE public.remittances
  ADD CONSTRAINT remittances_status_check
  CHECK (status IN ('pending', 'confirmed', 'rejected', 'reversed', 'unknown'));

CREATE INDEX IF NOT EXISTS remittances_received_by_idx ON public.remittances (received_by);
CREATE INDEX IF NOT EXISTS remittances_office_id_idx ON public.remittances (office_id);
CREATE INDEX IF NOT EXISTS remittances_shift_id_idx ON public.remittances (shift_id);
CREATE INDEX IF NOT EXISTS remittances_is_unknown_idx ON public.remittances (is_unknown) WHERE is_unknown;

COMMENT ON COLUMN public.remittances.received_by IS
  'Staff user tagged as receiver; that user may SELECT this remittance (My remittances).';
COMMENT ON COLUMN public.remittances.is_unknown IS
  'True when unmatched (no customer / unknown TTS) — finance unknown queue.';

-- Backfill: pending without customer → unknown
UPDATE public.remittances
SET is_unknown = true, status = 'unknown'
WHERE customer_id IS NULL
  AND status = 'pending'
  AND COALESCE(is_unknown, false) = false;

-- ---------------------------------------------------------------------------
-- RLS: finance sees all; tagged staff SELECT own; unknown writes finance-only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS workspace_read_remittances ON public.remittances;
DROP POLICY IF EXISTS receivables_read_remittances ON public.remittances;
DROP POLICY IF EXISTS tagged_read_own_remittances ON public.remittances;

CREATE POLICY receivables_read_remittances
  ON public.remittances FOR SELECT TO authenticated
  USING (
    (SELECT private.can_manage_receivables())
    OR received_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS receivables_insert_remittances ON public.remittances;
DROP POLICY IF EXISTS workspace_insert_remittances ON public.remittances;
CREATE POLICY receivables_insert_remittances
  ON public.remittances FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.can_manage_receivables())
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS receivables_update_remittances ON public.remittances;
DROP POLICY IF EXISTS workspace_update_remittances ON public.remittances;
CREATE POLICY receivables_update_remittances
  ON public.remittances FOR UPDATE TO authenticated
  USING ((SELECT private.can_manage_receivables()))
  WITH CHECK ((SELECT private.can_manage_receivables()));

-- Documents: finance all; tagged staff read docs for their remittances
DROP POLICY IF EXISTS workspace_read_remittance_documents ON public.remittance_documents;
DROP POLICY IF EXISTS receivables_read_remittance_documents ON public.remittance_documents;
CREATE POLICY receivables_read_remittance_documents
  ON public.remittance_documents FOR SELECT TO authenticated
  USING (
    (SELECT private.can_manage_receivables())
    OR EXISTS (
      SELECT 1 FROM public.remittances r
      WHERE r.id = remittance_id
        AND r.received_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS workspace_insert_remittance_documents ON public.remittance_documents;
DROP POLICY IF EXISTS receivables_insert_remittance_documents ON public.remittance_documents;
CREATE POLICY receivables_insert_remittance_documents
  ON public.remittance_documents FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.can_manage_receivables())
    AND uploaded_by = (SELECT auth.uid())
  );

-- Allocations: tagged staff may SELECT rows for their remittances (read-only)
DROP POLICY IF EXISTS receivables_read_remittance_allocations ON public.remittance_allocations;
CREATE POLICY receivables_read_remittance_allocations
  ON public.remittance_allocations FOR SELECT TO authenticated
  USING (
    (SELECT private.can_manage_receivables())
    OR EXISTS (
      SELECT 1 FROM public.remittances r
      WHERE r.id = remittance_id
        AND r.received_by = (SELECT auth.uid())
    )
  );

-- Storage SELECT for tagged remittance docs
DROP POLICY IF EXISTS remittance_documents_storage_select ON storage.objects;
CREATE POLICY remittance_documents_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'remittance-documents'
  AND (
    (SELECT private.can_manage_receivables())
    OR (
      (SELECT private.is_workspace_user())
      AND EXISTS (
        SELECT 1
        FROM public.remittance_documents d
        JOIN public.remittances r ON r.id = d.remittance_id
        WHERE d.storage_path = name
          AND r.received_by = (SELECT auth.uid())
      )
    )
  )
);

-- ---------------------------------------------------------------------------
-- create_remittance: accept received_by / office / shift; unknown when unmatched
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_remittance(uuid, uuid, text, date, numeric, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_remittance(uuid, uuid, text, date, numeric, text, text, text, text, text, text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_remittance(
  p_customer_id uuid,
  p_invoice_id uuid,
  p_customer_name text,
  p_received_date date,
  p_amount numeric,
  p_currency text,
  p_method text,
  p_bank_reference text,
  p_sender_bank text,
  p_receiving_bank text,
  p_status text,
  p_notes text,
  p_received_by uuid DEFAULT NULL,
  p_office_id uuid DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  new_remittance_id uuid;
  linked_invoice public.invoices%ROWTYPE;
  payment_id uuid;
  generated_remittance_number text;
  v_status text;
  v_unknown boolean;
  v_name text;
BEGIN
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Receivables access required';
  END IF;
  v_name := btrim(COALESCE(p_customer_name, ''));
  IF v_name = '' THEN
    v_name := COALESCE(NULLIF(btrim(p_bank_reference), ''), 'Unknown TTS');
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;

  v_unknown := (p_customer_id IS NULL);
  v_status := COALESCE(NULLIF(btrim(p_status), ''), CASE WHEN v_unknown THEN 'unknown' ELSE 'pending' END);
  IF v_unknown AND v_status NOT IN ('unknown', 'pending', 'rejected') THEN
    v_status := 'unknown';
  END IF;
  IF NOT v_unknown AND v_status = 'unknown' THEN
    v_status := 'pending';
  END IF;
  IF v_status NOT IN ('pending', 'confirmed', 'unknown') THEN
    RAISE EXCEPTION 'New remittances must be pending, confirmed, or unknown';
  END IF;
  IF v_status = 'confirmed' AND v_unknown THEN
    RAISE EXCEPTION 'Cannot confirm an unmatched remittance — link a customer first';
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT * INTO linked_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    IF linked_invoice.currency <> upper(p_currency) THEN RAISE EXCEPTION 'Remittance currency must match invoice currency'; END IF;
    IF v_status = 'confirmed' AND p_amount > linked_invoice.balance_due THEN RAISE EXCEPTION 'Confirmed amount cannot exceed invoice balance'; END IF;
  END IF;

  IF p_received_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.admin_profiles ap WHERE ap.id = p_received_by AND ap.is_active
  ) THEN
    RAISE EXCEPTION 'Linked user not found or inactive';
  END IF;
  IF p_office_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.remittance_offices o WHERE o.id = p_office_id
  ) THEN
    RAISE EXCEPTION 'Office not found';
  END IF;
  IF p_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.remittance_shifts s WHERE s.id = p_shift_id
  ) THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  INSERT INTO public.remittances (
    customer_id, invoice_id, customer_name, received_date, amount, currency,
    method, bank_reference, sender_bank, receiving_bank, status, notes, created_by,
    received_by, office_id, shift_id, is_unknown
  ) VALUES (
    p_customer_id, p_invoice_id, v_name, p_received_date, p_amount,
    upper(p_currency), p_method, NULLIF(btrim(p_bank_reference), ''),
    NULLIF(btrim(p_sender_bank), ''), NULLIF(btrim(p_receiving_bank), ''),
    v_status, NULLIF(btrim(p_notes), ''), (SELECT auth.uid()),
    p_received_by, p_office_id, p_shift_id, v_unknown
  )
  RETURNING id, remittance_number INTO new_remittance_id, generated_remittance_number;

  IF p_invoice_id IS NOT NULL AND v_status = 'confirmed' THEN
    INSERT INTO public.invoice_payments (
      invoice_id, payment_date, amount, method, reference, notes, created_by
    ) VALUES (
      p_invoice_id, p_received_date, p_amount,
      CASE WHEN p_method IN ('bank_transfer', 'cash', 'card', 'cheque', 'other') THEN p_method ELSE 'other' END,
      COALESCE(NULLIF(btrim(p_bank_reference), ''), generated_remittance_number),
      'Applied from remittance ' || generated_remittance_number,
      (SELECT auth.uid())
    ) RETURNING id INTO payment_id;

    UPDATE public.remittances SET invoice_payment_id = payment_id WHERE id = new_remittance_id;
  END IF;

  RETURN new_remittance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_remittance(uuid, uuid, text, date, numeric, text, text, text, text, text, text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_remittance(uuid, uuid, text, date, numeric, text, text, text, text, text, text, text, uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_remittance(uuid, uuid, text, date, numeric, text, text, text, text, text, text, text, uuid, uuid, uuid) IS
  'Phase 69: create remittance with optional received_by, office, shift; unmatched customer ⇒ unknown.';

-- Link / resolve unknown remittance (finance)
CREATE OR REPLACE FUNCTION public.link_remittance(
  p_remittance_id uuid,
  p_customer_id uuid,
  p_customer_name text DEFAULT NULL,
  p_received_by uuid DEFAULT NULL,
  p_office_id uuid DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL,
  p_status text DEFAULT 'pending'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  remittance_row public.remittances%ROWTYPE;
  v_name text;
  v_status text;
BEGIN
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Receivables access required';
  END IF;
  SELECT * INTO remittance_row FROM public.remittances WHERE id = p_remittance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Remittance not found'; END IF;

  v_status := COALESCE(NULLIF(btrim(p_status), ''), 'pending');
  IF v_status NOT IN ('pending', 'confirmed', 'unknown') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required to resolve unknown remittance';
  END IF;

  SELECT COALESCE(NULLIF(btrim(p_customer_name), ''), company_name, full_name)
  INTO v_name
  FROM public.customers WHERE id = p_customer_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;

  UPDATE public.remittances SET
    customer_id = p_customer_id,
    customer_name = v_name,
    received_by = COALESCE(p_received_by, received_by),
    office_id = COALESCE(p_office_id, office_id),
    shift_id = COALESCE(p_shift_id, shift_id),
    is_unknown = false,
    status = CASE WHEN v_status = 'unknown' THEN 'pending' ELSE v_status END
  WHERE id = p_remittance_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.link_remittance(uuid, uuid, text, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_remittance(uuid, uuid, text, uuid, uuid, uuid, text) TO authenticated;

-- Dashboard helper: unknown count (finance only)
CREATE OR REPLACE FUNCTION public.count_unknown_remittances()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN private.can_manage_receivables() THEN (
      SELECT count(*)::bigint FROM public.remittances
      WHERE is_unknown OR status = 'unknown'
    )
    ELSE 0::bigint
  END;
$$;

REVOKE ALL ON FUNCTION public.count_unknown_remittances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_unknown_remittances() TO authenticated;

-- Gate allocate to receivables (was workspace-only)
CREATE OR REPLACE FUNCTION public.allocate_remittance(
  p_remittance_id uuid,
  p_invoice_id uuid,
  p_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  remittance_row public.remittances%ROWTYPE;
  invoice_row public.invoices%ROWTYPE;
  allocated_total numeric(14,2);
  payment_id uuid;
BEGIN
  IF NOT private.can_manage_receivables() THEN RAISE EXCEPTION 'Receivables access required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Allocation amount must be greater than zero'; END IF;

  SELECT * INTO remittance_row FROM public.remittances WHERE id = p_remittance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Remittance not found'; END IF;
  IF remittance_row.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed remittances can be allocated'; END IF;
  IF remittance_row.is_unknown THEN RAISE EXCEPTION 'Resolve unknown remittance before allocating'; END IF;

  SELECT * INTO invoice_row FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF invoice_row.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled invoices cannot receive payments'; END IF;
  IF invoice_row.currency <> remittance_row.currency THEN RAISE EXCEPTION 'Invoice and remittance currencies must match'; END IF;
  IF remittance_row.customer_id IS NULL OR invoice_row.customer_id IS NULL OR remittance_row.customer_id <> invoice_row.customer_id THEN
    RAISE EXCEPTION 'Invoice and remittance must belong to the same saved customer';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO allocated_total
  FROM public.remittance_allocations WHERE remittance_id = p_remittance_id;
  IF p_amount > remittance_row.amount - allocated_total THEN RAISE EXCEPTION 'Allocation exceeds the available remittance balance'; END IF;
  IF p_amount > invoice_row.balance_due THEN RAISE EXCEPTION 'Allocation exceeds the invoice balance'; END IF;

  INSERT INTO public.invoice_payments (
    invoice_id, payment_date, amount, method, reference, notes, created_by
  ) VALUES (
    invoice_row.id, remittance_row.received_date, p_amount,
    CASE WHEN remittance_row.method IN ('bank_transfer', 'cash', 'card', 'cheque', 'other') THEN remittance_row.method ELSE 'other' END,
    COALESCE(NULLIF(btrim(remittance_row.bank_reference), ''), remittance_row.remittance_number),
    'Allocated from remittance ' || remittance_row.remittance_number,
    (SELECT auth.uid())
  ) RETURNING id INTO payment_id;

  INSERT INTO public.remittance_allocations (
    remittance_id, invoice_id, invoice_payment_id, amount, created_by
  ) VALUES (p_remittance_id, p_invoice_id, payment_id, p_amount, (SELECT auth.uid()));
  RETURN payment_id;
END;
$$;

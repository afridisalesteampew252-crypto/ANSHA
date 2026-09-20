-- Phase 73: remittance / TT confirmation rules
-- - Known create (customer set) → confirmed by default
-- - Unknown / unmatched (no customer) → status unknown, unconfirmed
-- - Link unknown to customer + agent (received_by) → auto-confirmed (RPC + trigger)

-- ---------------------------------------------------------------------------
-- create_remittance: default confirmed when customer is known
-- ---------------------------------------------------------------------------
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
  v_office_id uuid;
  v_shift_id uuid;
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
  -- Known remittances default to confirmed; unknown TTS stay unconfirmed
  v_status := COALESCE(NULLIF(btrim(p_status), ''), CASE WHEN v_unknown THEN 'unknown' ELSE 'confirmed' END);
  IF v_unknown AND v_status NOT IN ('unknown', 'pending', 'rejected') THEN
    v_status := 'unknown';
  END IF;
  IF NOT v_unknown AND v_status = 'unknown' THEN
    v_status := 'confirmed';
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

  v_office_id := p_office_id;
  v_shift_id := p_shift_id;
  IF p_received_by IS NOT NULL AND (v_office_id IS NULL OR v_shift_id IS NULL) THEN
    SELECT
      COALESCE(v_office_id, ap.office_id),
      COALESCE(v_shift_id, ap.shift_id)
    INTO v_office_id, v_shift_id
    FROM public.admin_profiles ap
    WHERE ap.id = p_received_by;
  END IF;

  IF v_office_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.remittance_offices o WHERE o.id = v_office_id
  ) THEN
    RAISE EXCEPTION 'Office not found';
  END IF;
  IF v_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.remittance_shifts s WHERE s.id = v_shift_id
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
    p_received_by, v_office_id, v_shift_id, v_unknown
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

COMMENT ON FUNCTION public.create_remittance(uuid, uuid, text, date, numeric, text, text, text, text, text, text, text, uuid, uuid, uuid) IS
  'Phase 73: create remittance; known customer defaults to confirmed; unmatched stays unknown.';

-- ---------------------------------------------------------------------------
-- link_remittance: require customer + agent; auto-confirm
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_remittance(
  p_remittance_id uuid,
  p_customer_id uuid,
  p_customer_name text DEFAULT NULL,
  p_received_by uuid DEFAULT NULL,
  p_office_id uuid DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL,
  p_status text DEFAULT 'confirmed'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  remittance_row public.remittances%ROWTYPE;
  v_name text;
  v_received_by uuid;
  v_office_id uuid;
  v_shift_id uuid;
BEGIN
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Receivables access required';
  END IF;
  SELECT * INTO remittance_row FROM public.remittances WHERE id = p_remittance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Remittance not found'; END IF;
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required to resolve unknown remittance';
  END IF;

  SELECT COALESCE(NULLIF(btrim(p_customer_name), ''), company_name, full_name)
  INTO v_name
  FROM public.customers WHERE id = p_customer_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;

  v_received_by := COALESCE(p_received_by, remittance_row.received_by);
  IF v_received_by IS NULL THEN
    RAISE EXCEPTION 'Linked user (agent) is required to resolve unknown remittance';
  END IF;

  v_office_id := COALESCE(p_office_id, remittance_row.office_id);
  v_shift_id := COALESCE(p_shift_id, remittance_row.shift_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_profiles ap WHERE ap.id = v_received_by AND ap.is_active
  ) THEN
    RAISE EXCEPTION 'Linked user not found or inactive';
  END IF;

  IF v_office_id IS NULL OR v_shift_id IS NULL THEN
    SELECT
      COALESCE(v_office_id, ap.office_id),
      COALESCE(v_shift_id, ap.shift_id)
    INTO v_office_id, v_shift_id
    FROM public.admin_profiles ap
    WHERE ap.id = v_received_by;
  END IF;

  -- Linking customer + agent always confirms (p_status ignored for auto-confirm)
  UPDATE public.remittances
  SET
    customer_id = p_customer_id,
    customer_name = v_name,
    received_by = v_received_by,
    office_id = v_office_id,
    shift_id = v_shift_id,
    is_unknown = false,
    status = 'confirmed'
  WHERE id = p_remittance_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.link_remittance(uuid, uuid, text, uuid, uuid, uuid, text) IS
  'Phase 73: link unknown remittance to customer + agent; auto-confirms.';

-- ---------------------------------------------------------------------------
-- Trigger: auto-confirm when unknown row gains customer + agent
-- (covers direct table updates and link_remittance)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.remittances_auto_confirm_on_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- No customer ⇒ unknown / unconfirmed (unless rejected or reversed)
  IF NEW.customer_id IS NULL THEN
    NEW.is_unknown := true;
    IF NEW.status IS DISTINCT FROM 'rejected' AND NEW.status IS DISTINCT FROM 'reversed' THEN
      NEW.status := 'unknown';
    END IF;
    RETURN NEW;
  END IF;

  -- Resolving unknown: customer + agent ⇒ confirmed
  IF COALESCE(OLD.is_unknown, false) = true
     AND NEW.customer_id IS NOT NULL
     AND NEW.received_by IS NOT NULL
  THEN
    NEW.is_unknown := false;
    IF NEW.status IN ('unknown', 'pending') THEN
      NEW.status := 'confirmed';
    END IF;
  END IF;

  -- INSERT with customer already known and status left as unknown → treat as confirmed
  IF TG_OP = 'INSERT'
     AND NEW.customer_id IS NOT NULL
     AND NEW.status = 'unknown'
  THEN
    NEW.is_unknown := false;
    NEW.status := 'confirmed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS remittances_auto_confirm_on_link ON public.remittances;
CREATE TRIGGER remittances_auto_confirm_on_link
  BEFORE INSERT OR UPDATE OF customer_id, received_by, is_unknown, status
  ON public.remittances
  FOR EACH ROW
  EXECUTE FUNCTION private.remittances_auto_confirm_on_link();

COMMENT ON FUNCTION private.remittances_auto_confirm_on_link() IS
  'Phase 73: when an unknown remittance is linked to customer + agent, set status confirmed.';

/* Phase 70: office/shift live on admin_profiles (Users UI).
   remittance_offices / remittance_shifts remain lightweight picklists.
   Remittance receive stores office_id/shift_id (from linked user or override).
   Dashboard analytics filter by remittance.office_id — not HR-style config. */

-- ---------------------------------------------------------------------------
-- admin_profiles: default office / shift for remittance tagging
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS office_id uuid REFERENCES public.remittance_offices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.remittance_shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS admin_profiles_office_id_idx ON public.admin_profiles (office_id);
CREATE INDEX IF NOT EXISTS admin_profiles_shift_id_idx ON public.admin_profiles (shift_id);

COMMENT ON COLUMN public.admin_profiles.office_id IS
  'Phase 70: default remittance collection office assigned on the user profile.';
COMMENT ON COLUMN public.admin_profiles.shift_id IS
  'Phase 70: default remittance desk shift assigned on the user profile.';

COMMENT ON TABLE public.remittance_offices IS
  'Phase 70: lightweight office picklist for user profiles + remittance tagging/dashboard (not HR master data).';
COMMENT ON TABLE public.remittance_shifts IS
  'Phase 70: lightweight shift picklist for user profiles + remittance tagging (not HR shift_locations).';

-- Backfill profiles from most recent remittance tagged to that user
WITH latest AS (
  SELECT DISTINCT ON (received_by)
    received_by,
    office_id,
    shift_id
  FROM public.remittances
  WHERE received_by IS NOT NULL
    AND (office_id IS NOT NULL OR shift_id IS NOT NULL)
  ORDER BY received_by, received_date DESC NULLS LAST, created_at DESC
)
UPDATE public.admin_profiles ap
SET
  office_id = COALESCE(ap.office_id, latest.office_id),
  shift_id = COALESCE(ap.shift_id, latest.shift_id)
FROM latest
WHERE ap.id = latest.received_by;

-- Fill remittances missing office/shift from the linked user's profile
UPDATE public.remittances r
SET
  office_id = COALESCE(r.office_id, ap.office_id),
  shift_id = COALESCE(r.shift_id, ap.shift_id)
FROM public.admin_profiles ap
WHERE r.received_by = ap.id
  AND (
    (r.office_id IS NULL AND ap.office_id IS NOT NULL)
    OR (r.shift_id IS NULL AND ap.shift_id IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- create_remittance: default office/shift from linked user when omitted
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
  'Phase 70: create remittance; office/shift default from linked user profile when omitted.';

-- ---------------------------------------------------------------------------
-- link_remittance: same profile default when office/shift omitted
-- ---------------------------------------------------------------------------
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

  v_status := COALESCE(NULLIF(btrim(p_status), ''), 'pending');
  IF v_status NOT IN ('pending', 'confirmed', 'unknown') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  v_received_by := COALESCE(p_received_by, remittance_row.received_by);
  v_office_id := COALESCE(p_office_id, remittance_row.office_id);
  v_shift_id := COALESCE(p_shift_id, remittance_row.shift_id);

  IF v_received_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.admin_profiles ap WHERE ap.id = v_received_by AND ap.is_active
  ) THEN
    RAISE EXCEPTION 'Linked user not found or inactive';
  END IF;

  IF v_received_by IS NOT NULL AND (v_office_id IS NULL OR v_shift_id IS NULL) THEN
    SELECT
      COALESCE(v_office_id, ap.office_id),
      COALESCE(v_shift_id, ap.shift_id)
    INTO v_office_id, v_shift_id
    FROM public.admin_profiles ap
    WHERE ap.id = v_received_by;
  END IF;

  UPDATE public.remittances
  SET
    customer_id = p_customer_id,
    customer_name = v_name,
    received_by = v_received_by,
    office_id = v_office_id,
    shift_id = v_shift_id,
    is_unknown = false,
    status = CASE WHEN v_status = 'unknown' THEN 'pending' ELSE v_status END
  WHERE id = p_remittance_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.link_remittance(uuid, uuid, text, uuid, uuid, uuid, text) IS
  'Phase 70: link unknown remittance; office/shift default from linked user when omitted.';

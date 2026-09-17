/* Phase 14: authentic invoice verification and secured remittance management. */

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'tax_invoice'
    CHECK (document_type IN ('proforma_invoice', 'tax_invoice', 'commercial_invoice')),
  ADD COLUMN IF NOT EXISTS verification_code uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS verification_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS verification_issued_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS invoices_verification_code_uidx
  ON public.invoices(verification_code);

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
          'line_total', item.line_total
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

CREATE OR REPLACE FUNCTION public.create_invoice_v2(
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
BEGIN
  IF NOT private.is_workspace_user() THEN RAISE EXCEPTION 'Workspace access required'; END IF;
  IF btrim(COALESCE(p_customer_name, '')) = '' THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF p_due_date < p_issue_date THEN RAISE EXCEPTION 'Due date cannot be before issue date'; END IF;
  IF p_document_type NOT IN ('proforma_invoice', 'tax_invoice', 'commercial_invoice') THEN RAISE EXCEPTION 'Invalid document type'; END IF;
  IF normalized_invoice_number IS NOT NULL AND normalized_invoice_number !~ '^[A-Z0-9][A-Z0-9/_-]{2,39}$' THEN
    RAISE EXCEPTION 'Invoice number may contain only letters, numbers, slash, underscore, and hyphen';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'At least one invoice item is required'; END IF;

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
    IF btrim(COALESCE(item->>'description', '')) = '' THEN RAISE EXCEPTION 'Every line needs a description'; END IF;
    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, unit_price, discount_percent, tax_rate, sort_order
    ) VALUES (
      new_invoice_id,
      btrim(item->>'description'),
      COALESCE((item->>'quantity')::numeric, 1),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount_percent')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 5),
      item_count
    );
    item_count := item_count + 1;
  END LOOP;

  PERFORM private.recalculate_invoice(new_invoice_id);
  RETURN new_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_v2(text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_v2(text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS public.remittance_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number bigint NOT NULL CHECK (next_number > 0)
);

CREATE TABLE IF NOT EXISTS public.remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  invoice_payment_id uuid UNIQUE REFERENCES public.invoice_payments(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  method text NOT NULL DEFAULT 'bank_transfer'
    CHECK (method IN ('bank_transfer', 'cash', 'card', 'cheque', 'remittance_company', 'other')),
  bank_reference text,
  sender_bank text,
  receiving_bank text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'reversed')),
  notes text,
  created_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.remittance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id uuid NOT NULL REFERENCES public.remittances(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR (size_bytes >= 0 AND size_bytes <= 26214400)),
  uploaded_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS remittances_customer_id_idx ON public.remittances(customer_id);
CREATE INDEX IF NOT EXISTS remittances_invoice_id_idx ON public.remittances(invoice_id);
CREATE INDEX IF NOT EXISTS remittances_received_date_idx ON public.remittances(received_date DESC);
CREATE INDEX IF NOT EXISTS remittances_status_idx ON public.remittances(status);
CREATE INDEX IF NOT EXISTS remittance_documents_remittance_id_idx ON public.remittance_documents(remittance_id);
CREATE INDEX IF NOT EXISTS remittance_documents_uploaded_by_idx ON public.remittance_documents(uploaded_by);

ALTER TABLE public.remittance_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_read_remittances ON public.remittances
FOR SELECT TO authenticated USING ((SELECT private.is_workspace_user()));
CREATE POLICY workspace_insert_remittances ON public.remittances
FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_workspace_user()) AND created_by = (SELECT auth.uid()));
CREATE POLICY workspace_update_remittances ON public.remittances
FOR UPDATE TO authenticated USING ((SELECT private.is_workspace_user()))
WITH CHECK ((SELECT private.is_workspace_user()));
CREATE POLICY admin_delete_remittances ON public.remittances
FOR DELETE TO authenticated
USING ((SELECT private.is_platform_admin()) OR created_by = (SELECT auth.uid()));

CREATE POLICY workspace_read_remittance_documents ON public.remittance_documents
FOR SELECT TO authenticated USING ((SELECT private.is_workspace_user()));
CREATE POLICY workspace_insert_remittance_documents ON public.remittance_documents
FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_workspace_user()) AND uploaded_by = (SELECT auth.uid()));
CREATE POLICY admin_delete_remittance_documents ON public.remittance_documents
FOR DELETE TO authenticated
USING ((SELECT private.is_platform_admin()) OR uploaded_by = (SELECT auth.uid()));

REVOKE ALL ON public.remittance_sequences FROM anon, authenticated;
REVOKE ALL ON public.remittances, public.remittance_documents FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittances TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.remittance_documents TO authenticated;

CREATE OR REPLACE FUNCTION private.prepare_remittance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sequence_value bigint;
BEGIN
  IF NEW.remittance_number IS NULL OR btrim(NEW.remittance_number) = '' THEN
    INSERT INTO public.remittance_sequences (fiscal_year, next_number)
    VALUES (EXTRACT(YEAR FROM NEW.received_date)::integer, 2)
    ON CONFLICT (fiscal_year) DO UPDATE
      SET next_number = public.remittance_sequences.next_number + 1
    RETURNING next_number - 1 INTO sequence_value;
    NEW.remittance_number := format('REM-%s-%s', EXTRACT(YEAR FROM NEW.received_date)::integer, lpad(sequence_value::text, 6, '0'));
  END IF;
  NEW.customer_name := btrim(NEW.customer_name);
  NEW.currency := upper(NEW.currency);
  NEW.created_by := COALESCE(NEW.created_by, (SELECT auth.uid()));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS remittances_prepare ON public.remittances;
CREATE TRIGGER remittances_prepare BEFORE INSERT ON public.remittances
FOR EACH ROW EXECUTE FUNCTION private.prepare_remittance();

DROP TRIGGER IF EXISTS remittances_updated_at ON public.remittances;
CREATE TRIGGER remittances_updated_at BEFORE UPDATE ON public.remittances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON FUNCTION private.prepare_remittance() FROM PUBLIC, anon, authenticated;

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
  p_notes text
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
BEGIN
  IF NOT private.is_workspace_user() THEN RAISE EXCEPTION 'Workspace access required'; END IF;
  IF btrim(COALESCE(p_customer_name, '')) = '' THEN RAISE EXCEPTION 'Customer or sender name is required'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF p_status NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'New remittances must be pending or confirmed'; END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT * INTO linked_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    IF linked_invoice.currency <> upper(p_currency) THEN RAISE EXCEPTION 'Remittance currency must match invoice currency'; END IF;
    IF p_status = 'confirmed' AND p_amount > linked_invoice.balance_due THEN RAISE EXCEPTION 'Confirmed amount cannot exceed invoice balance'; END IF;
  END IF;

  INSERT INTO public.remittances (
    customer_id, invoice_id, customer_name, received_date, amount, currency,
    method, bank_reference, sender_bank, receiving_bank, status, notes, created_by
  ) VALUES (
    p_customer_id, p_invoice_id, btrim(p_customer_name), p_received_date, p_amount,
    upper(p_currency), p_method, NULLIF(btrim(p_bank_reference), ''),
    NULLIF(btrim(p_sender_bank), ''), NULLIF(btrim(p_receiving_bank), ''),
    p_status, NULLIF(btrim(p_notes), ''), (SELECT auth.uid())
  )
  RETURNING id, remittance_number INTO new_remittance_id, generated_remittance_number;

  IF p_invoice_id IS NOT NULL AND p_status = 'confirmed' THEN
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

REVOKE ALL ON FUNCTION public.create_remittance(uuid, uuid, text, date, numeric, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_remittance(uuid, uuid, text, date, numeric, text, text, text, text, text, text, text) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('remittance-documents', 'remittance-documents', false, 26214400, ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY remittance_documents_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'remittance-documents' AND (SELECT private.is_workspace_user()));

CREATE POLICY remittance_documents_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'remittance-documents'
  AND owner_id = (SELECT auth.uid()::text)
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  AND (SELECT private.is_workspace_user())
);

CREATE POLICY remittance_documents_storage_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'remittance-documents'
  AND ((SELECT private.is_platform_admin()) OR owner_id = (SELECT auth.uid()::text))
);

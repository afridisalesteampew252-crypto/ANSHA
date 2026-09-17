-- Phase 16: safe invoice/remittance editing and deletion.

CREATE OR REPLACE FUNCTION private.sync_remittance_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linked_invoice public.invoices%ROWTYPE;
  replacement_payment_id uuid;
  generated_reference text;
  financial_change boolean;
BEGIN
  financial_change :=
    NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    OR NEW.received_date IS DISTINCT FROM OLD.received_date
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.bank_reference IS DISTINCT FROM OLD.bank_reference
    OR NEW.status IS DISTINCT FROM OLD.status;

  IF NOT financial_change THEN
    IF NEW.invoice_payment_id IS DISTINCT FROM OLD.invoice_payment_id THEN
      RAISE EXCEPTION 'Linked payment cannot be changed directly';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF NEW.status NOT IN ('pending', 'confirmed', 'rejected', 'reversed') THEN
    RAISE EXCEPTION 'Invalid remittance status';
  END IF;

  IF OLD.invoice_payment_id IS NOT NULL THEN
    DELETE FROM public.invoice_payments WHERE id = OLD.invoice_payment_id;
    NEW.invoice_payment_id := NULL;
  END IF;

  IF NEW.invoice_id IS NOT NULL THEN
    SELECT * INTO linked_invoice FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    IF linked_invoice.currency <> upper(NEW.currency) THEN
      RAISE EXCEPTION 'Remittance currency must match invoice currency';
    END IF;
    IF NEW.status = 'confirmed' AND NEW.amount > linked_invoice.balance_due THEN
      RAISE EXCEPTION 'Confirmed amount cannot exceed invoice balance';
    END IF;
  END IF;

  NEW.currency := upper(NEW.currency);
  IF NEW.status = 'confirmed' AND NEW.invoice_id IS NOT NULL THEN
    generated_reference := COALESCE(NULLIF(btrim(NEW.bank_reference), ''), NEW.remittance_number);
    INSERT INTO public.invoice_payments (
      invoice_id, payment_date, amount, method, reference, notes, created_by
    ) VALUES (
      NEW.invoice_id, NEW.received_date, NEW.amount,
      CASE WHEN NEW.method IN ('bank_transfer', 'cash', 'card', 'cheque', 'other')
        THEN NEW.method ELSE 'other' END,
      generated_reference,
      'Applied from remittance ' || NEW.remittance_number,
      NEW.created_by
    ) RETURNING id INTO replacement_payment_id;
    NEW.invoice_payment_id := replacement_payment_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS remittances_sync_payment ON public.remittances;
CREATE TRIGGER remittances_sync_payment
BEFORE UPDATE OF invoice_id, invoice_payment_id, received_date, amount, currency, method, bank_reference, status
ON public.remittances
FOR EACH ROW EXECUTE FUNCTION private.sync_remittance_payment();

CREATE OR REPLACE FUNCTION private.cleanup_remittance_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.invoice_payment_id IS NOT NULL THEN
    DELETE FROM public.invoice_payments WHERE id = OLD.invoice_payment_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS remittances_cleanup_payment ON public.remittances;
CREATE TRIGGER remittances_cleanup_payment
BEFORE DELETE ON public.remittances
FOR EACH ROW EXECUTE FUNCTION private.cleanup_remittance_payment();

DROP POLICY IF EXISTS workspace_update_remittances ON public.remittances;
CREATE POLICY workspace_update_remittances ON public.remittances
FOR UPDATE TO authenticated
USING (
  (SELECT private.is_platform_admin())
  OR created_by = (SELECT auth.uid())
)
WITH CHECK (
  (SELECT private.is_platform_admin())
  OR created_by = (SELECT auth.uid())
);

DROP POLICY IF EXISTS admin_delete_invoices ON public.invoices;
CREATE POLICY admin_delete_invoices ON public.invoices
FOR DELETE TO authenticated
USING (
  (
    (SELECT private.is_platform_admin())
    OR (status = 'draft' AND created_by = (SELECT auth.uid()))
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.invoice_payments payment WHERE payment.invoice_id = invoices.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.remittances remittance WHERE remittance.invoice_id = invoices.id
  )
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
  p_items jsonb
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
  prospective_total numeric(14,2);
BEGIN
  IF NOT private.is_workspace_user() THEN RAISE EXCEPTION 'Workspace access required'; END IF;
  SELECT * INTO current_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found or access denied'; END IF;
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
    terms = NULLIF(btrim(p_terms), '')
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

    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, unit_price, discount_percent, tax_rate, sort_order,
      inventory_type, part_id, vehicle_id, inventory_reference
    ) VALUES (
      p_invoice_id, btrim(item->>'description'),
      COALESCE((item->>'quantity')::numeric, 1),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount_percent')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 5),
      item_count, item_type, item_part_id, item_vehicle_id,
      NULLIF(btrim(item->>'inventory_reference'), '')
    );
    item_count := item_count + 1;
  END LOOP;

  RETURN p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_v4(uuid, text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_invoice_v4(uuid, text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb)
TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_invoice_safely(p_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_workspace_user() THEN RAISE EXCEPTION 'Workspace access required'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoice_payments WHERE invoice_id = p_invoice_id) THEN
    RAISE EXCEPTION 'Delete linked payments or remittances before deleting this invoice';
  END IF;
  IF EXISTS (SELECT 1 FROM public.remittances WHERE invoice_id = p_invoice_id) THEN
    RAISE EXCEPTION 'Delete or unlink remittances before deleting this invoice';
  END IF;
  DELETE FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice cannot be deleted or was not found'; END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_invoice_safely(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_invoice_safely(uuid) TO authenticated;

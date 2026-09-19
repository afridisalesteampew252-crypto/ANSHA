-- create_invoice_v3 is SECURITY INVOKER and was calling
-- private.apply_receivable_invoice_stock, which has EXECUTE revoked from
-- authenticated (postgres only). Route through public.apply_invoice_stock
-- (SECURITY DEFINER, granted to authenticated).

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

  PERFORM public.apply_invoice_stock(new_invoice_id);
  RETURN new_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_v3(text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_v3(text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb)
TO authenticated;

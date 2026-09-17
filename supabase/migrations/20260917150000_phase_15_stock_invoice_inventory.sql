/* Phase 15: multi-origin stock, inventory-linked documents, and supplier invoice records. */

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS stock_origin text NOT NULL DEFAULT 'dubai',
  ADD COLUMN IF NOT EXISTS stock_status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS sold_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS stock_origin text NOT NULL DEFAULT 'dubai',
  ADD COLUMN IF NOT EXISTS stock_status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS sold_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_stock_origin_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_stock_origin_check
  CHECK (stock_origin IN ('japan','dubai','singapore','china','thailand','taiwan'));
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_stock_status_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_stock_status_check
  CHECK (stock_status IN ('available','reserved','sold'));

ALTER TABLE public.parts DROP CONSTRAINT IF EXISTS parts_stock_origin_check;
ALTER TABLE public.parts ADD CONSTRAINT parts_stock_origin_check
  CHECK (stock_origin IN ('japan','dubai','singapore','china','thailand','taiwan'));
ALTER TABLE public.parts DROP CONSTRAINT IF EXISTS parts_stock_status_check;
ALTER TABLE public.parts ADD CONSTRAINT parts_stock_status_check
  CHECK (stock_status IN ('available','reserved','sold'));

CREATE INDEX IF NOT EXISTS vehicles_public_stock_idx
  ON public.vehicles(stock_origin, stock_status, created_at DESC) WHERE is_published;
CREATE INDEX IF NOT EXISTS parts_public_stock_idx
  ON public.parts(stock_origin, stock_status, created_at DESC) WHERE is_published;
CREATE INDEX IF NOT EXISTS vehicles_sold_by_idx ON public.vehicles(sold_by);
CREATE INDEX IF NOT EXISTS parts_sold_by_idx ON public.parts(sold_by);

CREATE OR REPLACE FUNCTION private.sync_catalog_sold_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.stock_status = 'sold' AND OLD.stock_status IS DISTINCT FROM 'sold' THEN
    NEW.sold_at := now();
    NEW.sold_by := (SELECT auth.uid());
  ELSIF NEW.stock_status <> 'sold' THEN
    NEW.sold_at := NULL;
    NEW.sold_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicles_sync_sold_state ON public.vehicles;
CREATE TRIGGER vehicles_sync_sold_state
BEFORE UPDATE OF stock_status ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION private.sync_catalog_sold_state();

DROP TRIGGER IF EXISTS parts_sync_sold_state ON public.parts;
CREATE TRIGGER parts_sync_sold_state
BEFORE UPDATE OF stock_status ON public.parts
FOR EACH ROW EXECUTE FUNCTION private.sync_catalog_sold_state();

REVOKE ALL ON FUNCTION private.sync_catalog_sold_state() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_document_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_document_type_check
  CHECK (document_type IN (
    'delivery_note','tax_invoice','proforma_invoice','quotation','purchase_invoice','commercial_invoice'
  ));

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS inventory_type text,
  ADD COLUMN IF NOT EXISTS part_id uuid REFERENCES public.parts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_reference text;

ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_inventory_type_check;
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_inventory_type_check
  CHECK (inventory_type IS NULL OR inventory_type IN ('part','vehicle'));
ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_inventory_link_check;
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_inventory_link_check
  CHECK (
    (inventory_type IS NULL AND part_id IS NULL AND vehicle_id IS NULL)
    OR (inventory_type = 'part' AND part_id IS NOT NULL AND vehicle_id IS NULL)
    OR (inventory_type = 'vehicle' AND vehicle_id IS NOT NULL AND part_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS invoice_items_part_id_idx ON public.invoice_items(part_id);
CREATE INDEX IF NOT EXISTS invoice_items_vehicle_id_idx ON public.invoice_items(vehicle_id);
CREATE INDEX IF NOT EXISTS invoice_items_inventory_reference_idx ON public.invoice_items(inventory_reference);

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name text NOT NULL,
  invoice_number text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  total_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  reference text,
  notes text,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR (size_bytes >= 0 AND size_bytes <= 26214400)),
  created_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_invoices_invoice_date_idx ON public.supplier_invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS supplier_invoices_created_by_idx ON public.supplier_invoices(created_by);
CREATE INDEX IF NOT EXISTS supplier_invoices_supplier_name_idx ON public.supplier_invoices(lower(supplier_name));

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_read_supplier_invoices ON public.supplier_invoices
FOR SELECT TO authenticated USING ((SELECT private.is_workspace_user()));
CREATE POLICY workspace_insert_supplier_invoices ON public.supplier_invoices
FOR INSERT TO authenticated WITH CHECK (
  (SELECT private.is_workspace_user()) AND created_by = (SELECT auth.uid())
);
CREATE POLICY workspace_update_supplier_invoices ON public.supplier_invoices
FOR UPDATE TO authenticated USING ((SELECT private.is_workspace_user()))
WITH CHECK ((SELECT private.is_workspace_user()));
CREATE POLICY admin_delete_supplier_invoices ON public.supplier_invoices
FOR DELETE TO authenticated USING (
  (SELECT private.is_platform_admin()) OR created_by = (SELECT auth.uid())
);

REVOKE ALL ON public.supplier_invoices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoices TO authenticated;

DROP TRIGGER IF EXISTS supplier_invoices_updated_at ON public.supplier_invoices;
CREATE TRIGGER supplier_invoices_updated_at
BEFORE UPDATE ON public.supplier_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('supplier-invoices', 'supplier-invoices', false, 26214400, ARRAY[
  'image/jpeg','image/png','image/webp','application/pdf',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY supplier_invoices_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'supplier-invoices' AND (SELECT private.is_workspace_user()));

CREATE POLICY supplier_invoices_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'supplier-invoices'
  AND owner_id = (SELECT auth.uid()::text)
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  AND (SELECT private.is_workspace_user())
);

CREATE POLICY supplier_invoices_storage_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'supplier-invoices'
  AND ((SELECT private.is_platform_admin()) OR owner_id = (SELECT auth.uid()::text))
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

  RETURN new_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_v3(text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_v3(text, text, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb)
TO authenticated;

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
          'inventory_reference', item.inventory_reference,
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

-- Phase 55: accounts role + field-agent draft proforma invoice workflow.
-- Additive only. Does not broaden is_ops_user() (PO/GRN/catalog stay admin|staff).

-- ---------------------------------------------------------------------------
-- Role constraint
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS admin_profiles_role_check;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_role_check
  CHECK (role IN ('admin', 'staff', 'sales', 'freelancer', 'manager', 'accounts'));

COMMENT ON COLUMN public.admin_profiles.role IS
  'admin=account admin; staff=ops; sales/freelancer=field agents (catalog+own customers+reserve+draft proforma); manager=HR viewer; accounts=receivables/finance (invoices approve, remittances) not full admin.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_accounts_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true
      AND role = 'accounts'
  );
$$;

REVOKE ALL ON FUNCTION private.is_accounts_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_accounts_user() TO authenticated;

COMMENT ON FUNCTION private.is_accounts_user() IS
  'Phase 55: active admin_profiles.role = accounts (receivables / remittances / finance views).';

CREATE OR REPLACE FUNCTION private.can_manage_receivables()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_ops_user() OR private.is_accounts_user();
$$;

REVOKE ALL ON FUNCTION private.can_manage_receivables() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_receivables() TO authenticated;

COMMENT ON FUNCTION private.can_manage_receivables() IS
  'Phase 55: admin|staff|accounts — customer invoices, remittances, related finance views.';

CREATE OR REPLACE FUNCTION private.field_agent_owns_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices inv
    WHERE inv.id = p_invoice_id
      AND (SELECT private.is_field_agent())
      AND (
        inv.created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.customers c
          WHERE c.id = inv.customer_id
            AND c.owner_id = (SELECT auth.uid())
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.field_agent_owns_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.field_agent_owns_invoice(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Status / document-type gate (field agents cannot send or finalise)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.enforce_invoice_field_agent_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT private.is_field_agent()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.document_type IS DISTINCT FROM 'proforma_invoice' THEN
      RAISE EXCEPTION 'Field agents may only create proforma invoices';
    END IF;
    IF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Field agents may only create draft proforma invoices';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.document_type IS DISTINCT FROM 'proforma_invoice' OR OLD.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Field agents may only edit their draft proforma invoices';
  END IF;
  IF NEW.document_type IS DISTINCT FROM 'proforma_invoice' THEN
    RAISE EXCEPTION 'Field agents cannot change document type away from proforma';
  END IF;
  IF NEW.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Field agents cannot change invoice status; accounts must approve / mark sent';
  END IF;
  IF OLD.created_by IS DISTINCT FROM (SELECT auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM public.customers c
       WHERE c.id = OLD.customer_id AND c.owner_id = (SELECT auth.uid())
     )
  THEN
    RAISE EXCEPTION 'Field agents may only edit their own-book proforma invoices';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_field_agent_limits ON public.invoices;
CREATE TRIGGER invoices_field_agent_limits
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_invoice_field_agent_limits();

-- ---------------------------------------------------------------------------
-- create_invoice_v3: role + document-type gates (stock still via public.apply_invoice_stock)
-- ---------------------------------------------------------------------------
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

  IF private.is_field_agent() THEN
    IF p_document_type IS DISTINCT FROM 'proforma_invoice' THEN
      RAISE EXCEPTION 'Field agents may only create proforma invoices';
    END IF;
  ELSIF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Invoice create not allowed for this role';
  END IF;

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
    currency, reference, notes, terms, status, created_by
  ) VALUES (
    normalized_invoice_number, p_document_type, p_customer_id, btrim(p_customer_name),
    NULLIF(btrim(p_customer_company), ''), NULLIF(btrim(p_customer_email), ''),
    NULLIF(btrim(p_customer_phone), ''), NULLIF(btrim(p_customer_address), ''),
    NULLIF(btrim(p_customer_tax_registration_number), ''), '', '', '', p_issue_date,
    p_due_date, upper(p_currency), NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(p_notes), ''), NULLIF(btrim(p_terms), ''), 'draft', (SELECT auth.uid())
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

-- ---------------------------------------------------------------------------
-- update_invoice_v4: field agents = draft proforma only; accounts/ops = full
-- ---------------------------------------------------------------------------
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

  IF private.is_field_agent() THEN
    IF current_invoice.document_type IS DISTINCT FROM 'proforma_invoice'
       OR current_invoice.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Field agents may only edit draft proforma invoices';
    END IF;
    IF p_document_type IS DISTINCT FROM 'proforma_invoice' THEN
      RAISE EXCEPTION 'Field agents may only keep document type as proforma';
    END IF;
    IF current_invoice.created_by IS DISTINCT FROM (SELECT auth.uid())
       AND NOT EXISTS (
         SELECT 1 FROM public.customers c
         WHERE c.id = current_invoice.customer_id AND c.owner_id = (SELECT auth.uid())
       )
    THEN
      RAISE EXCEPTION 'Field agents may only edit their own-book proforma invoices';
    END IF;
  ELSIF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Invoice update not allowed for this role';
  END IF;

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

-- ---------------------------------------------------------------------------
-- Invoice RLS: receivables (ops+accounts) + field-agent draft proforma
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ops_read_invoices ON public.invoices;
DROP POLICY IF EXISTS ops_insert_invoices ON public.invoices;
DROP POLICY IF EXISTS ops_update_invoices ON public.invoices;
DROP POLICY IF EXISTS workspace_read_invoices ON public.invoices;
DROP POLICY IF EXISTS workspace_insert_invoices ON public.invoices;
DROP POLICY IF EXISTS workspace_update_invoices ON public.invoices;
DROP POLICY IF EXISTS admin_delete_invoices ON public.invoices;
DROP POLICY IF EXISTS field_agent_read_invoices ON public.invoices;
DROP POLICY IF EXISTS field_agent_insert_invoices ON public.invoices;
DROP POLICY IF EXISTS field_agent_update_invoices ON public.invoices;

CREATE POLICY receivables_read_invoices
  ON public.invoices FOR SELECT TO authenticated
  USING (
    (SELECT private.can_manage_receivables())
    OR (
      (SELECT private.is_field_agent())
      AND (
        created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.customers c
          WHERE c.id = invoices.customer_id AND c.owner_id = (SELECT auth.uid())
        )
      )
    )
  );

CREATE POLICY receivables_insert_invoices
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
      (SELECT private.can_manage_receivables())
      OR (
        (SELECT private.is_field_agent())
        AND document_type = 'proforma_invoice'
        AND status = 'draft'
      )
    )
  );

CREATE POLICY receivables_update_invoices
  ON public.invoices FOR UPDATE TO authenticated
  USING (
    (SELECT private.can_manage_receivables())
    OR (
      (SELECT private.is_field_agent())
      AND document_type = 'proforma_invoice'
      AND status = 'draft'
      AND (
        created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.customers c
          WHERE c.id = invoices.customer_id AND c.owner_id = (SELECT auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    (SELECT private.can_manage_receivables())
    OR (
      (SELECT private.is_field_agent())
      AND document_type = 'proforma_invoice'
      AND status = 'draft'
      AND (
        created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.customers c
          WHERE c.id = invoices.customer_id AND c.owner_id = (SELECT auth.uid())
        )
      )
    )
  );

CREATE POLICY admin_delete_invoices
  ON public.invoices FOR DELETE TO authenticated
  USING (
    (
      (SELECT private.is_platform_admin())
      OR (
        status = 'draft'
        AND created_by = (SELECT auth.uid())
        AND (
          (SELECT private.can_manage_receivables())
          OR (
            (SELECT private.is_field_agent())
            AND document_type = 'proforma_invoice'
          )
        )
      )
    )
    AND NOT EXISTS (SELECT 1 FROM public.invoice_payments payment WHERE payment.invoice_id = invoices.id)
    AND NOT EXISTS (SELECT 1 FROM public.remittances remittance WHERE remittance.invoice_id = invoices.id)
  );

-- ---------------------------------------------------------------------------
-- Invoice items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ops_read_invoice_items ON public.invoice_items;
DROP POLICY IF EXISTS ops_insert_invoice_items ON public.invoice_items;
DROP POLICY IF EXISTS ops_update_invoice_items ON public.invoice_items;
DROP POLICY IF EXISTS ops_delete_invoice_items ON public.invoice_items;
DROP POLICY IF EXISTS workspace_read_invoice_items ON public.invoice_items;
DROP POLICY IF EXISTS workspace_insert_invoice_items ON public.invoice_items;
DROP POLICY IF EXISTS workspace_update_invoice_items ON public.invoice_items;
DROP POLICY IF EXISTS workspace_delete_invoice_items ON public.invoice_items;

CREATE POLICY receivables_read_invoice_items
  ON public.invoice_items FOR SELECT TO authenticated
  USING (
    (SELECT private.can_manage_receivables())
    OR (SELECT private.field_agent_owns_invoice(invoice_id))
  );

CREATE POLICY receivables_insert_invoice_items
  ON public.invoice_items FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.can_manage_receivables())
    OR EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND (SELECT private.is_field_agent())
        AND inv.document_type = 'proforma_invoice'
        AND inv.status = 'draft'
        AND (
          inv.created_by = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.customers c
            WHERE c.id = inv.customer_id AND c.owner_id = (SELECT auth.uid())
          )
        )
    )
  );

CREATE POLICY receivables_update_invoice_items
  ON public.invoice_items FOR UPDATE TO authenticated
  USING (
    (SELECT private.can_manage_receivables())
    OR EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND (SELECT private.is_field_agent())
        AND inv.document_type = 'proforma_invoice'
        AND inv.status = 'draft'
        AND (
          inv.created_by = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.customers c
            WHERE c.id = inv.customer_id AND c.owner_id = (SELECT auth.uid())
          )
        )
    )
  )
  WITH CHECK (
    (SELECT private.can_manage_receivables())
    OR EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND (SELECT private.is_field_agent())
        AND inv.document_type = 'proforma_invoice'
        AND inv.status = 'draft'
        AND (
          inv.created_by = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.customers c
            WHERE c.id = inv.customer_id AND c.owner_id = (SELECT auth.uid())
          )
        )
    )
  );

CREATE POLICY receivables_delete_invoice_items
  ON public.invoice_items FOR DELETE TO authenticated
  USING (
    (SELECT private.is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND inv.status = 'draft'
        AND (
          (SELECT private.can_manage_receivables())
          OR (
            (SELECT private.is_field_agent())
            AND inv.document_type = 'proforma_invoice'
            AND inv.created_by = (SELECT auth.uid())
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Invoice payments: receivables only (field agents cannot record payments)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ops_read_invoice_payments ON public.invoice_payments;
DROP POLICY IF EXISTS ops_insert_invoice_payments ON public.invoice_payments;
DROP POLICY IF EXISTS ops_delete_invoice_payments ON public.invoice_payments;
DROP POLICY IF EXISTS workspace_read_invoice_payments ON public.invoice_payments;
DROP POLICY IF EXISTS workspace_insert_invoice_payments ON public.invoice_payments;
DROP POLICY IF EXISTS admin_delete_invoice_payments ON public.invoice_payments;

CREATE POLICY receivables_read_invoice_payments
  ON public.invoice_payments FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_receivables()));

CREATE POLICY receivables_insert_invoice_payments
  ON public.invoice_payments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.can_manage_receivables())
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY receivables_delete_invoice_payments
  ON public.invoice_payments FOR DELETE TO authenticated
  USING (
    (SELECT private.is_platform_admin())
    OR (
      created_by = (SELECT auth.uid())
      AND (SELECT private.can_manage_receivables())
    )
  );

-- ---------------------------------------------------------------------------
-- Remittances: ops + accounts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ops_read_remittances ON public.remittances;
DROP POLICY IF EXISTS ops_insert_remittances ON public.remittances;
DROP POLICY IF EXISTS ops_update_remittances ON public.remittances;

CREATE POLICY receivables_read_remittances
  ON public.remittances FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_receivables()));

CREATE POLICY receivables_insert_remittances
  ON public.remittances FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.can_manage_receivables())
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY receivables_update_remittances
  ON public.remittances FOR UPDATE TO authenticated
  USING ((SELECT private.can_manage_receivables()))
  WITH CHECK ((SELECT private.can_manage_receivables()));

-- ---------------------------------------------------------------------------
-- Finance views for accounts (SELECT / manage expenses; bank SELECT+UPDATE; not create/delete bank)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS workspace_select_bank_accounts ON public.bank_accounts;
CREATE POLICY workspace_select_bank_accounts
  ON public.bank_accounts FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_receivables()));

DROP POLICY IF EXISTS workspace_update_bank_accounts ON public.bank_accounts;
CREATE POLICY workspace_update_bank_accounts
  ON public.bank_accounts FOR UPDATE TO authenticated
  USING ((SELECT private.can_manage_receivables()))
  WITH CHECK ((SELECT private.can_manage_receivables()));

DROP POLICY IF EXISTS workspace_manage_bank_transactions ON public.bank_transactions;
CREATE POLICY workspace_manage_bank_transactions
  ON public.bank_transactions FOR ALL TO authenticated
  USING ((SELECT private.can_manage_receivables()))
  WITH CHECK ((SELECT private.can_manage_receivables()));

DROP POLICY IF EXISTS workspace_manage_expenses ON public.expenses;
CREATE POLICY workspace_manage_expenses
  ON public.expenses FOR ALL TO authenticated
  USING ((SELECT private.can_manage_receivables()))
  WITH CHECK ((SELECT private.can_manage_receivables()));

-- Customers: accounts need full customer book for AR (ops + accounts + field own-book)
DROP POLICY IF EXISTS workspace_select_customers ON public.customers;
DROP POLICY IF EXISTS workspace_insert_customers ON public.customers;
DROP POLICY IF EXISTS workspace_update_customers ON public.customers;

CREATE POLICY workspace_select_customers
  ON public.customers FOR SELECT TO authenticated
  USING (
    (SELECT private.can_manage_receivables())
    OR ((SELECT private.is_field_agent()) AND owner_id = (SELECT auth.uid()))
  );

CREATE POLICY workspace_insert_customers
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.can_manage_receivables())
    OR ((SELECT private.is_field_agent()) AND owner_id = (SELECT auth.uid()))
  );

CREATE POLICY workspace_update_customers
  ON public.customers FOR UPDATE TO authenticated
  USING (
    (SELECT private.can_manage_receivables())
    OR ((SELECT private.is_field_agent()) AND owner_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT private.can_manage_receivables())
    OR ((SELECT private.is_field_agent()) AND owner_id = (SELECT auth.uid()))
  );

-- Remittance allocations + expense categories + supplier invoice + GL/VAT SELECT
DROP POLICY IF EXISTS ops_read_remittance_allocations ON public.remittance_allocations;
DROP POLICY IF EXISTS ops_insert_remittance_allocations ON public.remittance_allocations;
DROP POLICY IF EXISTS ops_delete_remittance_allocations ON public.remittance_allocations;
DROP POLICY IF EXISTS receivables_read_remittance_allocations ON public.remittance_allocations;
DROP POLICY IF EXISTS receivables_insert_remittance_allocations ON public.remittance_allocations;
DROP POLICY IF EXISTS receivables_delete_remittance_allocations ON public.remittance_allocations;

CREATE POLICY receivables_read_remittance_allocations
  ON public.remittance_allocations FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_receivables()));

CREATE POLICY receivables_insert_remittance_allocations
  ON public.remittance_allocations FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_manage_receivables()));

CREATE POLICY receivables_delete_remittance_allocations
  ON public.remittance_allocations FOR DELETE TO authenticated
  USING (
    (SELECT private.is_platform_admin())
    OR (SELECT private.can_manage_receivables())
  );

DROP POLICY IF EXISTS workspace_manage_expense_categories ON public.expense_categories;
CREATE POLICY workspace_manage_expense_categories
  ON public.expense_categories FOR ALL TO authenticated
  USING ((SELECT private.can_manage_receivables()))
  WITH CHECK ((SELECT private.can_manage_receivables()));

DROP POLICY IF EXISTS ops_read_supplier_invoices ON public.supplier_invoices;
DROP POLICY IF EXISTS ops_insert_supplier_invoices ON public.supplier_invoices;
DROP POLICY IF EXISTS ops_update_supplier_invoices ON public.supplier_invoices;
DROP POLICY IF EXISTS workspace_read_supplier_invoices ON public.supplier_invoices;
DROP POLICY IF EXISTS workspace_insert_supplier_invoices ON public.supplier_invoices;
DROP POLICY IF EXISTS workspace_update_supplier_invoices ON public.supplier_invoices;

CREATE POLICY receivables_read_supplier_invoices
  ON public.supplier_invoices FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_receivables()));

CREATE POLICY receivables_insert_supplier_invoices
  ON public.supplier_invoices FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_manage_receivables()));

CREATE POLICY receivables_update_supplier_invoices
  ON public.supplier_invoices FOR UPDATE TO authenticated
  USING ((SELECT private.can_manage_receivables()))
  WITH CHECK ((SELECT private.can_manage_receivables()));

DROP POLICY IF EXISTS workspace_select_gl_accounts ON public.gl_accounts;
CREATE POLICY workspace_select_gl_accounts
  ON public.gl_accounts FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_receivables()));

DROP POLICY IF EXISTS ops_select_vat_return_periods ON public.vat_return_periods;
CREATE POLICY receivables_select_vat_return_periods
  ON public.vat_return_periods FOR SELECT TO authenticated
  USING ((SELECT private.can_manage_receivables()));

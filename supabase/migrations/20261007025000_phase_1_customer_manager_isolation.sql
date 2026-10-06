/*
  Phase 1: customer ownership and manager isolation.

  Managers may see and reassign only customers already assigned to them.
  Account admins retain global assignment. Ops/accounts keep their existing
  receivables scope, while field agents remain limited to their own book.
*/

CREATE OR REPLACE FUNCTION private.is_manager()
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
      AND role = 'manager'
  );
$$;

REVOKE ALL ON FUNCTION private.is_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_manager() TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_customer_owner_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  caller_role text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
    RETURN NEW;
  END IF;

  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT role INTO caller_role
  FROM public.admin_profiles
  WHERE id = caller_id AND is_active = true;

  IF NEW.owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = NEW.owner_id
      AND is_active = true
      AND role IN ('admin', 'manager', 'sales', 'freelancer')
  ) THEN
    RAISE EXCEPTION 'Customers may only be assigned to an active admin, manager, sales agent, or freelancer'
      USING ERRCODE = '42501';
  END IF;

  IF caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND (
    NEW.owner_id IS NULL
    OR (NEW.owner_id = caller_id AND caller_role IN ('manager', 'sales', 'freelancer'))
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND caller_role = 'manager'
     AND OLD.owner_id = caller_id THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You cannot change this customer account owner'
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_customer_owner(
  p_customer_id uuid,
  p_owner_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  caller_role text;
  previous_owner uuid;
  assigned_name text;
  assigned_role text;
BEGIN
  SELECT role INTO caller_role
  FROM public.admin_profiles
  WHERE id = caller_id AND is_active = true;

  IF caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Only an admin or manager can assign customers'
      USING ERRCODE = '42501';
  END IF;

  SELECT owner_id INTO previous_owner
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF caller_role = 'manager' AND previous_owner IS DISTINCT FROM caller_id THEN
    RAISE EXCEPTION 'Managers may only reassign customers currently assigned to them'
      USING ERRCODE = '42501';
  END IF;

  IF p_owner_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(full_name), ''), email, 'Team member'), role
    INTO assigned_name, assigned_role
    FROM public.admin_profiles
    WHERE id = p_owner_id
      AND is_active = true
      AND role IN ('admin', 'manager', 'sales', 'freelancer');

    IF assigned_role IS NULL THEN
      RAISE EXCEPTION 'Select an active admin, manager, sales agent, or freelancer';
    END IF;
  END IF;

  UPDATE public.customers
  SET owner_id = p_owner_id, updated_at = now()
  WHERE id = p_customer_id;

  PERFORM private.write_audit_log(
    'customer_owner_changed',
    'customer',
    p_customer_id,
    jsonb_build_object('previous_owner_id', previous_owner, 'owner_id', p_owner_id)
  );

  RETURN jsonb_build_object(
    'customer_id', p_customer_id,
    'owner_id', p_owner_id,
    'owner_name', assigned_name,
    'owner_role', assigned_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_customer_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_customer_owner(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS workspace_select_customers ON public.customers;
CREATE POLICY workspace_select_customers ON public.customers
FOR SELECT TO authenticated
USING (
  (SELECT private.can_manage_receivables())
  OR (
    ((SELECT private.is_field_agent()) OR (SELECT private.is_manager()))
    AND owner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS workspace_insert_customers ON public.customers;
CREATE POLICY workspace_insert_customers ON public.customers
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT private.can_manage_receivables())
  OR (
    ((SELECT private.is_field_agent()) OR (SELECT private.is_manager()))
    AND owner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS workspace_update_customers ON public.customers;
CREATE POLICY workspace_update_customers ON public.customers
FOR UPDATE TO authenticated
USING (
  (SELECT private.can_manage_receivables())
  OR (
    ((SELECT private.is_field_agent()) OR (SELECT private.is_manager()))
    AND owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  (SELECT private.can_manage_receivables())
  OR (
    ((SELECT private.is_field_agent()) OR (SELECT private.is_manager()))
    AND owner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS receivables_read_invoices ON public.invoices;
CREATE POLICY receivables_read_invoices ON public.invoices
FOR SELECT TO authenticated
USING (
  (SELECT private.can_manage_receivables())
  OR (
    ((SELECT private.is_field_agent()) OR (SELECT private.is_manager()))
    AND owner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS receivables_update_invoices ON public.invoices;
CREATE POLICY receivables_update_invoices ON public.invoices
FOR UPDATE TO authenticated
USING (
  (SELECT private.can_manage_receivables())
  OR (
    (SELECT private.is_field_agent())
    AND document_type = 'proforma_invoice'
    AND status = 'draft'
    AND owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  (SELECT private.can_manage_receivables())
  OR (
    (SELECT private.is_field_agent())
    AND document_type = 'proforma_invoice'
    AND status = 'draft'
    AND owner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS receivables_read_invoice_items ON public.invoice_items;
CREATE POLICY receivables_read_invoice_items ON public.invoice_items
FOR SELECT TO authenticated
USING (
  (SELECT private.can_manage_receivables())
  OR (SELECT private.field_agent_owns_invoice(invoice_id))
  OR (
    (SELECT private.is_manager())
    AND EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND inv.owner_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS receivables_read_remittances ON public.remittances;
CREATE POLICY receivables_read_remittances ON public.remittances
FOR SELECT TO authenticated
USING (
  (SELECT private.can_manage_receivables())
  OR owner_id = (SELECT auth.uid())
);

DROP POLICY IF EXISTS receivables_update_remittances ON public.remittances;
CREATE POLICY receivables_update_remittances ON public.remittances
FOR UPDATE TO authenticated
USING ((SELECT private.can_manage_receivables()))
WITH CHECK ((SELECT private.can_manage_receivables()));

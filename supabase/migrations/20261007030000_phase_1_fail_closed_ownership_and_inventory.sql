-- Complete the Phase 1 boundaries for NULL roles, reservation releases and
-- direct table writes. Definer RPCs still pass through the row triggers.
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

  -- NULL NOT IN (...) is NULL, which a PL/pgSQL IF does not treat as true.
  IF caller_id IS NULL OR caller_role IS NULL OR caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Only an admin or manager can assign customers'
      USING ERRCODE = '42501';
  END IF;

  SELECT owner_id INTO previous_owner FROM public.customers
  WHERE id = p_customer_id FOR UPDATE;
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
    WHERE id = p_owner_id AND is_active = true
      AND role IN ('admin', 'manager', 'sales', 'freelancer');
    IF assigned_role IS NULL THEN
      RAISE EXCEPTION 'Select an active admin, manager, sales agent, or freelancer';
    END IF;
  END IF;

  UPDATE public.customers SET owner_id = p_owner_id, updated_at = now()
  WHERE id = p_customer_id;
  PERFORM private.write_audit_log(
    'customer_owner_changed', 'customer', p_customer_id,
    jsonb_build_object('previous_owner_id', previous_owner, 'owner_id', p_owner_id)
  );
  RETURN jsonb_build_object(
    'customer_id', p_customer_id, 'owner_id', p_owner_id,
    'owner_name', assigned_name, 'owner_role', assigned_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_customer_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_customer_owner(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_inventory_reservation_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  reservation_changed boolean;
BEGIN
  IF (SELECT auth.role()) = 'service_role' OR (SELECT private.is_ops_user()) THEN
    RETURN NEW;
  END IF;

  -- Publishing cannot be smuggled through release_*_reservation(p_republish).
  IF TG_OP = 'UPDATE' AND NEW.is_published IS DISTINCT FROM OLD.is_published
     AND NOT (NEW.is_published = false AND NEW.stock_status = 'reserved') THEN
    IF NOT (SELECT private.is_manager())
       OR NOT (SELECT private.can_access_stock_origin(OLD.stock_origin))
       OR NOT (SELECT private.can_access_stock_origin(NEW.stock_origin)) THEN
      RAISE EXCEPTION 'Inventory publishing access required' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    reservation_changed := NEW.stock_status = 'reserved';
  ELSE
    reservation_changed := NEW.stock_status IS DISTINCT FROM OLD.stock_status
      OR NEW.reserved_customer_id IS DISTINCT FROM OLD.reserved_customer_id
      OR NEW.reserved_by IS DISTINCT FROM OLD.reserved_by
      OR NEW.stock_origin IS DISTINCT FROM OLD.stock_origin;
  END IF;

  IF NOT reservation_changed THEN
    RETURN NEW;
  END IF;

  -- An approved customer assignment cascades reservation ownership. This is
  -- nested under the customers AFTER trigger, and may change only ownership
  -- metadata on the same reservation; it cannot reserve/release stock.
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1
     AND (SELECT private.is_manager())
     AND OLD.reserved_by = caller_id
     AND NEW.stock_status = 'reserved' AND OLD.stock_status = 'reserved'
     AND NEW.reserved_customer_id = OLD.reserved_customer_id
     AND NEW.stock_origin IS NOT DISTINCT FROM OLD.stock_origin
     AND NEW.is_published IS NOT DISTINCT FROM OLD.is_published
     AND EXISTS (
       SELECT 1 FROM public.customers c
       WHERE c.id = NEW.reserved_customer_id
         AND c.owner_id IS NOT DISTINCT FROM NEW.reserved_by
     ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.stock_status = 'reserved' THEN
    IF NEW.stock_status = 'sold' AND (SELECT private.can_manage_receivables()) THEN
      -- Accounts finalise approved invoice stock via the receivables RPC.
      RETURN NEW;
    END IF;
    IF (SELECT private.is_manager()) THEN
      IF NOT (SELECT private.can_access_stock_origin(OLD.stock_origin))
         OR NOT EXISTS (
           SELECT 1 FROM public.customers c
           WHERE c.id = OLD.reserved_customer_id AND c.owner_id = caller_id
         ) THEN
        RAISE EXCEPTION 'Managers may release only assigned-origin reservations for their own customers'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NOT (SELECT private.is_field_agent()) OR OLD.reserved_by IS DISTINCT FROM caller_id THEN
      RAISE EXCEPTION 'You can only release your own reservations' USING ERRCODE = '42501';
    END IF;
    IF NEW.stock_status NOT IN ('reserved', 'available') THEN
      RAISE EXCEPTION 'Receivables access required to finalise reserved stock' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.stock_status = 'reserved' THEN
    IF (SELECT private.is_manager()) THEN
      IF NOT (SELECT private.can_access_stock_origin(NEW.stock_origin)) THEN
        RAISE EXCEPTION 'Managers may reserve only assigned-origin stock' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT (SELECT private.is_field_agent()) THEN
      RAISE EXCEPTION 'Inventory reservation access required' USING ERRCODE = '42501';
    END IF;
    IF NEW.reserved_by IS DISTINCT FROM caller_id
       OR NEW.reserved_customer_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.customers c
         WHERE c.id = NEW.reserved_customer_id AND c.owner_id = caller_id
       ) THEN
      RAISE EXCEPTION 'Reserve stock only for customers assigned to you and under your own user ID'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_inventory_reservation_scope() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_vehicle_reservation_scope ON public.vehicles;
CREATE TRIGGER guard_vehicle_reservation_scope
BEFORE INSERT OR UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION private.guard_inventory_reservation_scope();
DROP TRIGGER IF EXISTS guard_part_reservation_scope ON public.parts;
CREATE TRIGGER guard_part_reservation_scope
BEFORE INSERT OR UPDATE ON public.parts
FOR EACH ROW EXECUTE FUNCTION private.guard_inventory_reservation_scope();

-- Field agents use reserve/release RPCs, which cannot modify arbitrary catalog
-- columns. Accounts retain their guarded price/invoice RPCs. A generic table
-- UPDATE previously allowed every active workspace profile to alter stock.
DROP POLICY IF EXISTS admin_insert_vehicles ON public.vehicles;
CREATE POLICY admin_insert_vehicles ON public.vehicles
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT private.is_ops_user())
  OR ((SELECT private.is_manager()) AND (SELECT private.can_access_stock_origin(stock_origin)))
);

-- A workspace member must not remap a portal identity to another customer's
-- records. Customer access is derived from this link, making it administrative.
DROP POLICY IF EXISTS workspace_manage_customer_profiles ON public.customer_profiles;
CREATE POLICY workspace_manage_customer_profiles ON public.customer_profiles
FOR ALL TO authenticated
USING ((SELECT private.is_account_admin()))
WITH CHECK ((SELECT private.is_account_admin()));
DROP POLICY IF EXISTS customer_read_own_profile ON public.customer_profiles;
CREATE POLICY customer_read_own_profile ON public.customer_profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR (SELECT private.can_manage_receivables())
  OR EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_profiles.customer_id AND c.owner_id = (SELECT auth.uid())
      AND ((SELECT private.is_manager()) OR (SELECT private.is_field_agent()))
  )
);
DROP POLICY IF EXISTS admin_update_vehicles ON public.vehicles;
CREATE POLICY admin_update_vehicles ON public.vehicles
FOR UPDATE TO authenticated
USING (
  (SELECT private.is_ops_user())
  OR ((SELECT private.is_manager()) AND (SELECT private.can_access_stock_origin(stock_origin)))
)
WITH CHECK (
  (SELECT private.is_ops_user())
  OR ((SELECT private.is_manager()) AND (SELECT private.can_access_stock_origin(stock_origin)))
);
DROP POLICY IF EXISTS admin_insert_parts ON public.parts;
CREATE POLICY admin_insert_parts ON public.parts
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT private.is_ops_user())
  OR ((SELECT private.is_manager()) AND (SELECT private.can_access_stock_origin(stock_origin)))
);
DROP POLICY IF EXISTS admin_update_parts ON public.parts;
CREATE POLICY admin_update_parts ON public.parts
FOR UPDATE TO authenticated
USING (
  (SELECT private.is_ops_user())
  OR ((SELECT private.is_manager()) AND (SELECT private.can_access_stock_origin(stock_origin)))
)
WITH CHECK (
  (SELECT private.is_ops_user())
  OR ((SELECT private.is_manager()) AND (SELECT private.can_access_stock_origin(stock_origin)))
);

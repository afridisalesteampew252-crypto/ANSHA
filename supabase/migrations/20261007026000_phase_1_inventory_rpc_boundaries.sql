/*
  Phase 1: inventory mutation boundaries.

  Reservations are ops actions, or scoped field-agent/manager actions for the
  caller's own customer book. Managers must also be assigned to the stock
  origin. Accounts/customer roles cannot reserve inventory. Publishing is
  limited to ops or a manager's assigned origin, and manual invoice-stock
  application is receivables-only.
*/

CREATE OR REPLACE FUNCTION private.guard_inventory_reservation_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.stock_status = 'reserved'
     AND (
       OLD.stock_status IS DISTINCT FROM 'reserved'
       OR NEW.reserved_customer_id IS DISTINCT FROM OLD.reserved_customer_id
     ) THEN
    IF (SELECT private.is_ops_user()) THEN
      RETURN NEW;
    END IF;

    IF (SELECT private.is_manager()) THEN
      IF NEW.reserved_customer_id IS NULL
         OR NOT (SELECT private.can_access_stock_origin(NEW.stock_origin))
         OR NOT EXISTS (
           SELECT 1
           FROM public.customers c
           WHERE c.id = NEW.reserved_customer_id
             AND c.owner_id = (SELECT auth.uid())
         ) THEN
        RAISE EXCEPTION 'Managers may reserve only assigned-origin stock for customers assigned to them'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;

    IF NOT (SELECT private.is_field_agent()) THEN
      RAISE EXCEPTION 'Inventory reservation access required'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.reserved_customer_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.id = NEW.reserved_customer_id
        AND c.owner_id = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'Field agents may reserve stock only for customers assigned to them'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_inventory_reservation_scope()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_vehicle_reservation_scope ON public.vehicles;
CREATE TRIGGER guard_vehicle_reservation_scope
BEFORE UPDATE OF stock_status, reserved_customer_id ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION private.guard_inventory_reservation_scope();

DROP TRIGGER IF EXISTS guard_part_reservation_scope ON public.parts;
CREATE TRIGGER guard_part_reservation_scope
BEFORE UPDATE OF stock_status, reserved_customer_id ON public.parts
FOR EACH ROW EXECUTE FUNCTION private.guard_inventory_reservation_scope();

CREATE OR REPLACE FUNCTION public.set_vehicle_public_listing(
  p_vehicle_id uuid,
  p_publish boolean
)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  vehicle_row public.vehicles%ROWTYPE;
BEGIN
  SELECT * INTO vehicle_row
  FROM public.vehicles
  WHERE id = p_vehicle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  IF NOT private.is_ops_user()
     AND NOT (
       private.is_manager()
       AND private.can_access_stock_origin(vehicle_row.stock_origin)
     ) THEN
    RAISE EXCEPTION 'Inventory publishing access required' USING ERRCODE = '42501';
  END IF;

  IF p_publish AND vehicle_row.stock_status IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'Only available vehicles can be published';
  END IF;

  UPDATE public.vehicles
  SET is_published = p_publish,
      updated_at = now()
  WHERE id = p_vehicle_id
  RETURNING * INTO vehicle_row;

  RETURN vehicle_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_vehicle_public_listing(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_vehicle_public_listing(uuid, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_invoice_stock(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Receivables access required' USING ERRCODE = '42501';
  END IF;
  PERFORM private.apply_receivable_invoice_stock(p_invoice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_invoice_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_invoice_stock(uuid) TO authenticated;

-- Clear reservation fields whenever parts/vehicles become available.
-- Fixes stale requester badges when stock is set to Available via list dropdown
-- (bypassing release_*_reservation RPCs).

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

  -- Any path that marks stock available must drop reservation metadata
  -- (release RPCs, stock dropdown, invoice restore, etc.).
  IF NEW.stock_status = 'available' AND OLD.stock_status IS DISTINCT FROM 'available' THEN
    NEW.reserved_customer_id := NULL;
    NEW.reserved_by := NULL;
    NEW.reservation_price_term := NULL;
    NEW.reservation_shipment_term := NULL;
    NEW.reservation_inspection_required := NULL;
    NEW.reservation_vat_applicable := NULL;
    NEW.reservation_etd := NULL;
    NEW.reservation_eta := NULL;
    NEW.reservation_requester_name := NULL;
    NEW.reservation_requester_role := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_catalog_sold_state() FROM PUBLIC, anon, authenticated;

-- Ensure release RPCs still null reservation fields explicitly.
CREATE OR REPLACE FUNCTION public.release_part_reservation(
  p_part_id uuid,
  p_republish boolean DEFAULT false
)
RETURNS public.parts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.parts%ROWTYPE;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  IF private.is_field_agent() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.parts
      WHERE id = p_part_id
        AND stock_status = 'reserved'
        AND reserved_by = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'You can only release your own reservations';
    END IF;
  END IF;

  UPDATE public.parts SET
    stock_status = 'available',
    reserved_customer_id = NULL,
    reserved_by = NULL,
    reservation_price_term = NULL,
    reservation_shipment_term = NULL,
    reservation_inspection_required = NULL,
    reservation_vat_applicable = NULL,
    reservation_etd = NULL,
    reservation_eta = NULL,
    reservation_requester_name = NULL,
    reservation_requester_role = NULL,
    is_published = CASE WHEN COALESCE(p_republish, false) THEN true ELSE is_published END,
    updated_at = now()
  WHERE id = p_part_id
    AND stock_status = 'reserved'
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Part is not reserved';
  END IF;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.release_part_reservation(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_part_reservation(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_vehicle_reservation(
  p_vehicle_id uuid,
  p_republish boolean DEFAULT false
)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.vehicles%ROWTYPE;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  IF private.is_field_agent() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE id = p_vehicle_id
        AND stock_status = 'reserved'
        AND reserved_by = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'You can only release your own reservations';
    END IF;
  END IF;

  UPDATE public.vehicles SET
    stock_status = 'available',
    reserved_customer_id = NULL,
    reserved_by = NULL,
    reservation_price_term = NULL,
    reservation_shipment_term = NULL,
    reservation_inspection_required = NULL,
    reservation_vat_applicable = NULL,
    reservation_etd = NULL,
    reservation_eta = NULL,
    reservation_requester_name = NULL,
    reservation_requester_role = NULL,
    is_published = CASE WHEN COALESCE(p_republish, false) THEN true ELSE is_published END,
    updated_at = now()
  WHERE id = p_vehicle_id
    AND stock_status = 'reserved'
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Vehicle is not reserved';
  END IF;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.release_vehicle_reservation(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_vehicle_reservation(uuid, boolean) TO authenticated;

-- One-shot: clear stale reservation metadata on already-available rows.
UPDATE public.parts SET
  reserved_customer_id = NULL,
  reserved_by = NULL,
  reservation_price_term = NULL,
  reservation_shipment_term = NULL,
  reservation_inspection_required = NULL,
  reservation_vat_applicable = NULL,
  reservation_etd = NULL,
  reservation_eta = NULL,
  reservation_requester_name = NULL,
  reservation_requester_role = NULL,
  updated_at = now()
WHERE stock_status = 'available'
  AND (
    reserved_customer_id IS NOT NULL
    OR reserved_by IS NOT NULL
    OR reservation_price_term IS NOT NULL
    OR reservation_shipment_term IS NOT NULL
    OR reservation_inspection_required IS NOT NULL
    OR reservation_vat_applicable IS NOT NULL
    OR reservation_etd IS NOT NULL
    OR reservation_eta IS NOT NULL
    OR reservation_requester_name IS NOT NULL
    OR reservation_requester_role IS NOT NULL
  );

UPDATE public.vehicles SET
  reserved_customer_id = NULL,
  reserved_by = NULL,
  reservation_price_term = NULL,
  reservation_shipment_term = NULL,
  reservation_inspection_required = NULL,
  reservation_vat_applicable = NULL,
  reservation_etd = NULL,
  reservation_eta = NULL,
  reservation_requester_name = NULL,
  reservation_requester_role = NULL,
  updated_at = now()
WHERE stock_status = 'available'
  AND (
    reserved_customer_id IS NOT NULL
    OR reserved_by IS NOT NULL
    OR reservation_price_term IS NOT NULL
    OR reservation_shipment_term IS NOT NULL
    OR reservation_inspection_required IS NOT NULL
    OR reservation_vat_applicable IS NOT NULL
    OR reservation_etd IS NOT NULL
    OR reservation_eta IS NOT NULL
    OR reservation_requester_name IS NOT NULL
    OR reservation_requester_role IS NOT NULL
  );

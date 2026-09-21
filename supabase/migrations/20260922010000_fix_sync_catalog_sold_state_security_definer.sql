-- Fix: Make Available failed with
--   permission denied for function clear_reservation_buying_documents
--
-- Root cause: private.sync_catalog_sold_state() was SECURITY INVOKER. When a
-- workspace user set stock_status → available, the trigger ran as that user and
-- could not EXECUTE private.clear_reservation_buying_documents (REVOKE ALL from
-- PUBLIC/anon/authenticated). Make the trigger SECURITY DEFINER so it can clear
-- unpaid reservation proformas for that vehicle/part and null requester fields.

CREATE OR REPLACE FUNCTION private.sync_catalog_sold_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
  -- (release RPCs, stock dropdown / Make Available, invoice restore, etc.).
  IF NEW.stock_status = 'available' AND OLD.stock_status IS DISTINCT FROM 'available' THEN
    IF TG_TABLE_NAME = 'vehicles' THEN
      PERFORM private.clear_reservation_buying_documents(NEW.id, NULL);
    ELSIF TG_TABLE_NAME = 'parts' THEN
      PERFORM private.clear_reservation_buying_documents(NULL, NEW.id);
    END IF;

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

-- Keep clear helper DEFINER + uncallable from clients; only trigger/owner paths.
ALTER FUNCTION private.clear_reservation_buying_documents(uuid, uuid) SECURITY DEFINER;
REVOKE ALL ON FUNCTION private.clear_reservation_buying_documents(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION private.sync_catalog_sold_state() IS
  'BEFORE UPDATE on parts/vehicles: sold_at/sold_by; on → available clears requester fields and cancels unpaid reservation proformas for that stock unit (SECURITY DEFINER so Make Available works).';

-- Phase 76: Bulk reserve vehicles and/or parts in one action.
-- Loops existing reserve_vehicle_stock / reserve_part_stock so field-agent
-- requester lock, validation, and per-row SOA reservation state stay identical.
-- Partial failures are collected; successes are kept (no all-or-nothing rollback).

CREATE OR REPLACE FUNCTION public.bulk_reserve_stock(
  p_vehicle_ids uuid[] DEFAULT NULL,
  p_part_ids uuid[] DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_price_term text DEFAULT NULL,
  p_shipment_term text DEFAULT NULL,
  p_inspection_required boolean DEFAULT NULL,
  p_vat_applicable boolean DEFAULT true,
  p_etd date DEFAULT NULL,
  p_eta date DEFAULT NULL,
  p_requester_name text DEFAULT NULL,
  p_requester_role text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vehicle_ids uuid[] := ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(p_vehicle_ids, ARRAY[]::uuid[])) AS t(x)
    WHERE x IS NOT NULL
  );
  v_part_ids uuid[] := ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(p_part_ids, ARRAY[]::uuid[])) AS t(x)
    WHERE x IS NOT NULL
  );
  vid uuid;
  pid uuid;
  succeeded_vehicles uuid[] := ARRAY[]::uuid[];
  succeeded_parts uuid[] := ARRAY[]::uuid[];
  failed_vehicles jsonb := '[]'::jsonb;
  failed_parts jsonb := '[]'::jsonb;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  IF COALESCE(cardinality(v_vehicle_ids), 0) = 0
     AND COALESCE(cardinality(v_part_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one vehicle or part';
  END IF;

  IF p_customer_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id
  ) THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;

  FOREACH vid IN ARRAY v_vehicle_ids LOOP
    BEGIN
      PERFORM public.reserve_vehicle_stock(
        vid,
        p_customer_id,
        p_price_term,
        p_shipment_term,
        p_inspection_required,
        p_vat_applicable,
        p_etd,
        p_eta,
        p_requester_name,
        p_requester_role
      );
      succeeded_vehicles := array_append(succeeded_vehicles, vid);
    EXCEPTION
      WHEN OTHERS THEN
        failed_vehicles := failed_vehicles || jsonb_build_array(
          jsonb_build_object('id', vid, 'error', SQLERRM)
        );
    END;
  END LOOP;

  FOREACH pid IN ARRAY v_part_ids LOOP
    BEGIN
      PERFORM public.reserve_part_stock(
        pid,
        p_customer_id,
        p_price_term,
        p_shipment_term,
        p_inspection_required,
        p_vat_applicable,
        p_etd,
        p_eta,
        p_requester_name,
        p_requester_role
      );
      succeeded_parts := array_append(succeeded_parts, pid);
    EXCEPTION
      WHEN OTHERS THEN
        failed_parts := failed_parts || jsonb_build_array(
          jsonb_build_object('id', pid, 'error', SQLERRM)
        );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'succeeded_vehicle_ids', to_jsonb(COALESCE(succeeded_vehicles, ARRAY[]::uuid[])),
    'succeeded_part_ids', to_jsonb(COALESCE(succeeded_parts, ARRAY[]::uuid[])),
    'failed_vehicles', failed_vehicles,
    'failed_parts', failed_parts,
    'succeeded_count',
      COALESCE(cardinality(succeeded_vehicles), 0) + COALESCE(cardinality(succeeded_parts), 0),
    'failed_count',
      jsonb_array_length(failed_vehicles) + jsonb_array_length(failed_parts)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_reserve_stock(
  uuid[], uuid[], uuid, text, text, boolean, boolean, date, date, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_reserve_stock(
  uuid[], uuid[], uuid, text, text, boolean, boolean, date, date, text, text
) TO authenticated;

COMMENT ON FUNCTION public.bulk_reserve_stock(
  uuid[], uuid[], uuid, text, text, boolean, boolean, date, date, text, text
) IS
  'Reserve many available vehicles/parts for one customer with shared trade terms; returns per-id success/failure.';

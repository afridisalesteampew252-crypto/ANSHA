/*
  Phase 1 security hardening — SECURITY DEFINER follow-up

  Branch-only preparation:
  - No production deployment.
  - No production migration execution.
  - Keep internal RPCs available to authenticated workspace users for now;
    their role checks still need application/RLS regression coverage.
  - Harden the remaining SECURITY DEFINER sequence helpers that explicitly
    used search_path=public even though all referenced objects are qualified.
*/

-- These legacy aliases occur in some hosted schemas but are absent from a
-- fresh migration replay (which uses next_po_number / next_export_shipment_number).
DO $$ BEGIN
  IF to_regprocedure('public.next_purchase_order_number()') IS NOT NULL THEN
    ALTER FUNCTION public.next_purchase_order_number() SET search_path = '';
  END IF;
  IF to_regprocedure('public.next_shipment_code()') IS NOT NULL THEN
    ALTER FUNCTION public.next_shipment_code() SET search_path = '';
  END IF;
END $$;

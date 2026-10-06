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

ALTER FUNCTION public.next_purchase_order_number()
  SET search_path = '';

ALTER FUNCTION public.next_shipment_code()
  SET search_path = '';

COMMENT ON FUNCTION public.next_purchase_order_number()
  IS 'Authenticated workspace sequence helper. SECURITY DEFINER with empty search_path and explicit object qualification.';

COMMENT ON FUNCTION public.next_shipment_code()
  IS 'Authenticated workspace sequence helper. SECURITY DEFINER with empty search_path and explicit object qualification.';

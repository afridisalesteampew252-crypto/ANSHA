-- Security advisor hardening (additive):
-- 1) purchase_order_sequences — RLS was off in production (only public table without RLS)
-- 2) tawk_webhook_receipts — RLS on but no policies (service-role-only; add explicit deny)
-- 3) touch_admin_last_seen — revoke anon EXECUTE (workspace heartbeat only)
-- 4) Drop duplicate vehicles reserved_customer index
--
-- Intentionally NOT changed:
-- - verify_invoice: anon EXECUTE required for public QR verification page
-- - ~98 authenticated SECURITY DEFINER RPCs: intentional ERP surface with internal auth checks

-- ---------------------------------------------------------------------------
-- 1) Purchase order sequences — lock down like migration phase 29 intended
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_order_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_direct_purchase_order_sequence_access ON public.purchase_order_sequences;
CREATE POLICY deny_direct_purchase_order_sequence_access
  ON public.purchase_order_sequences
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.purchase_order_sequences FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.purchase_order_sequences IS
  'PO number counters. No direct client access; next_po_number() SECURITY DEFINER only.';

-- ---------------------------------------------------------------------------
-- 2) Tawk webhook receipts — explicit deny policies (Edge service role bypasses RLS)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS deny_anon_tawk_webhook_receipts ON public.tawk_webhook_receipts;
DROP POLICY IF EXISTS deny_authenticated_tawk_webhook_receipts ON public.tawk_webhook_receipts;

CREATE POLICY deny_anon_tawk_webhook_receipts
  ON public.tawk_webhook_receipts
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY deny_authenticated_tawk_webhook_receipts
  ON public.tawk_webhook_receipts
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.tawk_webhook_receipts FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Presence heartbeat — authenticated workspace only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.touch_admin_last_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_admin_last_seen() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Duplicate index cleanup (performance advisor)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.vehicles_reserved_customer_id_idx;
-- keep public.vehicles_reserved_customer_idx

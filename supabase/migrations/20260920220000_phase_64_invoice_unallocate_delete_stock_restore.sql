-- Phase 64: invoice delete guards (unallocate first) + restore reserved/sold stock to available.
-- Additive: new RPCs + replace delete_invoice_safely / reverse helpers. No Tawk changes.

CREATE OR REPLACE FUNCTION private.restore_invoice_linked_stock(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT inventory_type, vehicle_id, part_id, quantity
    FROM public.invoice_items
    WHERE invoice_id = p_invoice_id
      AND (vehicle_id IS NOT NULL OR part_id IS NOT NULL)
  LOOP
    IF item.vehicle_id IS NOT NULL THEN
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
        updated_at = now()
      WHERE id = item.vehicle_id
        AND stock_status IN ('reserved', 'sold');
    END IF;

    IF item.part_id IS NOT NULL THEN
      UPDATE public.parts SET
        quantity = CASE
          WHEN stock_status = 'sold' THEN quantity + GREATEST(COALESCE(item.quantity, 1), 0)
          ELSE quantity
        END,
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
        updated_at = now()
      WHERE id = item.part_id
        AND stock_status IN ('reserved', 'sold');
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.restore_invoice_linked_stock(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.unallocate_invoice_remittances(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  allocation_ids uuid[];
  allocation_id uuid;
  allocation_row public.remittance_allocations%ROWTYPE;
  legacy_payment_id uuid;
  reversed_count integer := 0;
BEGIN
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Receivables access required to unallocate remittance payments';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = p_invoice_id) THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT COALESCE(array_agg(id ORDER BY created_at), ARRAY[]::uuid[])
  INTO allocation_ids
  FROM public.remittance_allocations
  WHERE invoice_id = p_invoice_id;

  FOREACH allocation_id IN ARRAY allocation_ids
  LOOP
    SELECT * INTO allocation_row
    FROM public.remittance_allocations
    WHERE id = allocation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT invoice_payment_id INTO legacy_payment_id
    FROM public.remittances
    WHERE id = allocation_row.remittance_id;

    IF legacy_payment_id IS NOT NULL AND legacy_payment_id = allocation_row.invoice_payment_id THEN
      UPDATE public.remittances
      SET invoice_id = NULL,
          updated_at = now()
      WHERE id = allocation_row.remittance_id;
    ELSE
      DELETE FROM public.invoice_payments WHERE id = allocation_row.invoice_payment_id;
    END IF;

    reversed_count := reversed_count + 1;
  END LOOP;

  UPDATE public.remittances
  SET invoice_id = NULL,
      updated_at = now()
  WHERE invoice_id = p_invoice_id;

  RETURN reversed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.unallocate_invoice_remittances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unallocate_invoice_remittances(uuid) TO authenticated;

COMMENT ON FUNCTION public.unallocate_invoice_remittances(uuid) IS
  'Phase 64: reverse all remittance allocations on an invoice; amounts return to the unallocated remittance pool.';

CREATE OR REPLACE FUNCTION public.delete_invoice_safely(p_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  target public.invoices%ROWTYPE;
  allocation_count integer;
  payment_count integer;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  SELECT * INTO target FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice cannot be deleted or was not found';
  END IF;

  IF NOT private.is_platform_admin() THEN
    IF target.status <> 'draft' OR target.created_by <> (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'Only an administrator can delete non-draft invoices';
    END IF;
    IF private.is_field_agent() AND target.document_type <> 'proforma_invoice' THEN
      RAISE EXCEPTION 'Field agents can only delete draft proforma invoices';
    END IF;
    IF NOT private.can_manage_receivables() AND NOT private.is_field_agent() THEN
      RAISE EXCEPTION 'Not allowed to delete this invoice';
    END IF;
  END IF;

  SELECT COUNT(*)::integer INTO allocation_count
  FROM public.remittance_allocations
  WHERE invoice_id = p_invoice_id;

  IF allocation_count > 0 THEN
    RAISE EXCEPTION
      'Unallocate remittance payments on this invoice before deleting it (% allocation(s)). Use Unallocate, then Delete — or Unallocate & delete.',
      allocation_count;
  END IF;

  IF EXISTS (SELECT 1 FROM public.remittances WHERE invoice_id = p_invoice_id) THEN
    RAISE EXCEPTION
      'Unallocate or unlink remittances from this invoice before deleting it';
  END IF;

  SELECT COUNT(*)::integer INTO payment_count
  FROM public.invoice_payments
  WHERE invoice_id = p_invoice_id;

  IF payment_count > 0 THEN
    RAISE EXCEPTION
      'Remove recorded payments before deleting this invoice (% payment(s)). Remittance allocations must be unallocated first.',
      payment_count;
  END IF;

  PERFORM private.restore_invoice_linked_stock(p_invoice_id);

  DELETE FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice cannot be deleted or was not found';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_invoice_safely(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_invoice_safely(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_invoice_safely(uuid) IS
  'Phase 64: delete invoice only after remittance allocations/payments are cleared; restores linked reserved/sold stock to available.';

CREATE OR REPLACE FUNCTION public.unallocate_and_delete_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Receivables access required for unallocate & delete';
  END IF;

  PERFORM public.unallocate_invoice_remittances(p_invoice_id);
  RETURN public.delete_invoice_safely(p_invoice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.unallocate_and_delete_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unallocate_and_delete_invoice(uuid) TO authenticated;

COMMENT ON FUNCTION public.unallocate_and_delete_invoice(uuid) IS
  'Phase 64: unallocate remittance payments on an invoice, then delete it and restore linked stock to available.';
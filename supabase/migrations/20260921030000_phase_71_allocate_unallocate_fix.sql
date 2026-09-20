-- Phase 71: fix remittance unallocate (RLS blocked payment deletes) + easier reverse.
-- Root cause: unallocate_invoice_remittances / reverse_remittance_allocation are SECURITY INVOKER;
-- invoice_payments DELETE RLS only allowed platform admin or the payment creator, so other
-- receivables staff could allocate but not unallocate.
-- Also: sync_remittance_payment rejected status 'unknown' (Phase 69).

-- Allow any receivables manager to delete invoice payments (needed for unallocate / reverse)
DROP POLICY IF EXISTS receivables_delete_invoice_payments ON public.invoice_payments;
CREATE POLICY receivables_delete_invoice_payments
  ON public.invoice_payments FOR DELETE TO authenticated
  USING (
    (SELECT private.is_platform_admin())
    OR (SELECT private.can_manage_receivables())
  );

CREATE OR REPLACE FUNCTION public.unallocate_invoice_remittances(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
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
      -- Clears linked payment via sync trigger; allocation cascades on payment delete
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
  'Phase 64/71: reverse all remittance allocations on an invoice (SECURITY DEFINER; receivables). Funds return to remittance pool.';

CREATE OR REPLACE FUNCTION public.reverse_remittance_allocation(p_allocation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  allocation_row public.remittance_allocations%ROWTYPE;
  legacy_payment_id uuid;
BEGIN
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Receivables access required to reverse allocations';
  END IF;

  SELECT * INTO allocation_row
  FROM public.remittance_allocations
  WHERE id = p_allocation_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Allocation not found'; END IF;

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

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_remittance_allocation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_remittance_allocation(uuid) TO authenticated;

COMMENT ON FUNCTION public.reverse_remittance_allocation(uuid) IS
  'Phase 17/71: reverse one remittance allocation (SECURITY DEFINER; any receivables manager).';

-- Keep unallocate_and_delete on DEFINER chain via unallocate (still INVOKER wrapper is fine)
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

-- Allow Phase 69 unknown status through remittance payment sync
CREATE OR REPLACE FUNCTION private.sync_remittance_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linked_invoice public.invoices%ROWTYPE;
  replacement_payment_id uuid;
  generated_reference text;
  financial_change boolean;
BEGIN
  financial_change :=
    NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    OR NEW.received_date IS DISTINCT FROM OLD.received_date
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.bank_reference IS DISTINCT FROM OLD.bank_reference
    OR NEW.status IS DISTINCT FROM OLD.status;

  IF NOT financial_change THEN
    IF NEW.invoice_payment_id IS DISTINCT FROM OLD.invoice_payment_id THEN
      IF OLD.invoice_payment_id IS NOT NULL
        AND NEW.invoice_payment_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.invoice_payments payment WHERE payment.id = OLD.invoice_payment_id)
      THEN
        RETURN NEW;
      END IF;
      IF OLD.invoice_payment_id IS NULL
        AND NEW.invoice_payment_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.invoice_payments payment
          WHERE payment.id = NEW.invoice_payment_id
            AND payment.invoice_id = NEW.invoice_id
            AND payment.payment_date = NEW.received_date
            AND payment.amount = NEW.amount
            AND payment.created_by = NEW.created_by
        )
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Linked payment cannot be changed directly';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF NEW.status NOT IN ('pending', 'confirmed', 'rejected', 'reversed', 'unknown') THEN
    RAISE EXCEPTION 'Invalid remittance status';
  END IF;
  IF NEW.currency <> upper(NEW.currency) THEN RAISE EXCEPTION 'Currency must use uppercase ISO code'; END IF;

  IF OLD.invoice_payment_id IS NOT NULL THEN
    DELETE FROM public.invoice_payments WHERE id = OLD.invoice_payment_id;
  END IF;

  IF NEW.invoice_id IS NOT NULL THEN
    SELECT * INTO linked_invoice FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    IF linked_invoice.currency <> upper(NEW.currency) THEN RAISE EXCEPTION 'Remittance currency must match invoice currency'; END IF;
    IF NEW.status = 'confirmed' AND NEW.amount > linked_invoice.balance_due THEN
      RAISE EXCEPTION 'Confirmed amount cannot exceed invoice balance';
    END IF;
  END IF;

  IF NEW.status = 'confirmed' AND NEW.invoice_id IS NOT NULL THEN
    generated_reference := COALESCE(NULLIF(btrim(NEW.bank_reference), ''), NEW.remittance_number);
    INSERT INTO public.invoice_payments (
      invoice_id, payment_date, amount, method, reference, notes, created_by
    ) VALUES (
      NEW.invoice_id, NEW.received_date, NEW.amount,
      CASE WHEN NEW.method IN ('bank_transfer', 'cash', 'card', 'cheque', 'other') THEN NEW.method ELSE 'other' END,
      generated_reference, 'Applied from remittance ' || NEW.remittance_number, NEW.created_by
    ) RETURNING id INTO replacement_payment_id;
    UPDATE public.remittances SET invoice_payment_id = replacement_payment_id WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

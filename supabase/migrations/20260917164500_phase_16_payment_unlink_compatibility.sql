-- Permit the invoice_payments foreign key to clear a remittance link only after that payment is gone.
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
          SELECT 1
          FROM public.invoice_payments payment
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
  IF NEW.status NOT IN ('pending', 'confirmed', 'rejected', 'reversed') THEN
    RAISE EXCEPTION 'Invalid remittance status';
  END IF;

  IF OLD.invoice_payment_id IS NOT NULL THEN
    DELETE FROM public.invoice_payments WHERE id = OLD.invoice_payment_id;
    NEW.invoice_payment_id := NULL;
  END IF;

  IF NEW.invoice_id IS NOT NULL THEN
    SELECT * INTO linked_invoice FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    IF linked_invoice.currency <> upper(NEW.currency) THEN
      RAISE EXCEPTION 'Remittance currency must match invoice currency';
    END IF;
    IF NEW.status = 'confirmed' AND NEW.amount > linked_invoice.balance_due THEN
      RAISE EXCEPTION 'Confirmed amount cannot exceed invoice balance';
    END IF;
  END IF;

  NEW.currency := upper(NEW.currency);
  IF NEW.status = 'confirmed' AND NEW.invoice_id IS NOT NULL THEN
    generated_reference := COALESCE(NULLIF(btrim(NEW.bank_reference), ''), NEW.remittance_number);
    INSERT INTO public.invoice_payments (
      invoice_id, payment_date, amount, method, reference, notes, created_by
    ) VALUES (
      NEW.invoice_id, NEW.received_date, NEW.amount,
      CASE WHEN NEW.method IN ('bank_transfer', 'cash', 'card', 'cheque', 'other')
        THEN NEW.method ELSE 'other' END,
      generated_reference,
      'Applied from remittance ' || NEW.remittance_number,
      NEW.created_by
    ) RETURNING id INTO replacement_payment_id;
    NEW.invoice_payment_id := replacement_payment_id;
  END IF;

  RETURN NEW;
END;
$$;

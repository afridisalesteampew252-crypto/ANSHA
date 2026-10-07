-- Store the bank's rate on each TT. Historical rates are never averaged/repriced.
ALTER TABLE public.remittances
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS source_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(24,10);

ALTER TABLE public.remittances ADD CONSTRAINT remittances_fx_complete CHECK (
  (source_currency IS NULL AND source_amount IS NULL AND exchange_rate IS NULL)
  OR (source_currency IS NOT NULL AND source_amount IS NOT NULL AND exchange_rate IS NOT NULL
      AND source_currency ~ '^[A-Z]{3}$' AND source_amount > 0 AND exchange_rate > 0
      AND source_amount <> 'NaN'::numeric AND exchange_rate <> 'NaN'::numeric)
);
COMMENT ON COLUMN public.remittances.exchange_rate IS
  'Recorded bank rate: one unit of source_currency equals exchange_rate units of currency. Receipt amount may differ due to bank charges.';

CREATE OR REPLACE FUNCTION private.preserve_remittance_fx()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.exchange_rate IS NOT NULL AND (
    NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
    OR NEW.source_currency IS DISTINCT FROM OLD.source_currency
    OR NEW.source_amount IS DISTINCT FROM OLD.source_amount
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.amount IS DISTINCT FROM OLD.amount
  ) THEN
    RAISE EXCEPTION 'Recorded TT exchange details cannot be changed; reverse and replace the receipt to correct them';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_remittance_fx_before_update
BEFORE UPDATE OF exchange_rate, source_currency, source_amount, currency, amount ON public.remittances
FOR EACH ROW EXECUTE FUNCTION private.preserve_remittance_fx();

-- Keep existing callers intact and save receipt + optional FX metadata atomically.
CREATE OR REPLACE FUNCTION public.create_remittance_with_fx(
  p_customer_id uuid, p_invoice_id uuid, p_customer_name text, p_received_date date,
  p_amount numeric, p_currency text, p_method text, p_bank_reference text,
  p_sender_bank text, p_receiving_bank text, p_status text, p_notes text,
  p_received_by uuid DEFAULT NULL, p_office_id uuid DEFAULT NULL, p_shift_id uuid DEFAULT NULL,
  p_source_currency text DEFAULT NULL, p_source_amount numeric DEFAULT NULL, p_exchange_rate numeric DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE receipt_id uuid;
BEGIN
  IF NOT private.can_manage_receivables() THEN
    RAISE EXCEPTION 'Receivables access required' USING ERRCODE = '42501';
  END IF;
  receipt_id := public.create_remittance(
    p_customer_id, p_invoice_id, p_customer_name, p_received_date, p_amount, p_currency,
    p_method, p_bank_reference, p_sender_bank, p_receiving_bank, p_status, p_notes,
    p_received_by, p_office_id, p_shift_id
  );
  UPDATE public.remittances SET
    source_currency = NULLIF(upper(btrim(p_source_currency)), ''),
    source_amount = p_source_amount, exchange_rate = p_exchange_rate
  WHERE id = receipt_id;
  RETURN receipt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_remittance_with_fx(uuid,uuid,text,date,numeric,text,text,text,text,text,text,text,uuid,uuid,uuid,text,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_remittance_with_fx(uuid,uuid,text,date,numeric,text,text,text,text,text,text,text,uuid,uuid,uuid,text,numeric,numeric) TO authenticated;

-- Narrow customer-only read surface. No supplied customer/invoice ID can broaden it.
CREATE OR REPLACE FUNCTION public.get_my_customer_finance_history()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE cid uuid; payment_rows jsonb; remittance_rows jsonb;
BEGIN
  cid := private.my_customer_id();
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Not a customer portal user' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.payment_date, x.id), '[]'::jsonb)
  INTO payment_rows
  FROM (
    SELECT pay.id, pay.invoice_id, inv.invoice_number, pay.payment_date, pay.amount,
      inv.currency, pay.method, pay.reference,
      rem.id AS remittance_id, rem.remittance_number
    FROM public.invoice_payments pay
    INNER JOIN public.invoices inv ON inv.id = pay.invoice_id
    LEFT JOIN public.remittance_allocations alloc ON alloc.invoice_payment_id = pay.id
    LEFT JOIN public.remittances rem ON rem.id = alloc.remittance_id
    WHERE inv.customer_id = cid AND inv.status NOT IN ('draft', 'cancelled')
      AND (rem.id IS NULL OR (rem.customer_id = cid AND rem.status = 'confirmed'))
  ) x;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.received_date, x.id), '[]'::jsonb)
  INTO remittance_rows
  FROM (
    SELECT rem.id, rem.remittance_number, rem.received_date, rem.amount, rem.currency,
      rem.status, rem.method, rem.bank_reference,
      rem.source_currency, rem.source_amount, rem.exchange_rate
    FROM public.remittances rem
    WHERE rem.customer_id = cid AND rem.status = 'confirmed'
  ) x;
  RETURN jsonb_build_object('payments', payment_rows, 'remittances', remittance_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_customer_finance_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_finance_history() TO authenticated;

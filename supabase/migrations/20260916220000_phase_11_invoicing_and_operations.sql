/* Phase 11: secure operational invoicing, UAE tax fields, and provider-ready structured data. */

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS tax_registration_number text;

CREATE TABLE IF NOT EXISTS public.invoice_company_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  legal_name text NOT NULL,
  trading_name text NOT NULL,
  tax_registration_number text NOT NULL,
  address text NOT NULL,
  phone text,
  email text,
  default_currency text NOT NULL DEFAULT 'AED' CHECK (char_length(default_currency) = 3),
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 5 CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100),
  payment_terms text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL
);

INSERT INTO public.invoice_company_settings (
  id, legal_name, trading_name, tax_registration_number, address, phone, email,
  default_currency, default_tax_rate, payment_terms
) VALUES (
  true,
  'Ansha Trading Co. L.L.C-FZ',
  'ANSHA TRADING',
  '105335274400003',
  'Meydan Grandstand, 6th Floor, Meydan Road, Nad Al Sheba, Dubai, U.A.E.',
  '+971 50 167 7980',
  'info@anshatrading.com',
  'AED',
  5,
  'Payment is due by the date shown on the invoice.'
) ON CONFLICT (id) DO UPDATE SET
  legal_name = EXCLUDED.legal_name,
  trading_name = EXCLUDED.trading_name,
  tax_registration_number = EXCLUDED.tax_registration_number,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email;

CREATE TABLE IF NOT EXISTS public.invoice_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number bigint NOT NULL CHECK (next_number > 0)
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_company text,
  customer_email text,
  customer_phone text,
  customer_address text,
  customer_tax_registration_number text,
  seller_name text NOT NULL,
  seller_tax_registration_number text NOT NULL,
  seller_address text NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  reference text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance_due numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  terms text,
  provider_name text,
  provider_submission_id text,
  provider_status text NOT NULL DEFAULT 'not_submitted' CHECK (provider_status IN ('not_submitted', 'queued', 'accepted', 'rejected')),
  structured_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reported_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_date >= issue_date)
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  tax_rate numeric(5,2) NOT NULL DEFAULT 5 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  line_subtotal numeric(14,2) NOT NULL DEFAULT 0,
  line_discount numeric(14,2) NOT NULL DEFAULT 0,
  line_tax numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'bank_transfer' CHECK (method IN ('cash', 'bank_transfer', 'card', 'cheque', 'other')),
  reference text,
  notes text,
  created_by uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_customer_id_idx ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS invoices_created_by_idx ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS invoices_status_due_date_idx ON public.invoices(status, due_date DESC);
CREATE INDEX IF NOT EXISTS invoices_issue_date_idx ON public.invoices(issue_date DESC);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_payments_invoice_id_idx ON public.invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_payments_created_by_idx ON public.invoice_payments(created_by);

ALTER TABLE public.invoice_company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_read_invoice_settings ON public.invoice_company_settings
FOR SELECT TO authenticated USING ((SELECT private.is_workspace_user()));
CREATE POLICY admin_update_invoice_settings ON public.invoice_company_settings
FOR UPDATE TO authenticated USING ((SELECT private.is_platform_admin())) WITH CHECK ((SELECT private.is_platform_admin()));

CREATE POLICY workspace_read_invoices ON public.invoices
FOR SELECT TO authenticated USING ((SELECT private.is_workspace_user()));
CREATE POLICY workspace_insert_invoices ON public.invoices
FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_workspace_user()) AND created_by = (SELECT auth.uid()));
CREATE POLICY workspace_update_invoices ON public.invoices
FOR UPDATE TO authenticated USING ((SELECT private.is_workspace_user())) WITH CHECK ((SELECT private.is_workspace_user()));
CREATE POLICY admin_delete_invoices ON public.invoices
FOR DELETE TO authenticated USING ((SELECT private.is_platform_admin()) OR (status = 'draft' AND created_by = (SELECT auth.uid())));

CREATE POLICY workspace_read_invoice_items ON public.invoice_items
FOR SELECT TO authenticated USING ((SELECT private.is_workspace_user()));
CREATE POLICY workspace_insert_invoice_items ON public.invoice_items
FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_workspace_user()));
CREATE POLICY workspace_update_invoice_items ON public.invoice_items
FOR UPDATE TO authenticated USING ((SELECT private.is_workspace_user())) WITH CHECK ((SELECT private.is_workspace_user()));
CREATE POLICY workspace_delete_invoice_items ON public.invoice_items
FOR DELETE TO authenticated USING ((SELECT private.is_workspace_user()));

CREATE POLICY workspace_read_invoice_payments ON public.invoice_payments
FOR SELECT TO authenticated USING ((SELECT private.is_workspace_user()));
CREATE POLICY workspace_insert_invoice_payments ON public.invoice_payments
FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_workspace_user()) AND created_by = (SELECT auth.uid()));
CREATE POLICY admin_delete_invoice_payments ON public.invoice_payments
FOR DELETE TO authenticated USING ((SELECT private.is_platform_admin()) OR created_by = (SELECT auth.uid()));

REVOKE ALL ON public.invoice_sequences FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.invoice_company_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.invoice_payments TO authenticated;

CREATE OR REPLACE FUNCTION private.prepare_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sequence_value bigint;
  settings public.invoice_company_settings%ROWTYPE;
BEGIN
  IF NEW.invoice_number IS NULL OR btrim(NEW.invoice_number) = '' THEN
    INSERT INTO public.invoice_sequences (fiscal_year, next_number)
    VALUES (EXTRACT(YEAR FROM NEW.issue_date)::integer, 2)
    ON CONFLICT (fiscal_year) DO UPDATE
      SET next_number = public.invoice_sequences.next_number + 1
    RETURNING next_number - 1 INTO sequence_value;
    NEW.invoice_number := format('INV-%s-%s', EXTRACT(YEAR FROM NEW.issue_date)::integer, lpad(sequence_value::text, 6, '0'));
  END IF;

  SELECT * INTO settings FROM public.invoice_company_settings WHERE id = true;
  NEW.seller_name := COALESCE(NULLIF(NEW.seller_name, ''), settings.legal_name);
  NEW.seller_tax_registration_number := COALESCE(NULLIF(NEW.seller_tax_registration_number, ''), settings.tax_registration_number);
  NEW.seller_address := COALESCE(NULLIF(NEW.seller_address, ''), settings.address);
  NEW.currency := COALESCE(NULLIF(NEW.currency, ''), settings.default_currency);
  NEW.terms := COALESCE(NEW.terms, settings.payment_terms);
  NEW.created_by := COALESCE(NEW.created_by, (SELECT auth.uid()));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.calculate_invoice_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.line_subtotal := round(NEW.quantity * NEW.unit_price, 2);
  NEW.line_discount := round(NEW.line_subtotal * NEW.discount_percent / 100, 2);
  NEW.line_tax := round((NEW.line_subtotal - NEW.line_discount) * NEW.tax_rate / 100, 2);
  NEW.line_total := NEW.line_subtotal - NEW.line_discount + NEW.line_tax;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.recalculate_invoice(target_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item_subtotal numeric(14,2);
  item_discount numeric(14,2);
  item_tax numeric(14,2);
  item_total numeric(14,2);
  paid_total numeric(14,2);
BEGIN
  SELECT COALESCE(sum(line_subtotal), 0), COALESCE(sum(line_discount), 0), COALESCE(sum(line_tax), 0), COALESCE(sum(line_total), 0)
  INTO item_subtotal, item_discount, item_tax, item_total
  FROM public.invoice_items WHERE invoice_id = target_invoice_id;

  SELECT COALESCE(sum(amount), 0) INTO paid_total
  FROM public.invoice_payments WHERE invoice_id = target_invoice_id;

  UPDATE public.invoices
  SET subtotal = item_subtotal,
      discount_amount = item_discount,
      tax_amount = item_tax,
      total_amount = item_total,
      amount_paid = paid_total,
      balance_due = item_total - paid_total,
      status = CASE
        WHEN status = 'cancelled' THEN status
        WHEN item_total > 0 AND paid_total >= item_total THEN 'paid'
        WHEN paid_total > 0 THEN 'partially_paid'
        WHEN status IN ('paid', 'partially_paid') THEN 'sent'
        ELSE status
      END,
      updated_at = now()
  WHERE id = target_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.recalculate_invoice_from_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.recalculate_invoice(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS invoices_prepare ON public.invoices;
CREATE TRIGGER invoices_prepare BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION private.prepare_invoice();

DROP TRIGGER IF EXISTS invoices_updated_at ON public.invoices;
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS invoice_items_calculate ON public.invoice_items;
CREATE TRIGGER invoice_items_calculate BEFORE INSERT OR UPDATE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION private.calculate_invoice_item();

DROP TRIGGER IF EXISTS invoice_items_recalculate_invoice ON public.invoice_items;
CREATE TRIGGER invoice_items_recalculate_invoice AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION private.recalculate_invoice_from_child();

DROP TRIGGER IF EXISTS invoice_payments_recalculate_invoice ON public.invoice_payments;
CREATE TRIGGER invoice_payments_recalculate_invoice AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION private.recalculate_invoice_from_child();

CREATE OR REPLACE FUNCTION public.create_invoice(
  p_customer_id uuid,
  p_customer_name text,
  p_customer_company text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_tax_registration_number text,
  p_issue_date date,
  p_due_date date,
  p_currency text,
  p_reference text,
  p_notes text,
  p_terms text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  new_invoice_id uuid;
  item jsonb;
  item_count integer := 0;
BEGIN
  IF NOT private.is_workspace_user() THEN RAISE EXCEPTION 'Workspace access required'; END IF;
  IF btrim(COALESCE(p_customer_name, '')) = '' THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF p_due_date < p_issue_date THEN RAISE EXCEPTION 'Due date cannot be before issue date'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'At least one invoice item is required'; END IF;

  INSERT INTO public.invoices (
    customer_id, customer_name, customer_company, customer_email, customer_phone,
    customer_address, customer_tax_registration_number, seller_name,
    seller_tax_registration_number, seller_address, issue_date, due_date, currency,
    reference, notes, terms, created_by
  ) VALUES (
    p_customer_id, btrim(p_customer_name), NULLIF(btrim(p_customer_company), ''),
    NULLIF(btrim(p_customer_email), ''), NULLIF(btrim(p_customer_phone), ''),
    NULLIF(btrim(p_customer_address), ''), NULLIF(btrim(p_customer_tax_registration_number), ''),
    '', '', '', p_issue_date, p_due_date, upper(p_currency), NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(p_notes), ''), NULLIF(btrim(p_terms), ''), (SELECT auth.uid())
  ) RETURNING id INTO new_invoice_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF btrim(COALESCE(item->>'description', '')) = '' THEN RAISE EXCEPTION 'Every line needs a description'; END IF;
    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, unit_price, discount_percent, tax_rate, sort_order
    ) VALUES (
      new_invoice_id,
      btrim(item->>'description'),
      COALESCE((item->>'quantity')::numeric, 1),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'discount_percent')::numeric, 0),
      COALESCE((item->>'tax_rate')::numeric, 5),
      item_count
    );
    item_count := item_count + 1;
  END LOOP;

  PERFORM private.recalculate_invoice(new_invoice_id);
  RETURN new_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice(uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION private.prepare_invoice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.calculate_invoice_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recalculate_invoice(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recalculate_invoice_from_child() FROM PUBLIC, anon, authenticated;

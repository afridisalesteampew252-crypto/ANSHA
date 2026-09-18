/* Phase 35: operating expenses (categories + draft/posted/cancelled expenses).

Ops-only via private.is_ops_user(). No payroll.

Optional bank_account_id is a soft uuid when public.bank_accounts is missing
(Phase 34). A DO block adds the FK when that table already exists.

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- Sequences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

ALTER TABLE public.expense_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_direct_expense_sequence_access ON public.expense_sequences;
CREATE POLICY deny_direct_expense_sequence_access
  ON public.expense_sequences FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.expense_sequences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_expense_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  fy integer := EXTRACT(YEAR FROM (now() AT TIME ZONE 'UTC'))::integer;
  n integer;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  INSERT INTO public.expense_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.expense_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  RETURN 'OPEX-' || fy::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_expense_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_expense_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  -- Soft hint for Phase 38 GL mapping (e.g. "6100 Rent expense")
  gl_account_hint text CHECK (gl_account_hint IS NULL OR char_length(gl_account_hint) <= 120),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_categories_code_uidx UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS expense_categories_active_idx
  ON public.expense_categories (is_active, sort_order, name);

DROP TRIGGER IF EXISTS expense_categories_updated_at ON public.expense_categories;
CREATE TRIGGER expense_categories_updated_at
BEFORE UPDATE ON public.expense_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_expense_categories ON public.expense_categories;
CREATE POLICY workspace_manage_expense_categories
  ON public.expense_categories FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.expense_categories FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;

INSERT INTO public.expense_categories (code, name, description, gl_account_hint, sort_order)
VALUES
  ('rent', 'Rent', 'Office / yard / warehouse rent', '6100 Rent expense', 10),
  ('utilities', 'Utilities', 'Electricity, water, internet, phone', '6200 Utilities', 20),
  ('office', 'Office supplies', 'Stationery and office consumables', '6300 Office supplies', 30),
  ('travel', 'Travel', 'Staff travel and local transport', '6400 Travel', 40),
  ('marketing', 'Marketing', 'Ads, listings, promotional spend', '6500 Marketing', 50),
  ('professional', 'Professional fees', 'Legal, audit, consulting', '6600 Professional fees', 60),
  ('insurance', 'Insurance', 'Business insurance premiums', '6700 Insurance', 70),
  ('maintenance', 'Maintenance', 'Facility and equipment maintenance', '6800 Maintenance', 80),
  ('bank_charges', 'Bank charges', 'Bank fees and FX charges', '6900 Bank charges', 90),
  ('other', 'Other', 'Miscellaneous operating expense', '6999 Other operating expense', 100)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text NOT NULL,
  expense_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  category_id uuid NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  payee text CHECK (payee IS NULL OR char_length(trim(payee)) BETWEEN 1 AND 200),
  payment_method text NOT NULL DEFAULT 'bank_transfer' CHECK (
    payment_method IN ('bank_transfer', 'cash', 'card', 'cheque', 'remittance_company', 'other')
  ),
  -- Soft link to Phase 34 bank_accounts (FK added below only if table exists)
  bank_account_id uuid,
  bank_reference text CHECK (
    bank_reference IS NULL OR char_length(trim(bank_reference)) BETWEEN 1 AND 120
  ),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  posted_at timestamptz,
  posted_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_expense_number_uidx UNIQUE (expense_number)
);

CREATE INDEX IF NOT EXISTS expenses_date_idx ON public.expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS expenses_status_idx ON public.expenses (status);
CREATE INDEX IF NOT EXISTS expenses_category_idx ON public.expenses (category_id);
CREATE INDEX IF NOT EXISTS expenses_bank_account_idx
  ON public.expenses (bank_account_id)
  WHERE bank_account_id IS NOT NULL;

DROP TRIGGER IF EXISTS expenses_updated_at ON public.expenses;
CREATE TRIGGER expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_expenses ON public.expenses;
CREATE POLICY workspace_manage_expenses
  ON public.expenses FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.expenses FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;

-- Optional FKs when Phase 34 bank tables are already present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bank_accounts'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expenses_bank_account_id_fkey'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_bank_account_id_fkey
      FOREIGN KEY (bank_account_id)
      REFERENCES public.bank_accounts(id)
      ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bank_transactions'
      AND column_name = 'expense_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bank_transactions_expense_id_fkey'
  ) THEN
    ALTER TABLE public.bank_transactions
      ADD CONSTRAINT bank_transactions_expense_id_fkey
      FOREIGN KEY (expense_id)
      REFERENCES public.expenses(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Create / update / post / cancel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_expense(
  p_expense_date date,
  p_amount numeric,
  p_currency text,
  p_category_id uuid,
  p_payee text DEFAULT NULL,
  p_payment_method text DEFAULT 'bank_transfer',
  p_bank_account_id uuid DEFAULT NULL,
  p_bank_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_post boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_no text;
  v_method text;
  v_currency text;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF p_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.expense_categories WHERE id = p_category_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Active expense category is required';
  END IF;

  v_method := COALESCE(NULLIF(btrim(p_payment_method), ''), 'bank_transfer');
  IF v_method NOT IN ('bank_transfer', 'cash', 'card', 'cheque', 'remittance_company', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  v_currency := upper(COALESCE(NULLIF(btrim(p_currency), ''), 'AED'));
  IF char_length(v_currency) <> 3 THEN
    RAISE EXCEPTION 'Currency must be a 3-letter code';
  END IF;

  IF p_bank_account_id IS NOT NULL
    AND to_regclass('public.bank_accounts') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = p_bank_account_id) THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;

  v_no := public.next_expense_number();

  INSERT INTO public.expenses (
    expense_number,
    expense_date,
    amount,
    currency,
    category_id,
    payee,
    payment_method,
    bank_account_id,
    bank_reference,
    notes,
    status,
    posted_at,
    posted_by,
    created_by
  ) VALUES (
    v_no,
    COALESCE(p_expense_date, (now() AT TIME ZONE 'UTC')::date),
    round(p_amount, 2),
    v_currency,
    p_category_id,
    NULLIF(btrim(p_payee), ''),
    v_method,
    p_bank_account_id,
    NULLIF(btrim(p_bank_reference), ''),
    NULLIF(btrim(p_notes), ''),
    CASE WHEN COALESCE(p_post, false) THEN 'posted' ELSE 'draft' END,
    CASE WHEN COALESCE(p_post, false) THEN now() ELSE NULL END,
    CASE WHEN COALESCE(p_post, false) THEN (SELECT auth.uid()) ELSE NULL END,
    (SELECT auth.uid())
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_expense(date, numeric, text, uuid, text, text, uuid, text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expense(date, numeric, text, uuid, text, text, uuid, text, text, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_expense(
  p_expense_id uuid,
  p_expense_date date DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_payee text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_bank_account_id uuid DEFAULT NULL,
  p_clear_bank_account boolean DEFAULT false,
  p_bank_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.expenses%ROWTYPE;
  v_method text;
  v_currency text;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT * INTO row FROM public.expenses WHERE id = p_expense_id;
  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;
  IF row.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft expenses can be updated';
  END IF;

  IF p_amount IS NOT NULL AND p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.expense_categories WHERE id = p_category_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Active expense category is required';
  END IF;

  IF p_payment_method IS NOT NULL THEN
    v_method := NULLIF(btrim(p_payment_method), '');
    IF v_method IS NULL OR v_method NOT IN (
      'bank_transfer', 'cash', 'card', 'cheque', 'remittance_company', 'other'
    ) THEN
      RAISE EXCEPTION 'Invalid payment method';
    END IF;
  END IF;

  IF p_currency IS NOT NULL THEN
    v_currency := upper(NULLIF(btrim(p_currency), ''));
    IF v_currency IS NULL OR char_length(v_currency) <> 3 THEN
      RAISE EXCEPTION 'Currency must be a 3-letter code';
    END IF;
  END IF;

  IF p_bank_account_id IS NOT NULL
    AND to_regclass('public.bank_accounts') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = p_bank_account_id) THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;

  UPDATE public.expenses SET
    expense_date = COALESCE(p_expense_date, expense_date),
    amount = CASE WHEN p_amount IS NULL THEN amount ELSE round(p_amount, 2) END,
    currency = COALESCE(v_currency, currency),
    category_id = COALESCE(p_category_id, category_id),
    payee = CASE
      WHEN p_payee IS NULL THEN payee
      ELSE NULLIF(btrim(p_payee), '')
    END,
    payment_method = COALESCE(v_method, payment_method),
    bank_account_id = CASE
      WHEN p_clear_bank_account THEN NULL
      WHEN p_bank_account_id IS NOT NULL THEN p_bank_account_id
      ELSE bank_account_id
    END,
    bank_reference = CASE
      WHEN p_bank_reference IS NULL THEN bank_reference
      ELSE NULLIF(btrim(p_bank_reference), '')
    END,
    notes = CASE
      WHEN p_notes IS NULL THEN notes
      ELSE NULLIF(btrim(p_notes), '')
    END,
    updated_at = now()
  WHERE id = p_expense_id
  RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_expense(
  uuid, date, numeric, text, uuid, text, text, uuid, boolean, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_expense(
  uuid, date, numeric, text, uuid, text, text, uuid, boolean, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_expense(p_expense_id uuid)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.expenses%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  UPDATE public.expenses SET
    status = 'posted',
    posted_at = now(),
    posted_by = (SELECT auth.uid()),
    updated_at = now()
  WHERE id = p_expense_id AND status = 'draft'
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Only draft expenses can be posted';
  END IF;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.post_expense(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_expense(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_expense(p_expense_id uuid)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row public.expenses%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  UPDATE public.expenses SET
    status = 'cancelled',
    updated_at = now()
  WHERE id = p_expense_id AND status <> 'cancelled'
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Expense not found or already cancelled';
  END IF;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_expense(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_expense(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Guard: do not introduce a zero-arg is_workspace_user overload
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  overload_count integer;
BEGIN
  SELECT count(*) INTO overload_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'is_workspace_user';

  IF overload_count <> 1 THEN
    RAISE EXCEPTION
      'private.is_workspace_user overload count = %, expected 1',
      overload_count;
  END IF;
END;
$$;

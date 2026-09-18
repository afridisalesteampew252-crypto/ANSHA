/* Phase 34: bank account master + manual ledger transactions + reconcile flags.

Ops ERP ledger only — distinct from the public static /banking page.

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- Sequences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_account_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

ALTER TABLE public.bank_account_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_direct_bank_account_sequence_access ON public.bank_account_sequences;
CREATE POLICY deny_direct_bank_account_sequence_access
  ON public.bank_account_sequences FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.bank_account_sequences FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.bank_transaction_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

ALTER TABLE public.bank_transaction_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_direct_bank_transaction_sequence_access ON public.bank_transaction_sequences;
CREATE POLICY deny_direct_bank_transaction_sequence_access
  ON public.bank_transaction_sequences FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.bank_transaction_sequences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_bank_account_code()
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
  INSERT INTO public.bank_account_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.bank_account_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  RETURN 'BNK-' || fy::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_bank_account_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_bank_account_code() TO authenticated;

CREATE OR REPLACE FUNCTION public.next_bank_transaction_number()
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
  INSERT INTO public.bank_transaction_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.bank_transaction_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  RETURN 'BTXN-' || fy::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_bank_transaction_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_bank_transaction_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code text NOT NULL,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 200),
  bank_name text NOT NULL CHECK (char_length(trim(bank_name)) BETWEEN 1 AND 200),
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  iban text CHECK (iban IS NULL OR char_length(trim(iban)) BETWEEN 5 AND 34),
  account_number text CHECK (account_number IS NULL OR char_length(trim(account_number)) BETWEEN 1 AND 64),
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0,
  opening_balance_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_accounts_account_code_uidx UNIQUE (account_code),
  CONSTRAINT bank_accounts_identity_chk CHECK (
    iban IS NOT NULL OR account_number IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_number text NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  txn_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  reference text CHECK (reference IS NULL OR char_length(trim(reference)) BETWEEN 1 AND 120),
  is_reconciled boolean NOT NULL DEFAULT false,
  reconciled_at timestamptz,
  reconciled_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  remittance_id uuid REFERENCES public.remittances(id) ON DELETE SET NULL,
  supplier_payment_id uuid REFERENCES public.supplier_payments(id) ON DELETE SET NULL,
  -- expense module not built yet; nullable placeholder for Phase 35+
  expense_id uuid,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_transactions_txn_number_uidx UNIQUE (txn_number)
);

CREATE INDEX IF NOT EXISTS bank_accounts_active_idx ON public.bank_accounts (is_active);
CREATE INDEX IF NOT EXISTS bank_accounts_currency_idx ON public.bank_accounts (currency);
CREATE INDEX IF NOT EXISTS bank_transactions_account_date_idx
  ON public.bank_transactions (bank_account_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_reconciled_idx
  ON public.bank_transactions (bank_account_id, is_reconciled);
CREATE INDEX IF NOT EXISTS bank_transactions_remittance_idx
  ON public.bank_transactions (remittance_id) WHERE remittance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_transactions_supplier_payment_idx
  ON public.bank_transactions (supplier_payment_id) WHERE supplier_payment_id IS NOT NULL;

DROP TRIGGER IF EXISTS bank_accounts_updated_at ON public.bank_accounts;
CREATE TRIGGER bank_accounts_updated_at
BEFORE UPDATE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS bank_transactions_updated_at ON public.bank_transactions;
CREATE TRIGGER bank_transactions_updated_at
BEFORE UPDATE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_bank_accounts ON public.bank_accounts;
CREATE POLICY workspace_manage_bank_accounts
  ON public.bank_accounts FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS workspace_manage_bank_transactions ON public.bank_transactions;
CREATE POLICY workspace_manage_bank_transactions
  ON public.bank_transactions FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.bank_accounts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
REVOKE ALL ON public.bank_transactions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.bank_account_ledger_balance(p_account_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT a.opening_balance
        + COALESCE(SUM(
            CASE t.direction
              WHEN 'in' THEN t.amount
              WHEN 'out' THEN -t.amount
            END
          ), 0)
      FROM public.bank_accounts a
      LEFT JOIN public.bank_transactions t ON t.bank_account_id = a.id
      WHERE a.id = p_account_id
      GROUP BY a.opening_balance
    ),
    0
  )::numeric(14, 2);
$$;

REVOKE ALL ON FUNCTION private.bank_account_ledger_balance(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_bank_account(
  p_name text,
  p_bank_name text,
  p_currency text,
  p_iban text,
  p_account_number text,
  p_opening_balance numeric,
  p_opening_balance_date date,
  p_notes text,
  p_is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  account_id uuid;
  v_code text;
  v_iban text := NULLIF(btrim(COALESCE(p_iban, '')), '');
  v_acct text := NULLIF(btrim(COALESCE(p_account_number, '')), '');
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Account name is required';
  END IF;
  IF NULLIF(btrim(COALESCE(p_bank_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bank name is required';
  END IF;
  IF v_iban IS NULL AND v_acct IS NULL THEN
    RAISE EXCEPTION 'IBAN or account number is required';
  END IF;

  v_code := public.next_bank_account_code();

  INSERT INTO public.bank_accounts (
    account_code, name, bank_name, currency, iban, account_number,
    opening_balance, opening_balance_date, is_active, notes, created_by
  ) VALUES (
    v_code,
    btrim(p_name),
    btrim(p_bank_name),
    upper(COALESCE(NULLIF(btrim(p_currency), ''), 'AED')),
    v_iban,
    v_acct,
    COALESCE(p_opening_balance, 0),
    p_opening_balance_date,
    COALESCE(p_is_active, true),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    (SELECT auth.uid())
  ) RETURNING id INTO account_id;

  RETURN account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_bank_account(text, text, text, text, text, numeric, date, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_bank_account(text, text, text, text, text, numeric, date, text, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_bank_account(
  p_account_id uuid,
  p_name text,
  p_bank_name text,
  p_currency text,
  p_iban text,
  p_account_number text,
  p_opening_balance numeric,
  p_opening_balance_date date,
  p_notes text,
  p_is_active boolean
)
RETURNS public.bank_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  acct public.bank_accounts%ROWTYPE;
  v_iban text := NULLIF(btrim(COALESCE(p_iban, '')), '');
  v_acct text := NULLIF(btrim(COALESCE(p_account_number, '')), '');
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT * INTO acct FROM public.bank_accounts WHERE id = p_account_id FOR UPDATE;
  IF acct.id IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  IF NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Account name is required';
  END IF;
  IF NULLIF(btrim(COALESCE(p_bank_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bank name is required';
  END IF;
  IF v_iban IS NULL AND v_acct IS NULL THEN
    RAISE EXCEPTION 'IBAN or account number is required';
  END IF;

  UPDATE public.bank_accounts SET
    name = btrim(p_name),
    bank_name = btrim(p_bank_name),
    currency = upper(COALESCE(NULLIF(btrim(p_currency), ''), acct.currency)),
    iban = v_iban,
    account_number = v_acct,
    opening_balance = COALESCE(p_opening_balance, acct.opening_balance),
    opening_balance_date = p_opening_balance_date,
    is_active = COALESCE(p_is_active, acct.is_active),
    notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
    updated_at = now()
  WHERE id = p_account_id
  RETURNING * INTO acct;

  RETURN acct;
END;
$$;

REVOKE ALL ON FUNCTION public.update_bank_account(uuid, text, text, text, text, text, numeric, date, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_bank_account(uuid, text, text, text, text, text, numeric, date, text, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.create_bank_transaction(
  p_bank_account_id uuid,
  p_txn_date date,
  p_amount numeric,
  p_direction text,
  p_description text,
  p_reference text,
  p_remittance_id uuid DEFAULT NULL,
  p_supplier_payment_id uuid DEFAULT NULL,
  p_expense_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  acct public.bank_accounts%ROWTYPE;
  txn_id uuid;
  v_no text;
  v_dir text := lower(NULLIF(btrim(COALESCE(p_direction, '')), ''));
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF v_dir IS NULL OR v_dir NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'Direction must be in or out';
  END IF;

  SELECT * INTO acct FROM public.bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
  IF acct.id IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  IF NOT acct.is_active THEN
    RAISE EXCEPTION 'Cannot post to an inactive bank account';
  END IF;

  IF p_remittance_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.remittances WHERE id = p_remittance_id
  ) THEN
    RAISE EXCEPTION 'Remittance not found';
  END IF;
  IF p_supplier_payment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.supplier_payments WHERE id = p_supplier_payment_id
  ) THEN
    RAISE EXCEPTION 'Supplier payment not found';
  END IF;

  v_no := public.next_bank_transaction_number();

  INSERT INTO public.bank_transactions (
    txn_number, bank_account_id, txn_date, amount, direction,
    description, reference, remittance_id, supplier_payment_id, expense_id, created_by
  ) VALUES (
    v_no,
    p_bank_account_id,
    COALESCE(p_txn_date, (now() AT TIME ZONE 'UTC')::date),
    p_amount,
    v_dir,
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_reference, '')), ''),
    p_remittance_id,
    p_supplier_payment_id,
    p_expense_id,
    (SELECT auth.uid())
  ) RETURNING id INTO txn_id;

  RETURN txn_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_bank_transaction(uuid, date, numeric, text, text, text, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_bank_transaction(uuid, date, numeric, text, text, text, uuid, uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.set_bank_transaction_reconciled(
  p_txn_id uuid,
  p_reconciled boolean
)
RETURNS public.bank_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  txn public.bank_transactions%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT * INTO txn FROM public.bank_transactions WHERE id = p_txn_id FOR UPDATE;
  IF txn.id IS NULL THEN
    RAISE EXCEPTION 'Bank transaction not found';
  END IF;

  IF COALESCE(p_reconciled, false) THEN
    UPDATE public.bank_transactions SET
      is_reconciled = true,
      reconciled_at = COALESCE(txn.reconciled_at, now()),
      reconciled_by = COALESCE(txn.reconciled_by, (SELECT auth.uid())),
      updated_at = now()
    WHERE id = p_txn_id
    RETURNING * INTO txn;
  ELSE
    UPDATE public.bank_transactions SET
      is_reconciled = false,
      reconciled_at = NULL,
      reconciled_by = NULL,
      updated_at = now()
    WHERE id = p_txn_id
    RETURNING * INTO txn;
  END IF;

  RETURN txn;
END;
$$;

REVOKE ALL ON FUNCTION public.set_bank_transaction_reconciled(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_bank_transaction_reconciled(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_bank_account_balance(p_account_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  RETURN private.bank_account_ledger_balance(p_account_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_bank_account_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_account_balance(uuid) TO authenticated;

-- Optional CSV/JSON import stub: validates rows and inserts as unreconciled manual txns.
CREATE OR REPLACE FUNCTION public.import_bank_transactions_stub(
  p_bank_account_id uuid,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  acct public.bank_accounts%ROWTYPE;
  row_item jsonb;
  inserted integer := 0;
  v_amount numeric;
  v_dir text;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT * INTO acct FROM public.bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
  IF acct.id IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  IF NOT acct.is_active THEN
    RAISE EXCEPTION 'Cannot import into an inactive bank account';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  FOR row_item IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_amount := NULLIF(row_item->>'amount', '')::numeric;
    v_dir := lower(NULLIF(btrim(COALESCE(row_item->>'direction', '')), ''));
    IF COALESCE(v_amount, 0) <= 0 THEN
      RAISE EXCEPTION 'Import row amount must be positive';
    END IF;
    IF v_dir IS NULL OR v_dir NOT IN ('in', 'out') THEN
      RAISE EXCEPTION 'Import row direction must be in or out';
    END IF;

    PERFORM public.create_bank_transaction(
      p_bank_account_id,
      COALESCE(NULLIF(row_item->>'txn_date', '')::date, (now() AT TIME ZONE 'UTC')::date),
      v_amount,
      v_dir,
      NULLIF(btrim(COALESCE(row_item->>'description', '')), ''),
      NULLIF(btrim(COALESCE(row_item->>'reference', '')), ''),
      NULL,
      NULL,
      NULL
    );
    inserted := inserted + 1;
  END LOOP;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.import_bank_transactions_stub(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_bank_transactions_stub(uuid, jsonb) TO authenticated;

-- Guard: do not introduce a zero-arg is_workspace_user overload.
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

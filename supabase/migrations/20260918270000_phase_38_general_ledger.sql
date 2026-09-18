/* Phase 38: General Ledger MVP — chart of accounts, manual journals, P&L / BS / trial balance.

Ops-only. Manual journals + financial statement views.
Auto-posting from invoices / remittances / bank / expenses deferred (see docs).

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).

Optional source_module / source_id columns reserved for later module links
(Phases 34–37 bank/expense agents, invoices, remittances).
*/

-- ---------------------------------------------------------------------------
-- Sequences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gl_journal_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

ALTER TABLE public.gl_journal_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_direct_gl_journal_sequence_access ON public.gl_journal_sequences;
CREATE POLICY deny_direct_gl_journal_sequence_access
  ON public.gl_journal_sequences FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.gl_journal_sequences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_gl_journal_number()
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
  INSERT INTO public.gl_journal_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.gl_journal_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  RETURN 'JE-' || fy::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_gl_journal_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_gl_journal_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gl_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (
    account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')
  ),
  is_active boolean NOT NULL DEFAULT true,
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gl_accounts_code_uidx UNIQUE (code),
  CONSTRAINT gl_accounts_code_format CHECK (code ~ '^[0-9A-Za-z.\-]{2,20}$'),
  CONSTRAINT gl_accounts_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS gl_accounts_type_idx ON public.gl_accounts (account_type, code);
CREATE INDEX IF NOT EXISTS gl_accounts_active_idx ON public.gl_accounts (is_active) WHERE is_active = true;

DROP TRIGGER IF EXISTS gl_accounts_updated_at ON public.gl_accounts;
CREATE TRIGGER gl_accounts_updated_at
BEFORE UPDATE ON public.gl_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.gl_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_manage_gl_accounts ON public.gl_accounts;
CREATE POLICY workspace_manage_gl_accounts
  ON public.gl_accounts FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.gl_accounts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gl_accounts TO authenticated;

-- ---------------------------------------------------------------------------
-- Journals + lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gl_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
  entry_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(currency) = 3),
  total_debit numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_debit >= 0),
  total_credit numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_credit >= 0),
  posted_at timestamptz,
  posted_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  reversed_at timestamptz,
  reversed_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  reverses_journal_id uuid REFERENCES public.gl_journals(id) ON DELETE SET NULL,
  reversed_by_journal_id uuid REFERENCES public.gl_journals(id) ON DELETE SET NULL,
  source_module text CHECK (
    source_module IS NULL OR source_module IN (
      'manual', 'invoice', 'remittance', 'supplier_payment',
      'bank', 'expense', 'landed_cost', 'other'
    )
  ),
  source_id uuid,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gl_journals_journal_number_uidx UNIQUE (journal_number)
);

CREATE TABLE IF NOT EXISTS public.gl_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.gl_journals(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.gl_accounts(id) ON DELETE RESTRICT,
  line_no integer NOT NULL DEFAULT 1 CHECK (line_no >= 1),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  debit numeric(14, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gl_journal_lines_amount_chk CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS gl_journal_lines_journal_line_uidx
  ON public.gl_journal_lines (journal_id, line_no);
CREATE INDEX IF NOT EXISTS gl_journals_status_idx ON public.gl_journals (status);
CREATE INDEX IF NOT EXISTS gl_journals_entry_date_idx ON public.gl_journals (entry_date DESC);
CREATE INDEX IF NOT EXISTS gl_journals_source_idx
  ON public.gl_journals (source_module, source_id)
  WHERE source_module IS NOT NULL AND source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gl_journal_lines_journal_idx ON public.gl_journal_lines (journal_id);
CREATE INDEX IF NOT EXISTS gl_journal_lines_account_idx ON public.gl_journal_lines (account_id);

DROP TRIGGER IF EXISTS gl_journals_updated_at ON public.gl_journals;
CREATE TRIGGER gl_journals_updated_at
BEFORE UPDATE ON public.gl_journals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.gl_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_gl_journals ON public.gl_journals;
CREATE POLICY workspace_manage_gl_journals
  ON public.gl_journals FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS workspace_manage_gl_journal_lines ON public.gl_journal_lines;
CREATE POLICY workspace_manage_gl_journal_lines
  ON public.gl_journal_lines FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.gl_journals FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gl_journals TO authenticated;
REVOKE ALL ON public.gl_journal_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gl_journal_lines TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed default chart (only when empty)
-- ---------------------------------------------------------------------------
INSERT INTO public.gl_accounts (code, name, account_type, sort_order, description)
SELECT v.code, v.name, v.account_type, v.sort_order, v.description
FROM (
  VALUES
    ('1000', 'Cash', 'asset', 10, 'Bank and cash on hand'),
    ('1100', 'Accounts Receivable', 'asset', 20, 'Customer balances'),
    ('1200', 'Inventory', 'asset', 30, 'Parts and vehicle stock'),
    ('2000', 'Accounts Payable', 'liability', 40, 'Supplier balances'),
    ('2100', 'VAT Control', 'liability', 50, 'VAT recoverable / payable'),
    ('3000', 'Owner Equity', 'equity', 60, 'Capital / retained earnings opening'),
    ('4000', 'Sales Revenue', 'revenue', 70, 'Sales and other income'),
    ('5000', 'Cost of Goods Sold', 'expense', 80, 'Cost of stock sold'),
    ('6000', 'Operating Expenses', 'expense', 90, 'General operating expenses')
) AS v(code, name, account_type, sort_order, description)
WHERE NOT EXISTS (SELECT 1 FROM public.gl_accounts LIMIT 1);

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.refresh_gl_journal_totals(p_journal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.gl_journals j SET
    total_debit = COALESCE((
      SELECT sum(l.debit)::numeric(14, 2) FROM public.gl_journal_lines l WHERE l.journal_id = p_journal_id
    ), 0),
    total_credit = COALESCE((
      SELECT sum(l.credit)::numeric(14, 2) FROM public.gl_journal_lines l WHERE l.journal_id = p_journal_id
    ), 0),
    updated_at = now()
  WHERE j.id = p_journal_id;
END;
$$;

REVOKE ALL ON FUNCTION private.refresh_gl_journal_totals(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.assert_draft_gl_journal(p_journal_id uuid)
RETURNS public.gl_journals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  j public.gl_journals%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.gl_journals WHERE id = p_journal_id FOR UPDATE;
  IF j.id IS NULL THEN
    RAISE EXCEPTION 'Journal not found';
  END IF;
  IF j.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only draft journals can be edited';
  END IF;
  RETURN j;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_draft_gl_journal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.insert_gl_journal_lines(p_journal_id uuid, p_lines jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_line jsonb;
  v_line_no integer := 0;
  v_account_id uuid;
  v_debit numeric(14, 2);
  v_credit numeric(14, 2);
  v_count integer := 0;
  v_active boolean;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'Lines must be a JSON array';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_account_id := NULLIF(v_line ->> 'account_id', '')::uuid;
    v_debit := round(COALESCE((v_line ->> 'debit')::numeric, 0), 2);
    v_credit := round(COALESCE((v_line ->> 'credit')::numeric, 0), 2);

    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'account_id is required on each line';
    END IF;
    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'Debit and credit must be non-negative';
    END IF;
    IF (v_debit > 0 AND v_credit > 0) OR (v_debit = 0 AND v_credit = 0) THEN
      RAISE EXCEPTION 'Each line must have either debit or credit (not both, not neither)';
    END IF;

    SELECT is_active INTO v_active FROM public.gl_accounts WHERE id = v_account_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found';
    END IF;
    IF v_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Account is inactive';
    END IF;

    v_line_no := v_line_no + 1;
    INSERT INTO public.gl_journal_lines (
      journal_id, account_id, line_no, description, debit, credit
    ) VALUES (
      p_journal_id,
      v_account_id,
      v_line_no,
      NULLIF(btrim(COALESCE(v_line ->> 'description', '')), ''),
      v_debit,
      v_credit
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.insert_gl_journal_lines(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Account CRUD helpers (ops)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_gl_account(
  p_code text,
  p_name text,
  p_account_type text,
  p_description text DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_sort_order integer DEFAULT 0,
  p_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_type text := lower(btrim(COALESCE(p_account_type, '')));
  v_code text := btrim(COALESCE(p_code, ''));
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF v_type NOT IN ('asset', 'liability', 'equity', 'revenue', 'expense') THEN
    RAISE EXCEPTION 'Invalid account_type';
  END IF;
  IF char_length(v_code) < 2 OR char_length(v_name) < 1 THEN
    RAISE EXCEPTION 'Code and name are required';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.gl_accounts (code, name, account_type, description, is_active, sort_order)
    VALUES (
      v_code,
      v_name,
      v_type,
      NULLIF(btrim(COALESCE(p_description, '')), ''),
      COALESCE(p_is_active, true),
      COALESCE(p_sort_order, 0)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.gl_accounts SET
      code = v_code,
      name = v_name,
      account_type = v_type,
      description = NULLIF(btrim(COALESCE(p_description, '')), ''),
      is_active = COALESCE(p_is_active, true),
      sort_order = COALESCE(p_sort_order, 0),
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Account not found';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_gl_account(text, text, text, text, boolean, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_gl_account(text, text, text, text, boolean, integer, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Journal RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_gl_journal(
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_currency text DEFAULT 'AED',
  p_source_module text DEFAULT 'manual',
  p_source_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_journal_id uuid;
  v_currency text := upper(btrim(COALESCE(NULLIF(btrim(p_currency), ''), 'AED')));
  v_source text := lower(btrim(COALESCE(NULLIF(btrim(p_source_module), ''), 'manual')));
  v_count integer;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF char_length(v_currency) <> 3 THEN
    RAISE EXCEPTION 'Currency must be a 3-letter code';
  END IF;
  IF v_source NOT IN (
    'manual', 'invoice', 'remittance', 'supplier_payment',
    'bank', 'expense', 'landed_cost', 'other'
  ) THEN
    RAISE EXCEPTION 'Invalid source_module';
  END IF;

  INSERT INTO public.gl_journals (
    journal_number, status, entry_date, description, currency,
    source_module, source_id, created_by
  ) VALUES (
    public.next_gl_journal_number(),
    'draft',
    COALESCE(p_entry_date, (now() AT TIME ZONE 'UTC')::date),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    v_currency,
    v_source,
    p_source_id,
    auth.uid()
  )
  RETURNING id INTO v_journal_id;

  v_count := private.insert_gl_journal_lines(v_journal_id, p_lines);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'At least two journal lines are required';
  END IF;

  PERFORM private.refresh_gl_journal_totals(v_journal_id);
  RETURN v_journal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_gl_journal(date, text, jsonb, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_gl_journal(date, text, jsonb, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_gl_journal_lines(
  p_journal_id uuid,
  p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  PERFORM private.assert_draft_gl_journal(p_journal_id);
  DELETE FROM public.gl_journal_lines WHERE journal_id = p_journal_id;
  v_count := private.insert_gl_journal_lines(p_journal_id, p_lines);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'At least two journal lines are required';
  END IF;
  PERFORM private.refresh_gl_journal_totals(p_journal_id);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_gl_journal_lines(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_gl_journal_lines(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_gl_journal_header(
  p_journal_id uuid,
  p_entry_date date DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_currency text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_currency text;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  PERFORM private.assert_draft_gl_journal(p_journal_id);

  IF p_currency IS NOT NULL THEN
    v_currency := upper(btrim(p_currency));
    IF char_length(v_currency) <> 3 THEN
      RAISE EXCEPTION 'Currency must be a 3-letter code';
    END IF;
  END IF;

  UPDATE public.gl_journals SET
    entry_date = COALESCE(p_entry_date, entry_date),
    description = CASE
      WHEN p_description IS NULL THEN description
      ELSE NULLIF(btrim(p_description), '')
    END,
    currency = COALESCE(v_currency, currency),
    updated_at = now()
  WHERE id = p_journal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_gl_journal_header(uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_gl_journal_header(uuid, date, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_gl_journal(p_journal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  j public.gl_journals%ROWTYPE;
  v_lines integer;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT * INTO j FROM public.gl_journals WHERE id = p_journal_id FOR UPDATE;
  IF j.id IS NULL THEN
    RAISE EXCEPTION 'Journal not found';
  END IF;
  IF j.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only draft journals can be posted';
  END IF;

  PERFORM private.refresh_gl_journal_totals(p_journal_id);
  SELECT * INTO j FROM public.gl_journals WHERE id = p_journal_id;

  SELECT count(*) INTO v_lines FROM public.gl_journal_lines WHERE journal_id = p_journal_id;
  IF v_lines < 2 THEN
    RAISE EXCEPTION 'At least two journal lines are required';
  END IF;
  IF j.total_debit <= 0 OR j.total_credit <= 0 THEN
    RAISE EXCEPTION 'Journal totals must be greater than zero';
  END IF;
  IF abs(j.total_debit - j.total_credit) > 0.005 THEN
    RAISE EXCEPTION 'Journal is not balanced (debit % vs credit %)', j.total_debit, j.total_credit;
  END IF;

  UPDATE public.gl_journals SET
    status = 'posted',
    posted_at = now(),
    posted_by = auth.uid(),
    updated_at = now()
  WHERE id = p_journal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_gl_journal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_gl_journal(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_gl_journal(
  p_journal_id uuid,
  p_entry_date date DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  j public.gl_journals%ROWTYPE;
  v_rev_id uuid;
  r record;
  v_line_no integer := 0;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT * INTO j FROM public.gl_journals WHERE id = p_journal_id FOR UPDATE;
  IF j.id IS NULL THEN
    RAISE EXCEPTION 'Journal not found';
  END IF;
  IF j.status IS DISTINCT FROM 'posted' THEN
    RAISE EXCEPTION 'Only posted journals can be reversed';
  END IF;
  IF j.reversed_by_journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Journal already reversed';
  END IF;

  INSERT INTO public.gl_journals (
    journal_number, status, entry_date, description, currency,
    source_module, source_id, reverses_journal_id, created_by,
    posted_at, posted_by
  ) VALUES (
    public.next_gl_journal_number(),
    'posted',
    COALESCE(p_entry_date, (now() AT TIME ZONE 'UTC')::date),
    COALESCE(
      NULLIF(btrim(COALESCE(p_description, '')), ''),
      'Reversal of ' || j.journal_number
    ),
    j.currency,
    COALESCE(j.source_module, 'manual'),
    j.source_id,
    j.id,
    auth.uid(),
    now(),
    auth.uid()
  )
  RETURNING id INTO v_rev_id;

  FOR r IN
    SELECT account_id, description, debit, credit
    FROM public.gl_journal_lines
    WHERE journal_id = p_journal_id
    ORDER BY line_no
  LOOP
    v_line_no := v_line_no + 1;
    INSERT INTO public.gl_journal_lines (
      journal_id, account_id, line_no, description, debit, credit
    ) VALUES (
      v_rev_id,
      r.account_id,
      v_line_no,
      COALESCE(r.description, 'Reversal'),
      r.credit,
      r.debit
    );
  END LOOP;

  PERFORM private.refresh_gl_journal_totals(v_rev_id);

  UPDATE public.gl_journals SET
    status = 'reversed',
    reversed_at = now(),
    reversed_by = auth.uid(),
    reversed_by_journal_id = v_rev_id,
    updated_at = now()
  WHERE id = p_journal_id;

  RETURN v_rev_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_gl_journal(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_gl_journal(uuid, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_draft_gl_journal(p_journal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  PERFORM private.assert_draft_gl_journal(p_journal_id);
  DELETE FROM public.gl_journals WHERE id = p_journal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_draft_gl_journal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_draft_gl_journal(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Report RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_trial_balance(p_as_of date DEFAULT ((now() AT TIME ZONE 'UTC')::date))
RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  total_debit numeric,
  total_credit numeric,
  balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.code,
    a.name,
    a.account_type,
    COALESCE(sum(x.debit), 0)::numeric(14, 2),
    COALESCE(sum(x.credit), 0)::numeric(14, 2),
    CASE
      WHEN a.account_type IN ('asset', 'expense') THEN
        (COALESCE(sum(x.debit), 0) - COALESCE(sum(x.credit), 0))::numeric(14, 2)
      ELSE
        (COALESCE(sum(x.credit), 0) - COALESCE(sum(x.debit), 0))::numeric(14, 2)
    END
  FROM public.gl_accounts a
  LEFT JOIN (
    SELECT l.account_id, l.debit, l.credit
    FROM public.gl_journal_lines l
    JOIN public.gl_journals j ON j.id = l.journal_id
    WHERE j.status = 'posted'
      AND j.entry_date <= p_as_of
  ) x ON x.account_id = a.id
  WHERE a.is_active = true
     OR EXISTS (
       SELECT 1
       FROM public.gl_journal_lines lx
       JOIN public.gl_journals jx ON jx.id = lx.journal_id
       WHERE lx.account_id = a.id
         AND jx.status = 'posted'
         AND jx.entry_date <= p_as_of
     )
  GROUP BY a.id, a.code, a.name, a.account_type, a.sort_order
  HAVING COALESCE(sum(x.debit), 0) <> 0 OR COALESCE(sum(x.credit), 0) <> 0 OR a.is_active = true
  ORDER BY a.sort_order, a.code;
END;
$$;

REVOKE ALL ON FUNCTION public.gl_trial_balance(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gl_trial_balance(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.gl_profit_and_loss(
  p_from date,
  p_to date
)
RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.code,
    a.name,
    a.account_type,
    CASE
      WHEN a.account_type = 'revenue' THEN
        (COALESCE(sum(l.credit), 0) - COALESCE(sum(l.debit), 0))::numeric(14, 2)
      ELSE
        (COALESCE(sum(l.debit), 0) - COALESCE(sum(l.credit), 0))::numeric(14, 2)
    END
  FROM public.gl_accounts a
  JOIN public.gl_journal_lines l ON l.account_id = a.id
  JOIN public.gl_journals j ON j.id = l.journal_id
  WHERE a.account_type IN ('revenue', 'expense')
    AND j.status = 'posted'
    AND j.entry_date BETWEEN p_from AND p_to
  GROUP BY a.id, a.code, a.name, a.account_type, a.sort_order
  HAVING abs(COALESCE(sum(l.debit), 0) - COALESCE(sum(l.credit), 0)) > 0.005
  ORDER BY a.account_type DESC, a.sort_order, a.code;
END;
$$;

REVOKE ALL ON FUNCTION public.gl_profit_and_loss(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gl_profit_and_loss(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.gl_balance_sheet(p_as_of date DEFAULT ((now() AT TIME ZONE 'UTC')::date))
RETURNS TABLE (
  section text,
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_net_income numeric(14, 2) := 0;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  -- Cumulative P&L through as-of → current year / retained earnings plug
  SELECT COALESCE((
    SELECT
      (
        COALESCE(sum(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit ELSE 0 END), 0)
        - COALESCE(sum(CASE WHEN a.account_type = 'expense' THEN l.debit - l.credit ELSE 0 END), 0)
      )::numeric(14, 2)
    FROM public.gl_journal_lines l
    JOIN public.gl_journals j ON j.id = l.journal_id
    JOIN public.gl_accounts a ON a.id = l.account_id
    WHERE j.status = 'posted'
      AND j.entry_date <= p_as_of
      AND a.account_type IN ('revenue', 'expense')
  ), 0) INTO v_net_income;

  RETURN QUERY
  SELECT
    CASE a.account_type
      WHEN 'asset' THEN 'assets'
      WHEN 'liability' THEN 'liabilities'
      WHEN 'equity' THEN 'equity'
    END,
    a.id,
    a.code,
    a.name,
    a.account_type,
    CASE
      WHEN a.account_type = 'asset' THEN
        (COALESCE(sum(x.debit), 0) - COALESCE(sum(x.credit), 0))::numeric(14, 2)
      ELSE
        (COALESCE(sum(x.credit), 0) - COALESCE(sum(x.debit), 0))::numeric(14, 2)
    END
  FROM public.gl_accounts a
  LEFT JOIN (
    SELECT l.account_id, l.debit, l.credit
    FROM public.gl_journal_lines l
    JOIN public.gl_journals j ON j.id = l.journal_id
    WHERE j.status = 'posted'
      AND j.entry_date <= p_as_of
  ) x ON x.account_id = a.id
  WHERE a.account_type IN ('asset', 'liability', 'equity')
  GROUP BY a.id, a.code, a.name, a.account_type, a.sort_order
  HAVING abs(
    CASE
      WHEN a.account_type = 'asset' THEN COALESCE(sum(x.debit), 0) - COALESCE(sum(x.credit), 0)
      ELSE COALESCE(sum(x.credit), 0) - COALESCE(sum(x.debit), 0)
    END
  ) > 0.005
  ORDER BY
    CASE a.account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 ELSE 3 END,
    a.sort_order,
    a.code;

  IF abs(v_net_income) > 0.005 THEN
    RETURN QUERY
    SELECT
      'equity'::text,
      NULL::uuid,
      'NI'::text,
      'Net income (to date)'::text,
      'equity'::text,
      v_net_income;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.gl_balance_sheet(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gl_balance_sheet(date) TO authenticated;

/* Phase 45: tighter staff vs account-admin RBAC (additive).

Naming (intentional — do NOT rename public.is_admin()):
  - public.is_admin()              = any admin_profiles row (legacy workspace membership)
  - private.is_workspace_user(uuid)= active admin_profiles row (any role)
  - private.is_ops_user()          = active admin|staff (day-to-day trading/finance ops)
  - private.is_account_admin()     = active role = 'admin' (sensitive actions only)
  - private.is_platform_admin()    = alias of is_account_admin() (legacy name; now active-aware)

Admin-only (this phase):
  - reverse posted GL journals
  - GL chart upsert / direct chart writes
  - create bank accounts (direct INSERT too)
  - delete suppliers (soft deactivate via UPDATE stays ops)
  - post payroll runs; cancel posted payroll runs
  - manage users / portal-create-access (already Edge-gated; unchanged here)

Staff+admin ops: PO, GRN, invoices, remittances, expenses, bank txns, shipments, etc.

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_account_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION private.is_account_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_account_admin() TO authenticated;

COMMENT ON FUNCTION private.is_account_admin() IS
  'Phase 45: true when caller is an active admin_profiles row with role = admin. Distinct from public.is_admin() (any profile) and private.is_ops_user() (admin|staff).';

-- Align legacy helper with active + role = admin (same meaning as is_account_admin).
CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_account_admin();
$$;

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- Suppliers: ops manage; DELETE admin-only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS workspace_manage_suppliers ON public.suppliers;
DROP POLICY IF EXISTS workspace_select_suppliers ON public.suppliers;
DROP POLICY IF EXISTS workspace_insert_suppliers ON public.suppliers;
DROP POLICY IF EXISTS workspace_update_suppliers ON public.suppliers;
DROP POLICY IF EXISTS workspace_delete_suppliers ON public.suppliers;

CREATE POLICY workspace_select_suppliers
  ON public.suppliers FOR SELECT TO authenticated
  USING ((SELECT private.is_ops_user()));

CREATE POLICY workspace_insert_suppliers
  ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_ops_user()));

CREATE POLICY workspace_update_suppliers
  ON public.suppliers FOR UPDATE TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

CREATE POLICY workspace_delete_suppliers
  ON public.suppliers FOR DELETE TO authenticated
  USING ((SELECT private.is_account_admin()));

-- ---------------------------------------------------------------------------
-- GL chart: ops SELECT; writes admin-only (RPC upsert is SECURITY DEFINER)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS workspace_manage_gl_accounts ON public.gl_accounts;
DROP POLICY IF EXISTS workspace_select_gl_accounts ON public.gl_accounts;
DROP POLICY IF EXISTS workspace_write_gl_accounts ON public.gl_accounts;

CREATE POLICY workspace_select_gl_accounts
  ON public.gl_accounts FOR SELECT TO authenticated
  USING ((SELECT private.is_ops_user()));

CREATE POLICY workspace_write_gl_accounts
  ON public.gl_accounts FOR ALL TO authenticated
  USING ((SELECT private.is_account_admin()))
  WITH CHECK ((SELECT private.is_account_admin()));

-- ---------------------------------------------------------------------------
-- Bank accounts: ops SELECT/UPDATE + txns; INSERT/DELETE admin-only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS workspace_manage_bank_accounts ON public.bank_accounts;
DROP POLICY IF EXISTS workspace_select_bank_accounts ON public.bank_accounts;
DROP POLICY IF EXISTS workspace_insert_bank_accounts ON public.bank_accounts;
DROP POLICY IF EXISTS workspace_update_bank_accounts ON public.bank_accounts;
DROP POLICY IF EXISTS workspace_delete_bank_accounts ON public.bank_accounts;

CREATE POLICY workspace_select_bank_accounts
  ON public.bank_accounts FOR SELECT TO authenticated
  USING ((SELECT private.is_ops_user()));

CREATE POLICY workspace_insert_bank_accounts
  ON public.bank_accounts FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_account_admin()));

CREATE POLICY workspace_update_bank_accounts
  ON public.bank_accounts FOR UPDATE TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

CREATE POLICY workspace_delete_bank_accounts
  ON public.bank_accounts FOR DELETE TO authenticated
  USING ((SELECT private.is_account_admin()));

-- ---------------------------------------------------------------------------
-- upsert_gl_account — chart changes admin-only
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
  IF NOT private.is_account_admin() THEN
    RAISE EXCEPTION 'Account admin required';
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
-- reverse_gl_journal — posted reversal admin-only
-- ---------------------------------------------------------------------------
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
  IF NOT private.is_account_admin() THEN
    RAISE EXCEPTION 'Account admin required';
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

-- ---------------------------------------------------------------------------
-- create_bank_account — admin-only (txns / update stay ops)
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
  IF NOT private.is_account_admin() THEN
    RAISE EXCEPTION 'Account admin required';
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

-- ---------------------------------------------------------------------------
-- post_payroll_run — admin-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_payroll_run(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  run public.payroll_runs%ROWTYPE;
BEGIN
  IF NOT private.is_account_admin() THEN
    RAISE EXCEPTION 'Account admin required';
  END IF;

  run := private.assert_draft_payroll_run(p_run_id);
  PERFORM private.refresh_payroll_run_totals(p_run_id);

  IF NOT EXISTS (SELECT 1 FROM public.payroll_lines WHERE payroll_run_id = p_run_id) THEN
    RAISE EXCEPTION 'Cannot post a payroll run with no lines';
  END IF;

  UPDATE public.payroll_runs SET
    status = 'posted',
    posted_at = now(),
    posted_by = auth.uid(),
    updated_at = now()
  WHERE id = p_run_id
  RETURNING * INTO run;

  RETURN run;
END;
$$;

REVOKE ALL ON FUNCTION public.post_payroll_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_payroll_run(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- cancel_payroll_run — draft cancel stays ops; posted cancel admin-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_payroll_run(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  run public.payroll_runs%ROWTYPE;
BEGIN
  SELECT * INTO run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF run.id IS NULL THEN
    RAISE EXCEPTION 'Payroll run not found';
  END IF;
  IF run.status = 'cancelled' THEN
    RETURN run;
  END IF;

  IF run.status = 'posted' THEN
    IF NOT private.is_account_admin() THEN
      RAISE EXCEPTION 'Account admin required to cancel a posted payroll run';
    END IF;
  ELSIF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  -- MVP: cancel marks the run only; no bank auto-pay to reverse.
  UPDATE public.payroll_runs SET
    status = 'cancelled',
    updated_at = now()
  WHERE id = p_run_id
  RETURNING * INTO run;

  RETURN run;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_payroll_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_payroll_run(uuid) TO authenticated;

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

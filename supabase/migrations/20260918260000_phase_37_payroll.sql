/* Phase 37: Payroll / leave / EOS MVP (ops-only).

Additive HR-lite: employees, leave requests, payroll runs/lines, rough EOS estimate.
Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).

bank_account_id on employees / payroll_runs is optional soft uuid (no FK) so this
phase does not depend on Phase 34 bank tables. No bank auto-pay.
*/

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_profile_id uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  full_name text NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 1 AND 200),
  join_date date NOT NULL,
  basic_salary numeric(14, 2) NOT NULL CHECK (basic_salary >= 0),
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(trim(currency)) = 3),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
  bank_account_id uuid,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employees_status_idx ON public.employees (status);
CREATE INDEX IF NOT EXISTS employees_admin_profile_idx
  ON public.employees (admin_profile_id)
  WHERE admin_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS employees_name_idx ON public.employees (full_name);

DROP TRIGGER IF EXISTS employees_updated_at ON public.employees;
CREATE TRIGGER employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_employees ON public.employees;
CREATE POLICY workspace_manage_employees
  ON public.employees FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.employees FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;

-- ---------------------------------------------------------------------------
-- leave_requests
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  leave_type text NOT NULL CHECK (leave_type IN ('annual', 'sick', 'unpaid', 'other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  decided_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_date_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS leave_requests_employee_idx ON public.leave_requests (employee_id);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON public.leave_requests (status);
CREATE INDEX IF NOT EXISTS leave_requests_dates_idx ON public.leave_requests (start_date, end_date);

DROP TRIGGER IF EXISTS leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER leave_requests_updated_at
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_leave_requests ON public.leave_requests;
CREATE POLICY workspace_manage_leave_requests
  ON public.leave_requests FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.leave_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;

-- ---------------------------------------------------------------------------
-- payroll sequences / runs / lines
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payroll_run_sequences (
  fiscal_year integer PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

ALTER TABLE public.payroll_run_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_direct_payroll_run_sequence_access ON public.payroll_run_sequences;
CREATE POLICY deny_direct_payroll_run_sequence_access
  ON public.payroll_run_sequences FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.payroll_run_sequences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_payroll_run_number()
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
  INSERT INTO public.payroll_run_sequences (fiscal_year, next_number)
  VALUES (fy, 2)
  ON CONFLICT (fiscal_year) DO UPDATE
    SET next_number = public.payroll_run_sequences.next_number + 1
  RETURNING next_number - 1 INTO n;
  RETURN 'PR-' || fy::text || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_payroll_run_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_payroll_run_number() TO authenticated;

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL DEFAULT 'AED' CHECK (char_length(trim(currency)) = 3),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  bank_account_id uuid,
  total_basic numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_basic >= 0),
  total_allowances numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_allowances >= 0),
  total_deductions numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_deductions >= 0),
  total_net numeric(14, 2) NOT NULL DEFAULT 0,
  posted_at timestamptz,
  posted_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_runs_period_range CHECK (period_end >= period_start),
  CONSTRAINT payroll_runs_run_number_uidx UNIQUE (run_number)
);

CREATE TABLE IF NOT EXISTS public.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  basic_salary numeric(14, 2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  allowances numeric(14, 2) NOT NULL DEFAULT 0 CHECK (allowances >= 0),
  deductions numeric(14, 2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  net_pay numeric(14, 2) NOT NULL DEFAULT 0,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_lines_unique_employee UNIQUE (payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS payroll_runs_status_idx ON public.payroll_runs (status);
CREATE INDEX IF NOT EXISTS payroll_runs_period_idx ON public.payroll_runs (period_start, period_end);
CREATE INDEX IF NOT EXISTS payroll_lines_run_idx ON public.payroll_lines (payroll_run_id);
CREATE INDEX IF NOT EXISTS payroll_lines_employee_idx ON public.payroll_lines (employee_id);

DROP TRIGGER IF EXISTS payroll_runs_updated_at ON public.payroll_runs;
CREATE TRIGGER payroll_runs_updated_at
BEFORE UPDATE ON public.payroll_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS payroll_lines_updated_at ON public.payroll_lines;
CREATE TRIGGER payroll_lines_updated_at
BEFORE UPDATE ON public.payroll_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_payroll_runs ON public.payroll_runs;
CREATE POLICY workspace_manage_payroll_runs
  ON public.payroll_runs FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS workspace_manage_payroll_lines ON public.payroll_lines;
CREATE POLICY workspace_manage_payroll_lines
  ON public.payroll_lines FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.payroll_runs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
REVOKE ALL ON public.payroll_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_lines TO authenticated;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.refresh_payroll_run_totals(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.payroll_runs SET
    total_basic = COALESCE((
      SELECT sum(basic_salary) FROM public.payroll_lines WHERE payroll_run_id = p_run_id
    ), 0),
    total_allowances = COALESCE((
      SELECT sum(allowances) FROM public.payroll_lines WHERE payroll_run_id = p_run_id
    ), 0),
    total_deductions = COALESCE((
      SELECT sum(deductions) FROM public.payroll_lines WHERE payroll_run_id = p_run_id
    ), 0),
    total_net = COALESCE((
      SELECT sum(net_pay) FROM public.payroll_lines WHERE payroll_run_id = p_run_id
    ), 0),
    updated_at = now()
  WHERE id = p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.assert_draft_payroll_run(p_run_id uuid)
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
  IF run.status <> 'draft' THEN
    RAISE EXCEPTION 'Payroll run is %, only draft can be edited', run.status;
  END IF;
  RETURN run;
END;
$$;

-- ---------------------------------------------------------------------------
-- leave decide
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decide_leave_request(
  p_leave_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS public.leave_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.leave_requests%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Status must be approved or rejected';
  END IF;

  SELECT * INTO req FROM public.leave_requests WHERE id = p_leave_id FOR UPDATE;
  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'Leave request is already %', req.status;
  END IF;

  UPDATE public.leave_requests SET
    status = p_status,
    notes = COALESCE(NULLIF(trim(p_notes), ''), notes),
    decided_by = auth.uid(),
    decided_at = now(),
    updated_at = now()
  WHERE id = p_leave_id
  RETURNING * INTO req;

  RETURN req;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_leave_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_leave_request(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- payroll create / update line / post / cancel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_payroll_run(
  p_period_start date,
  p_period_end date,
  p_currency text DEFAULT 'AED',
  p_employee_ids uuid[] DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_bank_account_id uuid DEFAULT NULL
)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  run public.payroll_runs%ROWTYPE;
  emp record;
  v_currency text := upper(trim(COALESCE(p_currency, 'AED')));
  v_count integer := 0;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL THEN
    RAISE EXCEPTION 'Period start and end are required';
  END IF;
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Period end must be on or after period start';
  END IF;
  IF char_length(v_currency) <> 3 THEN
    RAISE EXCEPTION 'Currency must be a 3-letter code';
  END IF;

  INSERT INTO public.payroll_runs (
    run_number, status, period_start, period_end, currency, notes, bank_account_id, created_by
  ) VALUES (
    public.next_payroll_run_number(),
    'draft',
    p_period_start,
    p_period_end,
    v_currency,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    p_bank_account_id,
    auth.uid()
  )
  RETURNING * INTO run;

  FOR emp IN
    SELECT *
    FROM public.employees e
    WHERE e.status = 'active'
      AND e.currency = v_currency
      AND (
        p_employee_ids IS NULL
        OR cardinality(p_employee_ids) = 0
        OR e.id = ANY (p_employee_ids)
      )
    ORDER BY e.full_name
  LOOP
    INSERT INTO public.payroll_lines (
      payroll_run_id, employee_id, basic_salary, allowances, deductions, net_pay
    ) VALUES (
      run.id,
      emp.id,
      emp.basic_salary,
      0,
      0,
      emp.basic_salary
    );
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No active employees found for currency %', v_currency;
  END IF;

  PERFORM private.refresh_payroll_run_totals(run.id);
  SELECT * INTO run FROM public.payroll_runs WHERE id = run.id;
  RETURN run;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payroll_run(date, date, text, uuid[], text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payroll_run(date, date, text, uuid[], text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_payroll_line(
  p_line_id uuid,
  p_basic_salary numeric,
  p_allowances numeric,
  p_deductions numeric,
  p_notes text DEFAULT NULL
)
RETURNS public.payroll_lines
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  line public.payroll_lines%ROWTYPE;
  run public.payroll_runs%ROWTYPE;
  v_basic numeric(14, 2) := round(COALESCE(p_basic_salary, 0), 2);
  v_allow numeric(14, 2) := round(COALESCE(p_allowances, 0), 2);
  v_deduct numeric(14, 2) := round(COALESCE(p_deductions, 0), 2);
  v_net numeric(14, 2);
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;
  IF v_basic < 0 OR v_allow < 0 OR v_deduct < 0 THEN
    RAISE EXCEPTION 'Amounts must be non-negative';
  END IF;

  SELECT * INTO line FROM public.payroll_lines WHERE id = p_line_id FOR UPDATE;
  IF line.id IS NULL THEN
    RAISE EXCEPTION 'Payroll line not found';
  END IF;

  run := private.assert_draft_payroll_run(line.payroll_run_id);
  v_net := round(v_basic + v_allow - v_deduct, 2);

  UPDATE public.payroll_lines SET
    basic_salary = v_basic,
    allowances = v_allow,
    deductions = v_deduct,
    net_pay = v_net,
    notes = CASE
      WHEN p_notes IS NULL THEN notes
      ELSE NULLIF(trim(p_notes), '')
    END,
    updated_at = now()
  WHERE id = p_line_id
  RETURNING * INTO line;

  PERFORM private.refresh_payroll_run_totals(run.id);
  RETURN line;
END;
$$;

REVOKE ALL ON FUNCTION public.update_payroll_line(uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_payroll_line(uuid, numeric, numeric, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_payroll_run(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  run public.payroll_runs%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
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

CREATE OR REPLACE FUNCTION public.cancel_payroll_run(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  run public.payroll_runs%ROWTYPE;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT * INTO run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF run.id IS NULL THEN
    RAISE EXCEPTION 'Payroll run not found';
  END IF;
  IF run.status = 'cancelled' THEN
    RETURN run;
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
-- EOS estimate (rough helper — NOT legal advice)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.estimate_employee_eos(
  p_employee_id uuid,
  p_as_of_date date DEFAULT (CURRENT_DATE)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  emp public.employees%ROWTYPE;
  v_as_of date := COALESCE(p_as_of_date, CURRENT_DATE);
  v_years numeric(10, 4);
  v_estimate numeric(14, 2);
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  SELECT * INTO emp FROM public.employees WHERE id = p_employee_id;
  IF emp.id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF v_as_of < emp.join_date THEN
    RAISE EXCEPTION 'As-of date cannot be before join date';
  END IF;

  -- Rough years of service; estimate = basic_salary * years.
  -- This is a planning helper only — not UAE labour-law EOS entitlement advice.
  v_years := round(((v_as_of - emp.join_date)::numeric / 365.25), 4);
  IF v_years < 0 THEN
    v_years := 0;
  END IF;
  v_estimate := round(emp.basic_salary * v_years, 2);

  RETURN jsonb_build_object(
    'employee_id', emp.id,
    'full_name', emp.full_name,
    'join_date', emp.join_date,
    'as_of_date', v_as_of,
    'basic_salary', emp.basic_salary,
    'currency', emp.currency,
    'years_of_service', v_years,
    'estimate_amount', v_estimate,
    'formula', 'basic_salary * years_of_service (years = days/365.25)',
    'disclaimer',
      'ESTIMATE ONLY — not legal advice and not a UAE labour-law end-of-service '
      || 'gratuity calculation. Confirm with HR/legal before paying or promising EOS.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.estimate_employee_eos(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estimate_employee_eos(uuid, date) TO authenticated;

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

/* Phase 48: UAE-oriented payroll / EOS upgrade (still MVP).

- employees.leave_balance_days + leave_requests.days / deducted_from_balance
- decide_leave_request optional balance deduction on approve (annual leave)
- estimate_employee_eos: indicative UAE-style bands + resignation/termination
  multipliers; persists inputs/outputs to eos_estimate_logs
- INDICATIVE ONLY — not legal advice and not a claim of labour-law compliance

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
No Open Banking.
*/

-- ---------------------------------------------------------------------------
-- leave balance on employees
-- ---------------------------------------------------------------------------

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS leave_balance_days numeric(8, 2) NOT NULL DEFAULT 30
    CHECK (leave_balance_days >= 0);

COMMENT ON COLUMN public.employees.leave_balance_days IS
  'Simple annual leave balance (days). Ops MVP only — not a full leave accrual engine.';

-- ---------------------------------------------------------------------------
-- leave request day count + deduction flag
-- ---------------------------------------------------------------------------

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS days numeric(8, 2)
    CHECK (days IS NULL OR days >= 0);

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS deducted_from_balance boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leave_requests.days IS
  'Inclusive calendar days (end_date - start_date + 1) used for optional balance deduction.';

CREATE OR REPLACE FUNCTION private.leave_request_set_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.days IS NULL THEN
    NEW.days := (NEW.end_date - NEW.start_date + 1)::numeric;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leave_requests_set_days ON public.leave_requests;
CREATE TRIGGER leave_requests_set_days
BEFORE INSERT OR UPDATE OF start_date, end_date, days
ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION private.leave_request_set_days();

UPDATE public.leave_requests
SET days = (end_date - start_date + 1)::numeric
WHERE days IS NULL;

-- ---------------------------------------------------------------------------
-- eos_estimate_logs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.eos_estimate_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  as_of_date date NOT NULL,
  separation_type text NOT NULL
    CHECK (separation_type IN ('resignation', 'termination')),
  basic_salary numeric(14, 2) NOT NULL CHECK (basic_salary >= 0),
  currency text NOT NULL CHECK (char_length(trim(currency)) = 3),
  days_of_service integer NOT NULL CHECK (days_of_service >= 0),
  years_of_service numeric(10, 4) NOT NULL CHECK (years_of_service >= 0),
  daily_wage numeric(14, 4) NOT NULL CHECK (daily_wage >= 0),
  entitlement_days numeric(12, 4) NOT NULL CHECK (entitlement_days >= 0),
  mode_multiplier numeric(8, 4) NOT NULL CHECK (mode_multiplier >= 0),
  estimate_amount numeric(14, 2) NOT NULL CHECK (estimate_amount >= 0),
  formula text NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  disclaimer text NOT NULL,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eos_estimate_logs_employee_idx
  ON public.eos_estimate_logs (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eos_estimate_logs_created_idx
  ON public.eos_estimate_logs (created_at DESC);

COMMENT ON TABLE public.eos_estimate_logs IS
  'Persisted indicative EOS calculator runs. Not legal advice; not a payroll entitlement ledger.';

ALTER TABLE public.eos_estimate_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_manage_eos_estimate_logs ON public.eos_estimate_logs;
CREATE POLICY workspace_manage_eos_estimate_logs
  ON public.eos_estimate_logs FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

REVOKE ALL ON public.eos_estimate_logs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eos_estimate_logs TO authenticated;

-- ---------------------------------------------------------------------------
-- leave decide — optional annual leave balance deduction
-- ---------------------------------------------------------------------------

-- Single signature (with defaults) so PostgREST/named-arg calls stay unambiguous.
DROP FUNCTION IF EXISTS public.decide_leave_request(uuid, text, text);
DROP FUNCTION IF EXISTS public.decide_leave_request(uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION public.decide_leave_request(
  p_leave_id uuid,
  p_status text,
  p_notes text DEFAULT NULL,
  p_deduct_balance boolean DEFAULT true
)
RETURNS public.leave_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.leave_requests%ROWTYPE;
  v_days numeric(8, 2);
  v_balance numeric(8, 2);
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

  v_days := COALESCE(req.days, (req.end_date - req.start_date + 1)::numeric);

  IF p_status = 'approved'
     AND COALESCE(p_deduct_balance, true)
     AND req.leave_type = 'annual'
     AND NOT req.deducted_from_balance
  THEN
    SELECT leave_balance_days INTO v_balance
    FROM public.employees
    WHERE id = req.employee_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Employee not found';
    END IF;
    IF v_days > v_balance THEN
      RAISE EXCEPTION
        'Insufficient leave balance (need %, have %)',
        v_days,
        v_balance;
    END IF;

    UPDATE public.employees
    SET
      leave_balance_days = leave_balance_days - v_days,
      updated_at = now()
    WHERE id = req.employee_id;
  END IF;

  UPDATE public.leave_requests SET
    status = p_status,
    days = v_days,
    notes = COALESCE(NULLIF(trim(p_notes), ''), notes),
    decided_by = auth.uid(),
    decided_at = now(),
    deducted_from_balance = CASE
      WHEN p_status = 'approved'
           AND COALESCE(p_deduct_balance, true)
           AND req.leave_type = 'annual'
      THEN true
      ELSE deducted_from_balance
    END,
    updated_at = now()
  WHERE id = p_leave_id
  RETURNING * INTO req;

  RETURN req;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_leave_request(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_leave_request(uuid, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- EOS estimate — UAE-oriented indicative bands (NOT legal advice)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.estimate_employee_eos(uuid, date);

CREATE OR REPLACE FUNCTION public.estimate_employee_eos(
  p_employee_id uuid,
  p_as_of_date date DEFAULT (CURRENT_DATE),
  p_separation_type text DEFAULT 'termination',
  p_basic_salary numeric DEFAULT NULL,
  p_persist boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  emp public.employees%ROWTYPE;
  v_as_of date := COALESCE(p_as_of_date, CURRENT_DATE);
  v_sep text := lower(trim(COALESCE(p_separation_type, 'termination')));
  v_basic numeric(14, 2);
  v_days integer;
  v_years numeric(10, 4);
  v_daily numeric(14, 4);
  v_years_first5 numeric(10, 4);
  v_years_after5 numeric(10, 4);
  v_entitlement_days numeric(12, 4);
  v_uncapped numeric(14, 2);
  v_cap numeric(14, 2);
  v_full_amount numeric(14, 2);
  v_multiplier numeric(8, 4);
  v_estimate numeric(14, 2);
  v_formula text;
  v_disclaimer text;
  v_inputs jsonb;
  v_result jsonb;
  v_log_id uuid;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required';
  END IF;

  IF v_sep NOT IN ('resignation', 'termination') THEN
    RAISE EXCEPTION 'separation_type must be resignation or termination';
  END IF;

  SELECT * INTO emp FROM public.employees WHERE id = p_employee_id;
  IF emp.id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF v_as_of < emp.join_date THEN
    RAISE EXCEPTION 'As-of date cannot be before join date';
  END IF;

  v_basic := COALESCE(p_basic_salary, emp.basic_salary);
  IF v_basic IS NULL OR v_basic < 0 THEN
    RAISE EXCEPTION 'Basic salary must be >= 0';
  END IF;

  v_days := (v_as_of - emp.join_date);
  IF v_days < 0 THEN
    v_days := 0;
  END IF;
  v_years := round((v_days::numeric / 365.25), 4);

  -- Indicative UAE-style day-wage bands (Federal Decree-Law planning shorthand):
  -- daily = basic/30; 21 days/year for first 5 years; 30 days/year thereafter;
  -- uncapped amount capped at 2× annual basic. Separation multipliers are a
  -- common planning shorthand (legacy resignation reductions) — not legal advice.
  v_daily := round(v_basic / 30.0, 4);
  v_years_first5 := LEAST(v_years, 5);
  v_years_after5 := GREATEST(v_years - 5, 0);
  v_entitlement_days := round((v_years_first5 * 21) + (v_years_after5 * 30), 4);
  v_uncapped := round(v_daily * v_entitlement_days, 2);
  v_cap := round(v_basic * 24, 2); -- 2 years' wages
  v_full_amount := LEAST(v_uncapped, v_cap);

  IF v_years < 1 THEN
    v_multiplier := 0;
  ELSIF v_sep = 'termination' THEN
    v_multiplier := 1;
  ELSIF v_years < 3 THEN
    v_multiplier := round(1.0 / 3.0, 4);
  ELSIF v_years < 5 THEN
    v_multiplier := round(2.0 / 3.0, 4);
  ELSE
    v_multiplier := 1;
  END IF;

  v_estimate := round(v_full_amount * v_multiplier, 2);

  v_formula :=
    'indicative UAE-style: daily=basic/30; entitlement_days='
    || 'min(years,5)*21 + max(years-5,0)*30; amount=min(daily*entitlement_days, basic*24)'
    || '; then × separation multiplier (termination=1 if years≥1; resignation='
    || '0/<1y, 1/3 for 1–3y, 2/3 for 3–5y, 1 for ≥5y)';

  v_disclaimer :=
    'INDICATIVE ESTIMATE ONLY — not legal advice and not a certified UAE labour-law '
    || 'end-of-service gratuity calculation. Bands and resignation/termination '
    || 'multipliers are planning shorthand only. Confirm with HR/legal before paying '
    || 'or promising EOS. ANSHA does not claim legal compliance.';

  v_inputs := jsonb_build_object(
    'employee_id', emp.id,
    'join_date', emp.join_date,
    'as_of_date', v_as_of,
    'separation_type', v_sep,
    'basic_salary', v_basic,
    'basic_salary_source',
      CASE WHEN p_basic_salary IS NULL THEN 'employee' ELSE 'override' END,
    'currency', emp.currency,
    'persist', COALESCE(p_persist, true)
  );

  v_result := jsonb_build_object(
    'employee_id', emp.id,
    'full_name', emp.full_name,
    'join_date', emp.join_date,
    'as_of_date', v_as_of,
    'separation_type', v_sep,
    'basic_salary', v_basic,
    'currency', emp.currency,
    'days_of_service', v_days,
    'years_of_service', v_years,
    'daily_wage', v_daily,
    'years_first5', v_years_first5,
    'years_after5', v_years_after5,
    'entitlement_days', v_entitlement_days,
    'uncapped_amount', v_uncapped,
    'cap_amount', v_cap,
    'full_amount_before_multiplier', v_full_amount,
    'mode_multiplier', v_multiplier,
    'estimate_amount', v_estimate,
    'formula', v_formula,
    'disclaimer', v_disclaimer
  );

  IF COALESCE(p_persist, true) THEN
    INSERT INTO public.eos_estimate_logs (
      employee_id,
      as_of_date,
      separation_type,
      basic_salary,
      currency,
      days_of_service,
      years_of_service,
      daily_wage,
      entitlement_days,
      mode_multiplier,
      estimate_amount,
      formula,
      inputs,
      result,
      disclaimer,
      created_by
    ) VALUES (
      emp.id,
      v_as_of,
      v_sep,
      v_basic,
      emp.currency,
      v_days,
      v_years,
      v_daily,
      v_entitlement_days,
      v_multiplier,
      v_estimate,
      v_formula,
      v_inputs,
      v_result,
      v_disclaimer,
      auth.uid()
    )
    RETURNING id INTO v_log_id;

    v_result := v_result || jsonb_build_object('log_id', v_log_id);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.estimate_employee_eos(uuid, date, text, numeric, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estimate_employee_eos(uuid, date, text, numeric, boolean)
  TO authenticated;

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

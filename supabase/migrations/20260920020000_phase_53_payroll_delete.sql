/* Phase 53: account-admin payroll deletes.

- delete_payroll_employee: removes leave_requests + payroll_lines for the employee,
  refreshes affected run totals, then deletes the employee (eos_estimate_logs CASCADE).
- delete_payroll_run: hard-deletes a draft or cancelled run (lines CASCADE).
  Posted runs must be cancelled first.

Both gated by private.is_account_admin(). Additive only — no drops of unrelated objects.
*/

-- ---------------------------------------------------------------------------
-- delete_payroll_employee — account admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_payroll_employee(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  emp public.employees%ROWTYPE;
  v_leave_count integer := 0;
  v_line_count integer := 0;
  v_eos_count integer := 0;
  affected_runs uuid[];
  run_id uuid;
BEGIN
  IF NOT private.is_account_admin() THEN
    RAISE EXCEPTION 'Account admin required';
  END IF;
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee id is required';
  END IF;

  SELECT * INTO emp FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF emp.id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  SELECT count(*)::integer INTO v_eos_count
  FROM public.eos_estimate_logs
  WHERE employee_id = p_employee_id;

  SELECT coalesce(array_agg(DISTINCT payroll_run_id), ARRAY[]::uuid[])
  INTO affected_runs
  FROM public.payroll_lines
  WHERE employee_id = p_employee_id;

  DELETE FROM public.leave_requests
  WHERE employee_id = p_employee_id;
  GET DIAGNOSTICS v_leave_count = ROW_COUNT;

  DELETE FROM public.payroll_lines
  WHERE employee_id = p_employee_id;
  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  IF affected_runs IS NOT NULL THEN
    FOREACH run_id IN ARRAY affected_runs
    LOOP
      PERFORM private.refresh_payroll_run_totals(run_id);
    END LOOP;
  END IF;

  DELETE FROM public.employees WHERE id = p_employee_id;

  PERFORM private.write_audit_log(
    'delete',
    'employee',
    p_employee_id,
    jsonb_build_object(
      'full_name', emp.full_name,
      'leave_deleted', v_leave_count,
      'payroll_lines_deleted', v_line_count,
      'eos_logs_cascaded', v_eos_count
    )
  );

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'full_name', emp.full_name,
    'leave_deleted', v_leave_count,
    'payroll_lines_deleted', v_line_count,
    'eos_logs_cascaded', v_eos_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_payroll_employee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_payroll_employee(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_payroll_employee(uuid) IS
  'Phase 53: account-admin hard-delete of an employee and related leave/payroll lines (EOS logs cascade).';

-- ---------------------------------------------------------------------------
-- delete_payroll_run — account admin; draft or cancelled only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_payroll_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  run public.payroll_runs%ROWTYPE;
  v_line_count integer := 0;
BEGIN
  IF NOT private.is_account_admin() THEN
    RAISE EXCEPTION 'Account admin required';
  END IF;
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'Payroll run id is required';
  END IF;

  SELECT * INTO run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF run.id IS NULL THEN
    RAISE EXCEPTION 'Payroll run not found';
  END IF;
  IF run.status = 'posted' THEN
    RAISE EXCEPTION 'Cancel the posted payroll run before deleting it';
  END IF;

  SELECT count(*)::integer INTO v_line_count
  FROM public.payroll_lines
  WHERE payroll_run_id = p_run_id;

  DELETE FROM public.payroll_runs WHERE id = p_run_id;

  PERFORM private.write_audit_log(
    'delete',
    'payroll_run',
    p_run_id,
    jsonb_build_object(
      'run_number', run.run_number,
      'status', run.status,
      'lines_deleted', v_line_count,
      'period_start', run.period_start,
      'period_end', run.period_end
    )
  );

  RETURN jsonb_build_object(
    'payroll_run_id', p_run_id,
    'run_number', run.run_number,
    'status', run.status,
    'lines_deleted', v_line_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_payroll_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_payroll_run(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_payroll_run(uuid) IS
  'Phase 53: account-admin hard-delete of a draft or cancelled payroll run (lines CASCADE).';

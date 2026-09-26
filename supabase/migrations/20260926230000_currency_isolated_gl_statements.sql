-- Currency-isolated financial statements. Select one original journal currency; no inferred FX.

CREATE OR REPLACE FUNCTION public.gl_trial_balance_currency(p_as_of date, p_currency text)
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
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'A 3-letter uppercase currency is required';
  END IF;
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
      AND j.currency = p_currency
  ) x ON x.account_id = a.id
  WHERE a.is_active = true
     OR EXISTS (
       SELECT 1
       FROM public.gl_journal_lines lx
       JOIN public.gl_journals jx ON jx.id = lx.journal_id
       WHERE lx.account_id = a.id
         AND jx.status = 'posted'
         AND jx.entry_date <= p_as_of
         AND jx.currency = p_currency
     )
  GROUP BY a.id, a.code, a.name, a.account_type, a.sort_order
  HAVING COALESCE(sum(x.debit), 0) <> 0 OR COALESCE(sum(x.credit), 0) <> 0 OR a.is_active = true
  ORDER BY a.sort_order, a.code;
END;
$$;

REVOKE ALL ON FUNCTION public.gl_trial_balance_currency(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gl_trial_balance_currency(date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gl_profit_and_loss_currency(
  p_from date,
  p_to date,
  p_currency text
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
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'A 3-letter uppercase currency is required';
  END IF;
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
    AND j.currency = p_currency
  GROUP BY a.id, a.code, a.name, a.account_type, a.sort_order
  HAVING abs(COALESCE(sum(l.debit), 0) - COALESCE(sum(l.credit), 0)) > 0.005
  ORDER BY a.account_type DESC, a.sort_order, a.code;
END;
$$;

REVOKE ALL ON FUNCTION public.gl_profit_and_loss_currency(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gl_profit_and_loss_currency(date, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gl_balance_sheet_currency(p_as_of date, p_currency text)
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
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'A 3-letter uppercase currency is required';
  END IF;
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
      AND j.currency = p_currency
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
      AND j.currency = p_currency
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

REVOKE ALL ON FUNCTION public.gl_balance_sheet_currency(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gl_balance_sheet_currency(date, text) TO authenticated;


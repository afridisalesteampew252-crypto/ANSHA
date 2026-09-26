-- Admin-only geographic customer and seller evidence, isolated by invoice currency.
CREATE OR REPLACE FUNCTION public.get_geographic_recommendations(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_profiles ap WHERE ap.id = auth.uid() AND ap.role = 'admin' AND ap.is_active = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to > current_date OR p_from < current_date - interval '5 years' THEN
    RAISE EXCEPTION 'Choose a valid range within the past five years';
  END IF;

  WITH payment_dates AS (
    SELECT invoice_id, max(payment_date) AS last_payment_date
    FROM public.invoice_payments
    GROUP BY invoice_id
  ), scoped AS (
    SELECT i.id, i.customer_id, i.created_by AS seller_id,
      COALESCE(NULLIF(initcap(btrim(c.country)), ''), 'Unknown') AS country,
      upper(i.currency) AS currency, i.total_amount, i.balance_due,
      i.issue_date, i.due_date, i.status, p.last_payment_date,
      (i.status = 'paid' OR i.balance_due <= 0) AS settled,
      (i.balance_due > 0 AND i.due_date < current_date) AS overdue
    FROM public.invoices i
    LEFT JOIN public.customers c ON c.id = i.customer_id
    LEFT JOIN payment_dates p ON p.invoice_id = i.id
    WHERE i.issue_date BETWEEN p_from AND p_to
      AND i.document_type IN ('tax_invoice', 'commercial_invoice')
      AND i.status NOT IN ('draft', 'cancelled')
  ), countries AS (
    SELECT country, currency,
      count(*)::int AS invoice_count,
      count(DISTINCT customer_id)::int AS customer_count,
      round(sum(total_amount), 2) AS invoiced,
      round(sum(greatest(balance_due, 0)), 2) AS outstanding,
      count(*) FILTER (WHERE settled)::int AS settled_count,
      count(*) FILTER (WHERE overdue)::int AS overdue_count,
      count(*) FILTER (WHERE settled AND last_payment_date IS NOT NULL)::int AS timed_count,
      count(*) FILTER (WHERE settled AND last_payment_date <= due_date)::int AS on_time_count
    FROM scoped GROUP BY country, currency
  ), country_scores AS (
    SELECT *,
      round(100 * (0.50 * settled_count::numeric / nullif(invoice_count, 0)
        + 0.30 * coalesce(on_time_count::numeric / nullif(timed_count, 0), 0)
        + 0.20 * (1 - overdue_count::numeric / nullif(invoice_count, 0))), 0) AS reliability_score
    FROM countries
  ), sellers AS (
    SELECT s.seller_id, coalesce(a.full_name, a.email, 'Unknown seller') AS seller,
      s.country, s.currency, count(*)::int AS invoice_count,
      count(DISTINCT s.customer_id)::int AS customer_count,
      round(sum(s.total_amount), 2) AS invoiced,
      count(*) FILTER (WHERE s.settled)::int AS settled_count,
      count(*) FILTER (WHERE s.overdue)::int AS overdue_count
    FROM scoped s LEFT JOIN public.admin_profiles a ON a.id = s.seller_id
    GROUP BY s.seller_id, a.full_name, a.email, s.country, s.currency
  )
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'countries', coalesce((SELECT jsonb_agg(to_jsonb(cs) || jsonb_build_object(
      'confidence', CASE WHEN cs.invoice_count >= 5 AND cs.customer_count >= 3 AND cs.timed_count >= 3
        THEN 'enough_history' ELSE 'limited_history' END)
      ORDER BY cs.currency, cs.reliability_score DESC, cs.invoice_count DESC)
      FROM country_scores cs), '[]'::jsonb),
    'sellers', coalesce((SELECT jsonb_agg(to_jsonb(s)
      ORDER BY s.currency, s.country, s.invoice_count DESC, s.invoiced DESC)
      FROM sellers s), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_geographic_recommendations(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_geographic_recommendations(date, date) TO authenticated;
COMMENT ON FUNCTION public.get_geographic_recommendations(date, date) IS
  'Admin-only geographic evidence. Sales by creator; countries from customer profile. Currency partitions must never be summed.';

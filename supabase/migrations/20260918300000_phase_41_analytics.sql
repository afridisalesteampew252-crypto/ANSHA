/* Phase 41: ops analytics summary RPC for admin dashboard / analytics.

Returns jsonb KPIs for a date range from existing tables (no new analytics SaaS).

Access: any active workspace user (admin/staff/sales).
  - Sales (safe subset): own-book receivables (owned customers or created_by),
    stock, requests, catalog/inquiry counts. No remittances, POs, or GRNs.
  - Ops (admin/staff): company-wide sales + collections + purchase + GRN.

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

CREATE OR REPLACE FUNCTION public.get_ops_analytics_summary(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_ops boolean := private.is_ops_user();
  v_is_sales boolean := private.is_sales_agent();
  v_role text;
  receivable_types text[] := ARRAY['tax_invoice', 'commercial_invoice'];
  sales_json jsonb;
  collections_json jsonb;
  stock_json jsonb;
  purchase_json jsonb;
  requests_json jsonb;
  counts_json jsonb;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required'
      USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'p_from and p_to are required';
  END IF;

  IF p_to < p_from THEN
    RAISE EXCEPTION 'p_to must be on or after p_from';
  END IF;

  SELECT ap.role INTO v_role
  FROM public.admin_profiles ap
  WHERE ap.id = v_uid;

  -- ---------------------------------------------------------------------------
  -- Sales / AR (tax + commercial)
  -- ---------------------------------------------------------------------------
  WITH scoped AS (
    SELECT
      inv.id,
      inv.issue_date,
      inv.document_type,
      inv.currency,
      inv.status,
      COALESCE(inv.total_amount, 0)::numeric AS total_amount,
      COALESCE(inv.balance_due, 0)::numeric AS balance_due
    FROM public.invoices inv
    LEFT JOIN public.customers c ON c.id = inv.customer_id
    WHERE inv.issue_date BETWEEN p_from AND p_to
      AND inv.document_type = ANY (receivable_types)
      AND inv.status IS DISTINCT FROM 'cancelled'
      AND (
        v_is_ops
        OR (
          v_is_sales
          AND (
            inv.created_by = v_uid
            OR c.owner_id = v_uid
          )
        )
      )
  ),
  monthly AS (
    SELECT
      to_char(date_trunc('month', s.issue_date), 'YYYY-MM') AS month_key,
      to_char(date_trunc('month', s.issue_date), 'Mon') AS month_label,
      COUNT(*) FILTER (WHERE s.document_type = 'tax_invoice')::integer AS tax_invoice_count,
      COUNT(*) FILTER (WHERE s.document_type = 'commercial_invoice')::integer AS commercial_invoice_count,
      COUNT(*)::integer AS invoice_count,
      ROUND(SUM(s.total_amount), 2) AS invoiced_total
    FROM scoped s
    GROUP BY 1, 2
  ),
  by_currency AS (
    SELECT
      s.currency,
      COUNT(*)::integer AS invoice_count,
      ROUND(SUM(s.total_amount), 2) AS invoiced_total,
      ROUND(SUM(s.balance_due), 2) AS outstanding_ar
    FROM scoped s
    GROUP BY s.currency
  ),
  totals AS (
    SELECT
      COUNT(*)::integer AS invoice_count,
      ROUND(COALESCE(SUM(s.total_amount), 0), 2) AS invoiced_total,
      ROUND(COALESCE(SUM(s.balance_due), 0), 2) AS outstanding_ar,
      COALESCE(
        (SELECT bc.currency FROM by_currency bc ORDER BY bc.invoiced_total DESC LIMIT 1),
        'AED'
      ) AS currency_focus
    FROM scoped s
  )
  SELECT jsonb_build_object(
    'scope', CASE WHEN v_is_ops THEN 'company' ELSE 'own_book' END,
    'document_types', to_jsonb(receivable_types),
    'totals', (SELECT to_jsonb(t) FROM totals t),
    'by_month', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.month_key) FROM monthly m), '[]'::jsonb),
    'by_currency', COALESCE((SELECT jsonb_agg(to_jsonb(bc) ORDER BY bc.invoiced_total DESC) FROM by_currency bc), '[]'::jsonb)
  )
  INTO sales_json;

  -- Outstanding AR as-of (open balances on non-cancelled receivables), not limited to issue_date in range
  WITH open_ar AS (
    SELECT
      inv.currency,
      ROUND(SUM(COALESCE(inv.balance_due, 0)), 2) AS outstanding_ar,
      COUNT(*)::integer AS open_invoice_count
    FROM public.invoices inv
    LEFT JOIN public.customers c ON c.id = inv.customer_id
    WHERE inv.document_type = ANY (receivable_types)
      AND inv.status IS DISTINCT FROM 'cancelled'
      AND COALESCE(inv.balance_due, 0) > 0
      AND (
        v_is_ops
        OR (
          v_is_sales
          AND (
            inv.created_by = v_uid
            OR c.owner_id = v_uid
          )
        )
      )
    GROUP BY inv.currency
  )
  SELECT sales_json || jsonb_build_object(
    'outstanding_as_of', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.outstanding_ar DESC) FROM open_ar o), '[]'::jsonb),
    'outstanding_total', COALESCE((SELECT ROUND(SUM(o.outstanding_ar), 2) FROM open_ar o), 0)
  )
  INTO sales_json;

  -- ---------------------------------------------------------------------------
  -- Collections (confirmed remittances) — ops only
  -- ---------------------------------------------------------------------------
  IF v_is_ops THEN
    WITH rem AS (
      SELECT
        r.received_date,
        r.currency,
        COALESCE(r.amount, 0)::numeric AS amount
      FROM public.remittances r
      WHERE r.received_date BETWEEN p_from AND p_to
        AND r.status = 'confirmed'
    ),
    monthly AS (
      SELECT
        to_char(date_trunc('month', rem.received_date), 'YYYY-MM') AS month_key,
        to_char(date_trunc('month', rem.received_date), 'Mon') AS month_label,
        COUNT(*)::integer AS remittance_count,
        ROUND(SUM(rem.amount), 2) AS received_total
      FROM rem
      GROUP BY 1, 2
    ),
    by_currency AS (
      SELECT
        rem.currency,
        COUNT(*)::integer AS remittance_count,
        ROUND(SUM(rem.amount), 2) AS received_total
      FROM rem
      GROUP BY rem.currency
    )
    SELECT jsonb_build_object(
      'totals', jsonb_build_object(
        'remittance_count', (SELECT COUNT(*)::integer FROM rem),
        'received_total', (SELECT ROUND(COALESCE(SUM(amount), 0), 2) FROM rem),
        'currency_focus', COALESCE(
          (SELECT bc.currency FROM by_currency bc ORDER BY bc.received_total DESC LIMIT 1),
          'AED'
        )
      ),
      'by_month', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.month_key) FROM monthly m), '[]'::jsonb),
      'by_currency', COALESCE((SELECT jsonb_agg(to_jsonb(bc) ORDER BY bc.received_total DESC) FROM by_currency bc), '[]'::jsonb)
    )
    INTO collections_json;
  ELSE
    collections_json := NULL;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Stock position (parts + vehicles)
  -- ---------------------------------------------------------------------------
  WITH stock_rows AS (
    SELECT COALESCE(stock_status, 'available') AS stock_status,
           COALESCE(stock_origin, 'dubai') AS stock_origin,
           'part'::text AS kind
    FROM public.parts
    UNION ALL
    SELECT COALESCE(stock_status, 'available'),
           COALESCE(stock_origin, 'dubai'),
           'vehicle'::text
    FROM public.vehicles
  )
  SELECT jsonb_build_object(
    'by_status', jsonb_build_object(
      'available', (SELECT COUNT(*)::integer FROM stock_rows WHERE stock_status = 'available'),
      'reserved', (SELECT COUNT(*)::integer FROM stock_rows WHERE stock_status = 'reserved'),
      'sold', (SELECT COUNT(*)::integer FROM stock_rows WHERE stock_status = 'sold')
    ),
    'by_origin', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('origin', x.stock_origin, 'count', x.cnt)
          ORDER BY x.cnt DESC
        )
        FROM (
          SELECT stock_origin, COUNT(*)::integer AS cnt
          FROM stock_rows
          GROUP BY stock_origin
        ) x
      ),
      '[]'::jsonb
    ),
    'parts_total', (SELECT COUNT(*)::integer FROM public.parts),
    'vehicles_total', (SELECT COUNT(*)::integer FROM public.vehicles)
  )
  INTO stock_json;

  -- ---------------------------------------------------------------------------
  -- Purchase (open POs + GRNs) — ops only
  -- ---------------------------------------------------------------------------
  IF v_is_ops THEN
    SELECT jsonb_build_object(
      'open_pos', (
        SELECT COUNT(*)::integer
        FROM public.purchase_orders po
        WHERE po.status = 'ordered'
          AND po.match_status IN ('open', 'partially_received', 'received', 'invoiced')
      ),
      'draft_pos', (
        SELECT COUNT(*)::integer FROM public.purchase_orders po WHERE po.status = 'draft'
      ),
      'ordered_pos', (
        SELECT COUNT(*)::integer FROM public.purchase_orders po WHERE po.status = 'ordered'
      ),
      'grn_in_range', (
        SELECT COUNT(*)::integer
        FROM public.inventory_receipts ir
        WHERE ir.received_date BETWEEN p_from AND p_to
      ),
      'grn_total', (SELECT COUNT(*)::integer FROM public.inventory_receipts)
    )
    INTO purchase_json;
  ELSE
    purchase_json := NULL;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Requests
  -- ---------------------------------------------------------------------------
  SELECT jsonb_build_object(
    'open', (
      SELECT COUNT(*)::integer
      FROM public.workspace_requests wr
      WHERE wr.status IN ('open', 'in_progress', 'waiting')
    ),
    'overdue', (
      SELECT COUNT(*)::integer
      FROM public.workspace_requests wr
      WHERE wr.status IN ('open', 'in_progress', 'waiting')
        AND wr.due_at IS NOT NULL
        AND wr.due_at < now()
    ),
    'by_status', (
      SELECT COALESCE(
        jsonb_object_agg(s.status, s.cnt),
        '{}'::jsonb
      )
      FROM (
        SELECT wr.status, COUNT(*)::integer AS cnt
        FROM public.workspace_requests wr
        GROUP BY wr.status
      ) s
    )
  )
  INTO requests_json;

  -- ---------------------------------------------------------------------------
  -- Lightweight operational counts
  -- ---------------------------------------------------------------------------
  SELECT jsonb_build_object(
    'customers', (
      CASE
        WHEN v_is_ops THEN (SELECT COUNT(*)::integer FROM public.customers)
        ELSE (
          SELECT COUNT(*)::integer
          FROM public.customers c
          WHERE c.owner_id = v_uid
        )
      END
    ),
    'new_inquiries', (
      SELECT COUNT(*)::integer FROM public.inquiries i WHERE i.status = 'new'
    ),
    'portal_users', (
      CASE
        WHEN v_is_ops THEN (SELECT COUNT(*)::integer FROM public.customer_profiles)
        ELSE NULL
      END
    )
  )
  INTO counts_json;

  RETURN jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'viewer', jsonb_build_object(
      'role', COALESCE(v_role, 'unknown'),
      'is_ops', v_is_ops,
      'is_sales', v_is_sales
    ),
    'sales', sales_json,
    'collections', collections_json,
    'stock', stock_json,
    'purchase', purchase_json,
    'requests', requests_json,
    'counts', counts_json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ops_analytics_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ops_analytics_summary(date, date) TO authenticated;

COMMENT ON FUNCTION public.get_ops_analytics_summary(date, date) IS
  'Phase 41: date-range ops analytics jsonb. Workspace-readable; sales get own-book sales/stock/requests only; ops get remittances + PO/GRN.';

-- Phase 3: server-side Today’s Work Queue.
-- The function is SECURITY INVOKER so existing RLS policies remain active.
-- Field agents see only requests assigned to themselves; workspace operations
-- users see the complete queue permitted by their table policies.

CREATE INDEX IF NOT EXISTS inquiries_queue_status_created_idx
  ON public.inquiries (status, created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_queue_due_idx
  ON public.invoices (due_date, status)
  WHERE balance_due > 0;

CREATE OR REPLACE FUNCTION public.get_today_work_queue(
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  RETURN (
    WITH request_rows AS (
      SELECT
        r.id,
        r.title,
        r.notes,
        r.status,
        r.assigned_to,
        r.due_at,
        r.updated_at,
        CASE
          WHEN r.due_at IS NOT NULL AND r.due_at < now() THEN 'overdue_request'
          WHEN r.due_at IS NOT NULL AND r.due_at::date = current_date THEN 'due_today_request'
          ELSE 'unassigned_request'
        END AS kind,
        CASE
          WHEN r.due_at IS NOT NULL AND r.due_at < now() THEN 'critical'
          WHEN r.due_at IS NOT NULL AND r.due_at::date = current_date THEN 'high'
          ELSE 'normal'
        END AS priority,
        CASE
          WHEN r.due_at IS NOT NULL AND r.due_at < now() THEN 0
          WHEN r.due_at IS NOT NULL AND r.due_at::date = current_date THEN 1
          ELSE 3
        END AS priority_rank,
        ('/admin/requests'::text) AS href
      FROM public.workspace_requests r
      WHERE r.status NOT IN ('done', 'cancelled')
        AND (NOT private.is_field_agent() OR r.assigned_to = (SELECT auth.uid()))
        AND (
          (r.due_at IS NOT NULL AND r.due_at < now())
          OR (r.due_at IS NOT NULL AND r.due_at::date = current_date)
          OR r.assigned_to IS NULL
        )
    ),
    inquiry_rows AS (
      SELECT
        q.id,
        q.customer_name,
        q.customer_email,
        q.message,
        q.status,
        q.created_at,
        q.updated_at
      FROM public.inquiries q
      WHERE q.status = 'new'
        AND NOT private.is_field_agent()
    ),
    invoice_rows AS (
      SELECT
        i.id,
        i.invoice_number,
        i.customer_name,
        i.customer_company,
        i.balance_due,
        i.currency,
        i.status,
        i.due_date,
        i.updated_at
      FROM public.invoices i
      WHERE i.due_date < current_date
        AND COALESCE(i.balance_due, 0) > 0
        AND i.status NOT IN ('cancelled', 'draft', 'paid')
        AND NOT private.is_field_agent()
    ),
    queue_items AS (
      SELECT
        r.kind,
        r.id AS record_id,
        r.title,
        concat_ws(' · ', NULLIF(r.status, ''), CASE WHEN r.assigned_to IS NULL THEN 'Unassigned' ELSE 'Assigned' END, NULLIF(r.notes, '')) AS subtitle,
        r.status,
        r.priority,
        r.priority_rank,
        r.due_at,
        r.href,
        r.updated_at
      FROM request_rows r

      UNION ALL

      SELECT
        'new_inquiry',
        q.id,
        COALESCE(NULLIF(q.customer_name, ''), 'Customer inquiry'),
        concat_ws(' · ', NULLIF(q.customer_email, ''), NULLIF(q.message, '')),
        q.status,
        'high',
        2,
        q.created_at,
        '/admin/inquiries',
        q.updated_at
      FROM inquiry_rows q

      UNION ALL

      SELECT
        'overdue_invoice',
        i.id,
        COALESCE(NULLIF(i.invoice_number, ''), 'Overdue invoice'),
        concat_ws(' · ', NULLIF(i.customer_company, ''), NULLIF(i.customer_name, ''), 'Balance ' || COALESCE(i.currency, '') || ' ' || to_char(i.balance_due, 'FM999999990.00')),
        'overdue',
        'critical',
        0,
        i.due_date::timestamptz,
        ('/admin/invoices/' || i.id::text),
        i.updated_at
      FROM invoice_rows i
    ),
    limited_items AS (
      SELECT *
      FROM queue_items
      ORDER BY priority_rank, due_at NULLS LAST, updated_at DESC NULLS LAST
      LIMIT v_limit
    )
    SELECT jsonb_build_object(
      'summary', jsonb_build_object(
        'overdue_requests', (SELECT count(*) FROM request_rows WHERE kind = 'overdue_request'),
        'due_today_requests', (SELECT count(*) FROM request_rows WHERE kind = 'due_today_request'),
        'unassigned_requests', (SELECT count(*) FROM request_rows WHERE assigned_to IS NULL),
        'new_inquiries', (SELECT count(*) FROM inquiry_rows),
        'overdue_invoices', (SELECT count(*) FROM invoice_rows),
        'total_items', (SELECT count(*) FROM queue_items)
      ),
      'items', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'kind', item.kind,
            'record_id', item.record_id,
            'title', item.title,
            'subtitle', item.subtitle,
            'status', item.status,
            'priority', item.priority,
            'due_at', item.due_at,
            'href', item.href
          )
          ORDER BY item.priority_rank, item.due_at NULLS LAST, item.updated_at DESC NULLS LAST
        ) FROM limited_items item),
        '[]'::jsonb
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_today_work_queue(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_today_work_queue(integer) TO authenticated;

COMMENT ON FUNCTION public.get_today_work_queue(integer) IS
  'Phase 3 Today’s Work Queue; RLS-preserving, field-agent scoped, capped at 50 actionable items.';

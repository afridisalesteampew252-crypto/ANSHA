-- Phase 4: customer and order lifecycle timeline.
-- ANSHA has no separate orders table; this read model unifies existing
-- customer-linked operational records without changing the commerce schema.

CREATE INDEX IF NOT EXISTS remittances_customer_created_idx
  ON public.remittances (customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoice_payments_created_invoice_idx
  ON public.invoice_payments (invoice_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_customer_lifecycle_timeline(
  p_customer_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  IF p_customer_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = p_customer_id
  ) THEN
    RAISE EXCEPTION 'Customer not found or access denied';
  END IF;

  RETURN (
    WITH lifecycle_events AS (
      SELECT
        'customer_created'::text AS event_type,
        c.id AS record_id,
        c.created_at AS occurred_at,
        'Customer account created'::text AS title,
        concat_ws(' · ', NULLIF(c.customer_code, ''), NULLIF(c.company_name, ''), NULLIF(c.country, '')) AS subtitle,
        'normal'::text AS status,
        '/admin/customers/' || c.id::text AS href
      FROM public.customers c
      WHERE c.id = p_customer_id

      UNION ALL

      SELECT
        CASE WHEN r.request_type = 'inquiry' THEN 'inquiry_request' ELSE 'workspace_request' END,
        r.id,
        r.created_at,
        r.title,
        concat_ws(' · ', initcap(replace(r.request_type, '_', ' ')), initcap(replace(r.status, '_', ' ')), CASE WHEN r.assigned_to IS NULL THEN 'Unassigned' ELSE 'Assigned' END),
        r.status,
        '/admin/requests'
      FROM public.workspace_requests r
      WHERE r.customer_id = p_customer_id

      UNION ALL

      SELECT
        CASE WHEN i.document_type = 'proforma_invoice' THEN 'reservation_proforma' ELSE 'invoice' END,
        i.id,
        COALESCE(i.created_at, i.issue_date::timestamptz),
        COALESCE(NULLIF(i.invoice_number, ''), 'Invoice'),
        concat_ws(' · ', initcap(replace(i.document_type, '_', ' ')), initcap(replace(i.status, '_', ' ')), i.currency || ' ' || to_char(i.total_amount, 'FM999999990.00'), CASE WHEN i.balance_due > 0 THEN 'Balance ' || i.currency || ' ' || to_char(i.balance_due, 'FM999999990.00') ELSE NULL END),
        i.status,
        '/admin/invoices/' || i.id::text
      FROM public.invoices i
      WHERE i.customer_id = p_customer_id

      UNION ALL

      SELECT
        'remittance',
        r.id,
        COALESCE(r.created_at, r.received_date::timestamptz),
        COALESCE(NULLIF(r.remittance_number, ''), 'Customer remittance'),
        concat_ws(' · ', initcap(replace(r.status, '_', ' ')), r.currency || ' ' || to_char(r.amount, 'FM999999990.00'), NULLIF(r.method, '')),
        r.status,
        '/admin/remittances'
      FROM public.remittances r
      WHERE r.customer_id = p_customer_id

      UNION ALL

      SELECT
        'invoice_payment',
        p.id,
        COALESCE(p.created_at, p.payment_date::timestamptz),
        COALESCE(NULLIF(i.invoice_number, ''), 'Invoice payment'),
        concat_ws(' · ', 'Payment recorded', p.method, to_char(p.amount, 'FM999999990.00'), NULLIF(p.reference, '')),
        'paid',
        '/admin/invoices/' || i.id::text
      FROM public.invoice_payments p
      JOIN public.invoices i ON i.id = p.invoice_id
      WHERE i.customer_id = p_customer_id
        AND NOT EXISTS (
          SELECT 1 FROM public.remittances r
          WHERE r.invoice_payment_id = p.id
            AND r.customer_id = p_customer_id
        )

      UNION ALL

      SELECT
        'payment_proof',
        proof.id,
        proof.created_at,
        'Customer payment proof',
        concat_ws(' · ', initcap(replace(proof.status, '_', ' ')), proof.currency || ' ' || to_char(proof.amount, 'FM999999990.00'), NULLIF(proof.file_name, '')),
        proof.status,
        '/admin/remittances'
      FROM public.customer_payment_proofs proof
      WHERE proof.customer_id = p_customer_id

      UNION ALL

      SELECT
        'active_reservation',
        v.id,
        v.updated_at,
        COALESCE(NULLIF(v.title, ''), 'Reserved vehicle'),
        concat_ws(' · ', 'Vehicle reservation', NULLIF(v.stock_number, ''), NULLIF(v.chassis_number, ''), initcap(replace(v.stock_status, '_', ' '))),
        v.stock_status,
        '/admin/vehicles/' || v.id::text
      FROM public.vehicles v
      WHERE v.reserved_customer_id = p_customer_id
        AND v.stock_status = 'reserved'

      UNION ALL

      SELECT
        'active_reservation',
        p.id,
        p.updated_at,
        COALESCE(NULLIF(p.name, ''), 'Reserved part'),
        concat_ws(' · ', 'Part reservation', NULLIF(p.part_code, ''), NULLIF(p.part_number, ''), initcap(replace(p.stock_status, '_', ' '))),
        p.stock_status,
        '/admin/parts/' || p.id::text
      FROM public.parts p
      WHERE p.reserved_customer_id = p_customer_id
        AND p.stock_status = 'reserved'
    ),
    limited_events AS (
      SELECT *
      FROM lifecycle_events
      ORDER BY occurred_at DESC NULLS LAST, record_id DESC
      LIMIT v_limit
    )
    SELECT jsonb_build_object(
      'summary', jsonb_build_object(
        'events', (SELECT count(*) FROM lifecycle_events),
        'invoices', (SELECT count(*) FROM lifecycle_events WHERE event_type IN ('invoice', 'reservation_proforma')),
        'payments', (SELECT count(*) FROM lifecycle_events WHERE event_type IN ('remittance', 'invoice_payment', 'payment_proof')),
        'requests', (SELECT count(*) FROM lifecycle_events WHERE event_type IN ('workspace_request', 'inquiry_request')),
        'active_reservations', (SELECT count(*) FROM lifecycle_events WHERE event_type = 'active_reservation')
      ),
      'events', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'event_type', event.event_type,
            'record_id', event.record_id,
            'occurred_at', event.occurred_at,
            'title', event.title,
            'subtitle', event.subtitle,
            'status', event.status,
            'href', event.href
          ) ORDER BY event.occurred_at DESC NULLS LAST, event.record_id DESC
        ) FROM limited_events event),
        '[]'::jsonb
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_lifecycle_timeline(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_lifecycle_timeline(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.get_customer_lifecycle_timeline(uuid, integer) IS
  'Phase 4 read-only customer lifecycle timeline over existing operations records; RLS-preserving and capped at 100 events.';

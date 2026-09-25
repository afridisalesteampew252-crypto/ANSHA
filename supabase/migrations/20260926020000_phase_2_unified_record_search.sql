-- Phase 2: unified, server-side workspace record search.
-- The function is SECURITY INVOKER so table RLS remains active, and it adds
-- an explicit workspace-user check before returning any operational metadata.

CREATE INDEX IF NOT EXISTS customers_unified_code_trgm_idx
  ON public.customers USING gin (lower(customer_code) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_unified_name_trgm_idx
  ON public.customers USING gin (lower(full_name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_unified_email_trgm_idx
  ON public.customers USING gin (lower(email) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS invoices_unified_number_trgm_idx
  ON public.invoices USING gin (lower(invoice_number) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS invoices_unified_customer_trgm_idx
  ON public.invoices USING gin (lower(customer_name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS invoices_unified_reference_trgm_idx
  ON public.invoices USING gin (lower(reference) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS inquiries_unified_name_trgm_idx
  ON public.inquiries USING gin (lower(customer_name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS inquiries_unified_email_trgm_idx
  ON public.inquiries USING gin (lower(customer_email) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS workspace_requests_unified_title_trgm_idx
  ON public.workspace_requests USING gin (lower(title) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS workspace_requests_unified_notes_trgm_idx
  ON public.workspace_requests USING gin (lower(notes) extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_workspace_records(
  p_query text,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  record_type text,
  record_id uuid,
  title text,
  subtitle text,
  status text,
  href text,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50);
  v_pattern text;
BEGIN
  IF NOT private.is_workspace_user() THEN
    RAISE EXCEPTION 'Workspace access required';
  END IF;

  IF v_query IS NULL OR char_length(v_query) < 2 THEN
    RETURN;
  END IF;

  IF char_length(v_query) > 80 THEN
    RAISE EXCEPTION 'Search query is too long';
  END IF;

  v_pattern := '%' || v_query || '%';

  RETURN QUERY
  WITH candidates AS (
    SELECT
      'customer'::text AS record_type,
      c.id AS record_id,
      COALESCE(NULLIF(c.full_name, ''), NULLIF(c.company_name, ''), c.customer_code, 'Customer') AS title,
      concat_ws(' · ', NULLIF(c.customer_code, ''), NULLIF(c.company_name, ''), NULLIF(c.email, ''), NULLIF(c.phone, '')) AS subtitle,
      CASE WHEN c.is_active THEN 'active' ELSE 'inactive' END::text AS status,
      ('/admin/customers/' || c.id::text)::text AS href,
      c.updated_at,
      CASE
        WHEN lower(COALESCE(c.customer_code, '')) = lower(v_query) THEN 0
        WHEN lower(COALESCE(c.full_name, '')) LIKE lower(v_query) || '%' THEN 1
        ELSE 2
      END AS rank_order
    FROM public.customers c
    WHERE lower(c.customer_code) LIKE lower(v_pattern)
       OR lower(c.full_name) LIKE lower(v_pattern)
       OR lower(c.company_name) LIKE lower(v_pattern)
       OR lower(c.email) LIKE lower(v_pattern)
       OR lower(c.phone) LIKE lower(v_pattern)
       OR lower(c.whatsapp) LIKE lower(v_pattern)

    UNION ALL

    SELECT
      'vehicle'::text,
      v.id,
      COALESCE(NULLIF(v.title, ''), NULLIF(concat_ws(' ', v.make, v.model, v.year::text), ''), 'Vehicle'),
      concat_ws(' · ', NULLIF(v.stock_number, ''), NULLIF(v.chassis_number, ''), NULLIF(v.make, ''), NULLIF(v.model, ''), NULLIF(v.location, '')),
      v.stock_status,
      ('/admin/vehicles/' || v.id::text)::text,
      v.updated_at,
      CASE
        WHEN lower(COALESCE(v.stock_number, '')) = lower(v_query) THEN 0
        WHEN lower(COALESCE(v.title, '')) LIKE lower(v_query) || '%' THEN 1
        ELSE 2
      END
    FROM public.vehicles v
    WHERE lower(v.title) LIKE lower(v_pattern)
       OR lower(v.make) LIKE lower(v_pattern)
       OR lower(v.model) LIKE lower(v_pattern)
       OR lower(v.stock_number) LIKE lower(v_pattern)
       OR lower(v.chassis_number) LIKE lower(v_pattern)
       OR lower(v.chassis_code) LIKE lower(v_pattern)
       OR lower(v.location) LIKE lower(v_pattern)
       OR lower(v.stock_status) LIKE lower(v_pattern)

    UNION ALL

    SELECT
      'part'::text,
      p.id,
      COALESCE(NULLIF(p.name, ''), NULLIF(p.part_code, ''), 'Part'),
      concat_ws(' · ', NULLIF(p.part_code, ''), NULLIF(p.oem_number, ''), NULLIF(p.part_number, ''), NULLIF(p.brand, ''), NULLIF(p.location, '')),
      p.stock_status,
      ('/admin/parts/' || p.id::text)::text,
      p.updated_at,
      CASE
        WHEN lower(COALESCE(p.part_code, '')) = lower(v_query) THEN 0
        WHEN lower(COALESCE(p.name, '')) LIKE lower(v_query) || '%' THEN 1
        ELSE 2
      END
    FROM public.parts p
    WHERE lower(p.name) LIKE lower(v_pattern)
       OR lower(p.part_code) LIKE lower(v_pattern)
       OR lower(p.oem_number) LIKE lower(v_pattern)
       OR lower(p.part_number) LIKE lower(v_pattern)
       OR lower(p.brand) LIKE lower(v_pattern)
       OR lower(p.location) LIKE lower(v_pattern)
       OR lower(p.stock_status) LIKE lower(v_pattern)

    UNION ALL

    SELECT
      'invoice'::text,
      i.id,
      COALESCE(NULLIF(i.invoice_number, ''), 'Invoice'),
      concat_ws(' · ', NULLIF(i.customer_name, ''), NULLIF(i.customer_company, ''), NULLIF(i.reference, ''), NULLIF(i.customer_email, '')),
      i.status,
      ('/admin/invoices/' || i.id::text)::text,
      i.updated_at,
      CASE
        WHEN lower(COALESCE(i.invoice_number, '')) = lower(v_query) THEN 0
        WHEN lower(COALESCE(i.invoice_number, '')) LIKE lower(v_query) || '%' THEN 1
        ELSE 2
      END
    FROM public.invoices i
    WHERE lower(i.invoice_number) LIKE lower(v_pattern)
       OR lower(i.customer_name) LIKE lower(v_pattern)
       OR lower(i.customer_company) LIKE lower(v_pattern)
       OR lower(i.customer_email) LIKE lower(v_pattern)
       OR lower(i.customer_phone) LIKE lower(v_pattern)
       OR lower(i.reference) LIKE lower(v_pattern)
       OR lower(i.status) LIKE lower(v_pattern)

    UNION ALL

    SELECT
      'inquiry'::text,
      q.id,
      COALESCE(NULLIF(q.customer_name, ''), 'Customer inquiry'),
      concat_ws(' · ', NULLIF(q.customer_email, ''), NULLIF(q.customer_phone, ''), NULLIF(q.message, '')),
      q.status,
      '/admin/inquiries'::text,
      q.updated_at,
      CASE
        WHEN lower(COALESCE(q.customer_email, '')) = lower(v_query) THEN 0
        WHEN lower(COALESCE(q.customer_name, '')) LIKE lower(v_query) || '%' THEN 1
        ELSE 2
      END
    FROM public.inquiries q
    WHERE lower(q.customer_name) LIKE lower(v_pattern)
       OR lower(q.customer_email) LIKE lower(v_pattern)
       OR lower(q.customer_phone) LIKE lower(v_pattern)
       OR lower(q.message) LIKE lower(v_pattern)
       OR lower(q.status) LIKE lower(v_pattern)

    UNION ALL

    SELECT
      'request'::text,
      r.id,
      COALESCE(NULLIF(r.title, ''), NULLIF(r.request_type, ''), 'Workspace request'),
      concat_ws(' · ', NULLIF(r.request_type, ''), NULLIF(r.status, ''), NULLIF(r.notes, '')),
      r.status,
      '/admin/requests'::text,
      r.updated_at,
      CASE
        WHEN lower(COALESCE(r.title, '')) LIKE lower(v_query) || '%' THEN 1
        ELSE 2
      END
    FROM public.workspace_requests r
    WHERE lower(r.request_type) LIKE lower(v_pattern)
       OR lower(r.title) LIKE lower(v_pattern)
       OR lower(r.notes) LIKE lower(v_pattern)
       OR lower(r.status) LIKE lower(v_pattern)
  )
  SELECT c.record_type, c.record_id, c.title, c.subtitle, c.status, c.href, c.updated_at
  FROM candidates c
  ORDER BY c.rank_order, c.updated_at DESC NULLS LAST
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_workspace_records(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_workspace_records(text, integer) TO authenticated;

COMMENT ON FUNCTION public.search_workspace_records(text, integer) IS
  'Phase 2 unified admin search; workspace-user-only, RLS-preserving, normalized metadata, capped at 50 results.';

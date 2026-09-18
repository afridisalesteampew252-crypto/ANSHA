/* Phase 27: read-only customer portal SOA (sanitized remittances + statement). */

CREATE OR REPLACE FUNCTION public.get_my_customer_soa()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cid uuid;
  summary jsonb;
  invoice_rows jsonb;
  remittance_rows jsonb;
  allocation_rows jsonb;
  currency text := 'AED';
  total_invoiced numeric := 0;
  total_allocated numeric := 0;
  outstanding numeric := 0;
  available_funds numeric := 0;
BEGIN
  cid := private.my_customer_id();
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Not a customer portal user'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    (
      SELECT inv.currency
      FROM public.invoices inv
      WHERE inv.customer_id = cid
        AND inv.status IS DISTINCT FROM 'draft'
        AND inv.status IS DISTINCT FROM 'cancelled'
        AND inv.document_type IN ('tax_invoice', 'commercial_invoice')
      ORDER BY inv.issue_date DESC
      LIMIT 1
    ),
    (
      SELECT rem.currency
      FROM public.remittances rem
      WHERE rem.customer_id = cid
        AND rem.status = 'confirmed'
      ORDER BY rem.received_date DESC
      LIMIT 1
    ),
    'AED'
  )
  INTO currency;

  SELECT
    COALESCE(sum(inv.total_amount), 0),
    COALESCE(sum(inv.balance_due), 0)
  INTO total_invoiced, outstanding
  FROM public.invoices inv
  WHERE inv.customer_id = cid
    AND inv.status IS DISTINCT FROM 'draft'
    AND inv.status IS DISTINCT FROM 'cancelled'
    AND inv.document_type IN ('tax_invoice', 'commercial_invoice');

  SELECT COALESCE(sum(alloc.amount), 0)
  INTO total_allocated
  FROM public.remittance_allocations alloc
  INNER JOIN public.remittances rem ON rem.id = alloc.remittance_id
  WHERE rem.customer_id = cid
    AND rem.status = 'confirmed';

  SELECT COALESCE(sum(GREATEST(rem.amount - COALESCE(used.total, 0), 0)), 0)
  INTO available_funds
  FROM public.remittances rem
  LEFT JOIN LATERAL (
    SELECT sum(alloc.amount) AS total
    FROM public.remittance_allocations alloc
    WHERE alloc.remittance_id = rem.id
  ) used ON true
  WHERE rem.customer_id = cid
    AND rem.status = 'confirmed';

  summary := jsonb_build_object(
    'currency', currency,
    'total_invoiced', total_invoiced,
    'total_allocated', total_allocated,
    'outstanding', outstanding,
    'available_funds', available_funds
  );

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.issue_date DESC, x.invoice_number DESC), '[]'::jsonb)
  INTO invoice_rows
  FROM (
    SELECT
      inv.id,
      inv.invoice_number,
      inv.document_type,
      inv.issue_date,
      inv.due_date,
      inv.currency,
      inv.status,
      inv.total_amount,
      inv.amount_paid,
      inv.balance_due
    FROM public.invoices inv
    WHERE inv.customer_id = cid
      AND inv.status IS DISTINCT FROM 'draft'
      AND inv.status IS DISTINCT FROM 'cancelled'
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.received_date DESC, x.remittance_number DESC), '[]'::jsonb)
  INTO remittance_rows
  FROM (
    SELECT
      rem.id,
      rem.remittance_number,
      rem.received_date,
      rem.amount,
      rem.currency,
      rem.method,
      rem.bank_reference,
      COALESCE(used.total, 0) AS allocated_amount,
      GREATEST(rem.amount - COALESCE(used.total, 0), 0) AS available_amount
    FROM public.remittances rem
    LEFT JOIN LATERAL (
      SELECT sum(alloc.amount) AS total
      FROM public.remittance_allocations alloc
      WHERE alloc.remittance_id = rem.id
    ) used ON true
    WHERE rem.customer_id = cid
      AND rem.status = 'confirmed'
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO allocation_rows
  FROM (
    SELECT
      alloc.id,
      alloc.remittance_id,
      rem.remittance_number,
      alloc.invoice_id,
      inv.invoice_number,
      alloc.amount,
      rem.currency,
      alloc.created_at
    FROM public.remittance_allocations alloc
    INNER JOIN public.remittances rem ON rem.id = alloc.remittance_id
    INNER JOIN public.invoices inv ON inv.id = alloc.invoice_id
    WHERE rem.customer_id = cid
      AND rem.status = 'confirmed'
      AND inv.status IS DISTINCT FROM 'draft'
      AND inv.status IS DISTINCT FROM 'cancelled'
  ) x;

  RETURN jsonb_build_object(
    'summary', summary,
    'invoices', invoice_rows,
    'remittances', remittance_rows,
    'allocations', allocation_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_customer_soa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_soa() TO authenticated;

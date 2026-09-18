/* Phase 36: UAE-oriented VAT return pack (reporting-first).

Assumptions (also returned in get_vat_return_summary.assumptions):
  - Standard rate default 5% (UAE).
  - Output VAT: customer invoices with document_type IN
    ('tax_invoice', 'commercial_invoice'), status NOT IN ('draft','cancelled'),
    issue_date within [p_from, p_to]. Uses invoices.tax_amount and
    taxable = GREATEST(subtotal - discount_amount, 0).
  - Input VAT (customer module): document_type = 'purchase_invoice' with the
    same status/date rules (tax booked on the invoices table).
  - Input VAT (supplier side): supplier_invoices.invoice_date in range.
    total_amount treated as VAT-inclusive (gross). Rate from linked
    purchase_orders.vat_rate when present, else 5%.
    vat = round(total * rate / (100 + rate), 2).
  - Excluded from both boxes: delivery_note, quotation, proforma_invoice.
  - No FX conversion — KPIs and lines are grouped by currency.
  - No invented GL postings; this is a management/VAT pack report.

Do NOT create private.is_workspace_user() zero-arg overload — keep the single
canonical signature private.is_workspace_user(check_user_id uuid DEFAULT auth.uid()).
*/

-- ---------------------------------------------------------------------------
-- Optional saved period snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vat_return_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_from date NOT NULL,
  period_to date NOT NULL,
  label text CHECK (label IS NULL OR char_length(label) <= 200),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
  currency_focus text NOT NULL DEFAULT 'AED' CHECK (char_length(currency_focus) = 3),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vat_return_periods_range_chk CHECK (period_to >= period_from)
);

CREATE INDEX IF NOT EXISTS vat_return_periods_range_idx
  ON public.vat_return_periods (period_from DESC, period_to DESC);
CREATE INDEX IF NOT EXISTS vat_return_periods_created_at_idx
  ON public.vat_return_periods (created_at DESC);

ALTER TABLE public.vat_return_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_select_vat_return_periods ON public.vat_return_periods;
CREATE POLICY ops_select_vat_return_periods
  ON public.vat_return_periods FOR SELECT TO authenticated
  USING ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS ops_insert_vat_return_periods ON public.vat_return_periods;
CREATE POLICY ops_insert_vat_return_periods
  ON public.vat_return_periods FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_ops_user())
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS ops_delete_vat_return_periods ON public.vat_return_periods;
CREATE POLICY ops_delete_vat_return_periods
  ON public.vat_return_periods FOR DELETE TO authenticated
  USING ((SELECT private.is_ops_user()));

REVOKE ALL ON public.vat_return_periods FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.vat_return_periods TO authenticated;

COMMENT ON TABLE public.vat_return_periods IS
  'Phase 36: optional saved VAT return pack snapshots for a date range (ops-only).';

-- ---------------------------------------------------------------------------
-- Summary RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vat_return_summary(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  default_rate numeric := 5;
  output_types text[] := ARRAY['tax_invoice', 'commercial_invoice'];
  input_customer_types text[] := ARRAY['purchase_invoice'];
  by_currency jsonb;
  output_lines jsonb;
  input_lines jsonb;
  assumptions jsonb;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required'
      USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'p_from and p_to are required';
  END IF;

  IF p_to < p_from THEN
    RAISE EXCEPTION 'p_to must be on or after p_from';
  END IF;

  assumptions := jsonb_build_object(
    'default_vat_rate', default_rate,
    'output_document_types', to_jsonb(output_types),
    'input_customer_document_types', to_jsonb(input_customer_types),
    'supplier_vat_basis', 'gross_inclusive',
    'supplier_rate_source', 'linked_po_vat_rate_or_default_5',
    'excluded_statuses', jsonb_build_array('draft', 'cancelled'),
    'excluded_document_types', jsonb_build_array('delivery_note', 'quotation', 'proforma_invoice'),
    'fx', 'none_per_currency_only',
    'gl_postings', false
  );

  -- Output lines (sales tax invoices)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'source', 'customer_invoice',
        'side', 'output',
        'id', x.id,
        'reference', x.invoice_number,
        'document_type', x.document_type,
        'party', COALESCE(x.customer_company, x.customer_name),
        'trn', x.customer_tax_registration_number,
        'doc_date', x.issue_date,
        'currency', x.currency,
        'taxable_amount', x.taxable_amount,
        'vat_amount', x.vat_amount,
        'gross_amount', x.gross_amount,
        'vat_rate', x.effective_rate,
        'status', x.status
      )
      ORDER BY x.issue_date, x.invoice_number
    ),
    '[]'::jsonb
  )
  INTO output_lines
  FROM (
    SELECT
      inv.id,
      inv.invoice_number,
      inv.document_type,
      inv.customer_name,
      inv.customer_company,
      inv.customer_tax_registration_number,
      inv.issue_date,
      inv.currency,
      inv.status,
      ROUND(GREATEST(COALESCE(inv.subtotal, 0) - COALESCE(inv.discount_amount, 0), 0), 2) AS taxable_amount,
      ROUND(COALESCE(inv.tax_amount, 0), 2) AS vat_amount,
      ROUND(COALESCE(inv.total_amount, 0), 2) AS gross_amount,
      CASE
        WHEN GREATEST(COALESCE(inv.subtotal, 0) - COALESCE(inv.discount_amount, 0), 0) > 0
          THEN ROUND(
            (COALESCE(inv.tax_amount, 0) * 100)
              / GREATEST(COALESCE(inv.subtotal, 0) - COALESCE(inv.discount_amount, 0), 0),
            4
          )
        ELSE default_rate
      END AS effective_rate
    FROM public.invoices inv
    WHERE inv.issue_date BETWEEN p_from AND p_to
      AND inv.document_type = ANY (output_types)
      AND inv.status IS DISTINCT FROM 'draft'
      AND inv.status IS DISTINCT FROM 'cancelled'
  ) x;

  -- Input lines: purchase_invoice docs + supplier invoices
  SELECT COALESCE(
    jsonb_agg(line ORDER BY line->>'doc_date', line->>'reference'),
    '[]'::jsonb
  )
  INTO input_lines
  FROM (
    SELECT jsonb_build_object(
      'source', 'customer_purchase_invoice',
      'side', 'input',
      'id', inv.id,
      'reference', inv.invoice_number,
      'document_type', inv.document_type,
      'party', COALESCE(inv.customer_company, inv.customer_name),
      'trn', inv.customer_tax_registration_number,
      'doc_date', inv.issue_date,
      'currency', inv.currency,
      'taxable_amount', ROUND(GREATEST(COALESCE(inv.subtotal, 0) - COALESCE(inv.discount_amount, 0), 0), 2),
      'vat_amount', ROUND(COALESCE(inv.tax_amount, 0), 2),
      'gross_amount', ROUND(COALESCE(inv.total_amount, 0), 2),
      'vat_rate', CASE
        WHEN GREATEST(COALESCE(inv.subtotal, 0) - COALESCE(inv.discount_amount, 0), 0) > 0
          THEN ROUND(
            (COALESCE(inv.tax_amount, 0) * 100)
              / GREATEST(COALESCE(inv.subtotal, 0) - COALESCE(inv.discount_amount, 0), 0),
            4
          )
        ELSE default_rate
      END,
      'status', inv.status,
      'purchase_order_id', NULL
    ) AS line
    FROM public.invoices inv
    WHERE inv.issue_date BETWEEN p_from AND p_to
      AND inv.document_type = ANY (input_customer_types)
      AND inv.status IS DISTINCT FROM 'draft'
      AND inv.status IS DISTINCT FROM 'cancelled'

    UNION ALL

    SELECT jsonb_build_object(
      'source', 'supplier_invoice',
      'side', 'input',
      'id', si.id,
      'reference', COALESCE(si.invoice_number, si.file_name),
      'document_type', 'supplier_invoice',
      'party', si.supplier_name,
      'trn', NULL,
      'doc_date', si.invoice_date,
      'currency', si.currency,
      'taxable_amount', ROUND(
        COALESCE(si.total_amount, 0)
          - ROUND(
              COALESCE(si.total_amount, 0)
                * COALESCE(po.vat_rate, default_rate)
                / (100 + COALESCE(po.vat_rate, default_rate)),
              2
            ),
        2
      ),
      'vat_amount', ROUND(
        COALESCE(si.total_amount, 0)
          * COALESCE(po.vat_rate, default_rate)
          / (100 + COALESCE(po.vat_rate, default_rate)),
        2
      ),
      'gross_amount', ROUND(COALESCE(si.total_amount, 0), 2),
      'vat_rate', COALESCE(po.vat_rate, default_rate),
      'status', NULL,
      'purchase_order_id', si.purchase_order_id
    ) AS line
    FROM public.supplier_invoices si
    LEFT JOIN public.purchase_orders po ON po.id = si.purchase_order_id
    WHERE si.invoice_date BETWEEN p_from AND p_to
  ) u;

  -- Per-currency rollup
  SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb ORDER BY c.currency), '[]'::jsonb)
  INTO by_currency
  FROM (
    SELECT
      currency,
      ROUND(SUM(CASE WHEN side = 'output' THEN taxable_amount ELSE 0 END), 2) AS output_taxable,
      ROUND(SUM(CASE WHEN side = 'output' THEN vat_amount ELSE 0 END), 2) AS output_vat,
      ROUND(SUM(CASE WHEN side = 'input' THEN taxable_amount ELSE 0 END), 2) AS input_taxable,
      ROUND(SUM(CASE WHEN side = 'input' THEN vat_amount ELSE 0 END), 2) AS input_vat,
      ROUND(
        SUM(CASE WHEN side = 'output' THEN vat_amount ELSE 0 END)
          - SUM(CASE WHEN side = 'input' THEN vat_amount ELSE 0 END),
        2
      ) AS net_payable,
      COUNT(*) FILTER (WHERE side = 'output')::integer AS output_line_count,
      COUNT(*) FILTER (WHERE side = 'input')::integer AS input_line_count
    FROM (
      SELECT
        (line->>'currency') AS currency,
        (line->>'side') AS side,
        COALESCE((line->>'taxable_amount')::numeric, 0) AS taxable_amount,
        COALESCE((line->>'vat_amount')::numeric, 0) AS vat_amount
      FROM jsonb_array_elements(output_lines || input_lines) AS line
    ) flat
    GROUP BY currency
  ) c;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'assumptions', assumptions,
    'by_currency', by_currency,
    'kpis', COALESCE(
      (
        SELECT jsonb_build_object(
          'currency', 'AED',
          'output_taxable', COALESCE((SELECT (x->>'output_taxable')::numeric FROM jsonb_array_elements(by_currency) x WHERE x->>'currency' = 'AED' LIMIT 1), 0),
          'output_vat', COALESCE((SELECT (x->>'output_vat')::numeric FROM jsonb_array_elements(by_currency) x WHERE x->>'currency' = 'AED' LIMIT 1), 0),
          'input_taxable', COALESCE((SELECT (x->>'input_taxable')::numeric FROM jsonb_array_elements(by_currency) x WHERE x->>'currency' = 'AED' LIMIT 1), 0),
          'input_vat', COALESCE((SELECT (x->>'input_vat')::numeric FROM jsonb_array_elements(by_currency) x WHERE x->>'currency' = 'AED' LIMIT 1), 0),
          'net_payable', COALESCE((SELECT (x->>'net_payable')::numeric FROM jsonb_array_elements(by_currency) x WHERE x->>'currency' = 'AED' LIMIT 1), 0),
          'output_line_count', COALESCE((SELECT (x->>'output_line_count')::integer FROM jsonb_array_elements(by_currency) x WHERE x->>'currency' = 'AED' LIMIT 1), 0),
          'input_line_count', COALESCE((SELECT (x->>'input_line_count')::integer FROM jsonb_array_elements(by_currency) x WHERE x->>'currency' = 'AED' LIMIT 1), 0)
        )
      ),
      jsonb_build_object(
        'currency', 'AED',
        'output_taxable', 0,
        'output_vat', 0,
        'input_taxable', 0,
        'input_vat', 0,
        'net_payable', 0,
        'output_line_count', 0,
        'input_line_count', 0
      )
    ),
    'output_lines', output_lines,
    'input_lines', input_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_vat_return_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vat_return_summary(date, date) TO authenticated;

COMMENT ON FUNCTION public.get_vat_return_summary(date, date) IS
  'Phase 36: ops VAT return pack summary (output/input/net) for a date range.';

-- ---------------------------------------------------------------------------
-- Save snapshot RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_vat_return_period(
  p_from date,
  p_to date,
  p_label text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_currency_focus text DEFAULT 'AED'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  snap jsonb;
  row_id uuid;
  focus text;
BEGIN
  IF NOT private.is_ops_user() THEN
    RAISE EXCEPTION 'Ops access required'
      USING ERRCODE = '42501';
  END IF;

  focus := upper(COALESCE(NULLIF(btrim(p_currency_focus), ''), 'AED'));
  IF char_length(focus) <> 3 THEN
    RAISE EXCEPTION 'currency_focus must be a 3-letter code';
  END IF;

  snap := public.get_vat_return_summary(p_from, p_to);

  INSERT INTO public.vat_return_periods (
    period_from, period_to, label, notes, currency_focus, snapshot, created_by
  )
  VALUES (
    p_from,
    p_to,
    NULLIF(btrim(p_label), ''),
    NULLIF(btrim(p_notes), ''),
    focus,
    snap,
    auth.uid()
  )
  RETURNING id INTO row_id;

  RETURN jsonb_build_object(
    'id', row_id,
    'period_from', p_from,
    'period_to', p_to,
    'snapshot', snap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_vat_return_period(date, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_vat_return_period(date, date, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.save_vat_return_period(date, date, text, text, text) IS
  'Phase 36: persist a VAT return pack snapshot for the given period (ops-only).';

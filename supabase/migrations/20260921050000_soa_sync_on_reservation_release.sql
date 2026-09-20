-- SOA sync with reservations:
-- When reserved stock becomes available (release RPC, stock dropdown, invoice restore),
-- cancel unpaid open reservation proformas so customer Buying / statement no longer
-- show that hold. Portal SOA also returns active reserved buying lines.

-- ---------------------------------------------------------------------------
-- 1) Cancel open unpaid reservation proformas for a stock unit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.clear_reservation_buying_documents(
  p_vehicle_id uuid DEFAULT NULL,
  p_part_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cleared integer := 0;
BEGIN
  IF p_vehicle_id IS NULL AND p_part_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Allow field-agent invoice trigger to accept system cancel during release.
  PERFORM set_config('ansha.clearing_reservation_soa', '1', true);

  WITH targets AS (
    SELECT DISTINCT i.id
    FROM public.invoices i
    INNER JOIN public.invoice_items ii ON ii.invoice_id = i.id
    WHERE i.document_type = 'proforma_invoice'
      AND i.status IS DISTINCT FROM 'cancelled'
      AND COALESCE(i.amount_paid, 0) = 0
      AND (
        (p_vehicle_id IS NOT NULL AND ii.vehicle_id = p_vehicle_id)
        OR (p_part_id IS NOT NULL AND ii.part_id = p_part_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.remittance_allocations ra WHERE ra.invoice_id = i.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.invoice_payments ip WHERE ip.invoice_id = i.id
      )
  ),
  updated AS (
    UPDATE public.invoices inv
    SET status = 'cancelled',
        updated_at = now()
    FROM targets t
    WHERE inv.id = t.id
    RETURNING inv.id
  )
  SELECT COUNT(*)::integer INTO cleared FROM updated;

  PERFORM set_config('ansha.clearing_reservation_soa', '', true);
  RETURN COALESCE(cleared, 0);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('ansha.clearing_reservation_soa', '', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION private.clear_reservation_buying_documents(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION private.clear_reservation_buying_documents(uuid, uuid) IS
  'Cancel unpaid open proforma invoices linked to a vehicle/part so SOA Buying clears when stock returns to available.';

-- Field agents normally cannot change invoice status; reservation release must cancel
-- unpaid proformas so SOA Buying clears. Gated by ansha.clearing_reservation_soa.
CREATE OR REPLACE FUNCTION private.enforce_invoice_field_agent_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT private.is_field_agent()) THEN
    RETURN NEW;
  END IF;

  IF NULLIF(current_setting('ansha.clearing_reservation_soa', true), '') = '1'
     AND TG_OP = 'UPDATE'
     AND NEW.document_type = 'proforma_invoice'
     AND NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.document_type IS DISTINCT FROM 'proforma_invoice' THEN
      RAISE EXCEPTION 'Field agents may only create proforma invoices';
    END IF;
    IF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Field agents may only create draft proforma invoices';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.document_type IS DISTINCT FROM 'proforma_invoice' OR OLD.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Field agents may only edit their draft proforma invoices';
  END IF;
  IF NEW.document_type IS DISTINCT FROM 'proforma_invoice' THEN
    RAISE EXCEPTION 'Field agents cannot change document type away from proforma';
  END IF;
  IF NEW.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Field agents cannot change invoice status; accounts must approve / mark sent';
  END IF;
  IF OLD.created_by IS DISTINCT FROM (SELECT auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM public.customers c
       WHERE c.id = OLD.customer_id AND c.owner_id = (SELECT auth.uid())
     )
  THEN
    RAISE EXCEPTION 'Field agents may only edit their own-book proforma invoices';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_invoice_field_agent_limits()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Hook: any path that marks stock available clears reservation SOA buying
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sync_catalog_sold_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.stock_status = 'sold' AND OLD.stock_status IS DISTINCT FROM 'sold' THEN
    NEW.sold_at := now();
    NEW.sold_by := (SELECT auth.uid());
  ELSIF NEW.stock_status <> 'sold' THEN
    NEW.sold_at := NULL;
    NEW.sold_by := NULL;
  END IF;

  -- Any path that marks stock available must drop reservation metadata
  -- (release RPCs, stock dropdown, invoice restore, etc.).
  IF NEW.stock_status = 'available' AND OLD.stock_status IS DISTINCT FROM 'available' THEN
    IF TG_TABLE_NAME = 'vehicles' THEN
      PERFORM private.clear_reservation_buying_documents(NEW.id, NULL);
    ELSIF TG_TABLE_NAME = 'parts' THEN
      PERFORM private.clear_reservation_buying_documents(NULL, NEW.id);
    END IF;

    NEW.reserved_customer_id := NULL;
    NEW.reserved_by := NULL;
    NEW.reservation_price_term := NULL;
    NEW.reservation_shipment_term := NULL;
    NEW.reservation_inspection_required := NULL;
    NEW.reservation_vat_applicable := NULL;
    NEW.reservation_etd := NULL;
    NEW.reservation_eta := NULL;
    NEW.reservation_requester_name := NULL;
    NEW.reservation_requester_role := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_catalog_sold_state() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Portal SOA: include active reserved buying + open (non-cancelled) docs
-- ---------------------------------------------------------------------------
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
  buying_rows jsonb;
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

  -- Active reserved stock + open invoice lines (released stock cancels unpaid proformas).
  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_rank, x.updated_at DESC), '[]'::jsonb)
  INTO buying_rows
  FROM (
    SELECT
      ('vehicle:' || v.id::text) AS id,
      'reservation'::text AS source,
      'vehicle'::text AS inventory_type,
      v.id AS vehicle_id,
      NULL::uuid AS part_id,
      v.title AS description,
      COALESCE(NULLIF(btrim(v.stock_number), ''), NULLIF(btrim(v.chassis_number), ''), left(v.id::text, 8)) AS inventory_reference,
      1::numeric AS quantity,
      COALESCE(
        CASE v.reservation_price_term
          WHEN 'fob' THEN v.price_fob
          WHEN 'cf' THEN v.price_cf
          WHEN 'cif' THEN v.price_cif
          ELSE NULL
        END,
        v.price,
        0
      ) AS line_total,
      COALESCE(v.currency, currency) AS currency,
      v.stock_status,
      NULL::uuid AS invoice_id,
      NULL::text AS invoice_number,
      v.updated_at,
      0 AS sort_rank
    FROM public.vehicles v
    WHERE v.reserved_customer_id = cid
      AND v.stock_status = 'reserved'

    UNION ALL

    SELECT
      ('part:' || p.id::text) AS id,
      'reservation'::text AS source,
      'part'::text AS inventory_type,
      NULL::uuid AS vehicle_id,
      p.id AS part_id,
      p.name AS description,
      COALESCE(NULLIF(btrim(p.part_code), ''), NULLIF(btrim(p.part_number), ''), left(p.id::text, 8)) AS inventory_reference,
      1::numeric AS quantity,
      COALESCE(
        CASE p.reservation_price_term
          WHEN 'fob' THEN p.price_fob
          WHEN 'cf' THEN p.price_cf
          WHEN 'cif' THEN p.price_cif
          ELSE NULL
        END,
        p.price,
        0
      ) AS line_total,
      COALESCE(p.currency, currency) AS currency,
      p.stock_status,
      NULL::uuid AS invoice_id,
      NULL::text AS invoice_number,
      p.updated_at,
      0 AS sort_rank
    FROM public.parts p
    WHERE p.reserved_customer_id = cid
      AND p.stock_status = 'reserved'

    UNION ALL

    SELECT
      ('item:' || ii.id::text) AS id,
      'invoice'::text AS source,
      COALESCE(ii.inventory_type, 'other') AS inventory_type,
      ii.vehicle_id,
      ii.part_id,
      ii.description,
      ii.inventory_reference,
      ii.quantity,
      ii.line_total,
      inv.currency,
      inv.status AS stock_status,
      inv.id AS invoice_id,
      inv.invoice_number,
      inv.updated_at,
      1 AS sort_rank
    FROM public.invoice_items ii
    INNER JOIN public.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.customer_id = cid
      AND inv.status IS DISTINCT FROM 'cancelled'
      AND (
        inv.document_type IN ('tax_invoice', 'commercial_invoice', 'proforma_invoice')
        OR inv.status IS DISTINCT FROM 'draft'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id = ii.vehicle_id
          AND v.reserved_customer_id = cid
          AND v.stock_status = 'reserved'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.parts p
        WHERE p.id = ii.part_id
          AND p.reserved_customer_id = cid
          AND p.stock_status = 'reserved'
      )
  ) x;

  RETURN jsonb_build_object(
    'summary', summary,
    'invoices', invoice_rows,
    'remittances', remittance_rows,
    'allocations', allocation_rows,
    'buying', buying_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_customer_soa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_soa() TO authenticated;

COMMENT ON FUNCTION public.get_my_customer_soa() IS
  'Portal SOA: invoices/remittances plus active reserved buying; released reservations clear via cancelled proformas.';

-- ---------------------------------------------------------------------------
-- 4) One-shot: cancel unpaid proformas still linked to available stock
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('ansha.clearing_reservation_soa', '1', true);

  UPDATE public.invoices inv
  SET status = 'cancelled',
      updated_at = now()
  WHERE inv.id IN (
    SELECT DISTINCT i.id
    FROM public.invoices i
    INNER JOIN public.invoice_items ii ON ii.invoice_id = i.id
    WHERE i.document_type = 'proforma_invoice'
      AND i.status IS DISTINCT FROM 'cancelled'
      AND COALESCE(i.amount_paid, 0) = 0
      AND NOT EXISTS (
        SELECT 1 FROM public.remittance_allocations ra WHERE ra.invoice_id = i.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.invoice_payments ip WHERE ip.invoice_id = i.id
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.vehicles v
          WHERE v.id = ii.vehicle_id
            AND v.stock_status = 'available'
        )
        OR EXISTS (
          SELECT 1 FROM public.parts p
          WHERE p.id = ii.part_id
            AND p.stock_status = 'available'
        )
      )
  );

  PERFORM set_config('ansha.clearing_reservation_soa', '', true);
END;
$$;

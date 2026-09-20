/* Phase 67: customer portal — own reserved vehicles/parts + related invoices.
   Additive: RLS SELECT for portal customers + sanitized RPC get_my_reservations.
*/

-- ---------------------------------------------------------------------------
-- 1) Customer SELECT: reserved / sold stock held for their CRM customer_id
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS customer_read_own_reserved_vehicles ON public.vehicles;
CREATE POLICY customer_read_own_reserved_vehicles
  ON public.vehicles FOR SELECT
  TO authenticated
  USING (
    reserved_customer_id = (SELECT private.my_customer_id())
    AND stock_status IN ('reserved', 'sold')
  );

DROP POLICY IF EXISTS customer_read_own_reserved_parts ON public.parts;
CREATE POLICY customer_read_own_reserved_parts
  ON public.parts FOR SELECT
  TO authenticated
  USING (
    reserved_customer_id = (SELECT private.my_customer_id())
    AND stock_status IN ('reserved', 'sold')
  );

DROP POLICY IF EXISTS customer_read_own_reserved_vehicle_photos ON public.vehicle_photos;
CREATE POLICY customer_read_own_reserved_vehicle_photos
  ON public.vehicle_photos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vehicles v
      WHERE v.id = vehicle_photos.vehicle_id
        AND v.reserved_customer_id = (SELECT private.my_customer_id())
        AND v.stock_status IN ('reserved', 'sold')
    )
  );

DROP POLICY IF EXISTS customer_read_own_reserved_part_photos ON public.part_photos;
CREATE POLICY customer_read_own_reserved_part_photos
  ON public.part_photos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.parts p
      WHERE p.id = part_photos.part_id
        AND p.reserved_customer_id = (SELECT private.my_customer_id())
        AND p.stock_status IN ('reserved', 'sold')
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Sanitized reservations list for the signed-in portal customer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_reservations()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cid uuid;
  vehicle_rows jsonb;
  part_rows jsonb;
BEGIN
  cid := private.my_customer_id();
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Not a customer portal user'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_rank, x.updated_at DESC),
    '[]'::jsonb
  )
  INTO vehicle_rows
  FROM (
    SELECT
      v.id,
      'vehicle'::text AS kind,
      v.title,
      v.slug,
      v.make,
      v.model,
      v.year,
      v.stock_number,
      v.chassis_number,
      v.stock_status,
      v.stock_origin,
      v.location,
      v.price,
      v.currency,
      v.reservation_price_term,
      v.reservation_shipment_term,
      v.reservation_inspection_required,
      v.reservation_vat_applicable,
      v.reservation_etd,
      v.reservation_eta,
      v.updated_at,
      CASE WHEN v.stock_status = 'reserved' THEN 0 ELSE 1 END AS sort_rank,
      (
        SELECT vp.storage_path
        FROM public.vehicle_photos vp
        WHERE vp.vehicle_id = v.id
          AND COALESCE(vp.is_auction_sheet, false) = false
        ORDER BY vp.is_cover DESC, vp.sort_order ASC, vp.created_at ASC
        LIMIT 1
      ) AS cover_path,
      COALESCE((
        SELECT jsonb_agg(row_to_json(inv)::jsonb ORDER BY inv.issue_date DESC, inv.invoice_number DESC)
        FROM (
          SELECT DISTINCT ON (i.id)
            i.id,
            i.invoice_number,
            i.document_type,
            i.status,
            i.issue_date,
            i.currency,
            i.total_amount,
            i.balance_due,
            i.price_term,
            i.shipment_term
          FROM public.invoice_items ii
          INNER JOIN public.invoices i ON i.id = ii.invoice_id
          WHERE ii.vehicle_id = v.id
            AND i.customer_id = cid
            AND i.status IS DISTINCT FROM 'draft'
            AND i.status IS DISTINCT FROM 'cancelled'
          ORDER BY i.id, i.issue_date DESC
        ) inv
      ), '[]'::jsonb) AS invoices
    FROM public.vehicles v
    WHERE v.reserved_customer_id = cid
      AND (
        v.stock_status = 'reserved'
        OR (
          v.stock_status = 'sold'
          AND EXISTS (
            SELECT 1
            FROM public.invoice_items ii
            INNER JOIN public.invoices i ON i.id = ii.invoice_id
            WHERE ii.vehicle_id = v.id
              AND i.customer_id = cid
              AND i.status IS DISTINCT FROM 'draft'
              AND i.status IS DISTINCT FROM 'cancelled'
              AND (
                i.balance_due > 0
                OR i.document_type = 'proforma_invoice'
                OR i.status IN ('sent', 'partially_paid', 'overdue')
              )
          )
        )
      )
  ) x;

  SELECT COALESCE(
    jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_rank, x.updated_at DESC),
    '[]'::jsonb
  )
  INTO part_rows
  FROM (
    SELECT
      p.id,
      'part'::text AS kind,
      p.name AS title,
      p.slug,
      p.part_code,
      p.brand,
      p.part_number,
      p.stock_status,
      p.stock_origin,
      p.location,
      p.quantity,
      p.price,
      p.currency,
      p.reservation_price_term,
      p.reservation_shipment_term,
      p.reservation_inspection_required,
      p.reservation_vat_applicable,
      p.reservation_etd,
      p.reservation_eta,
      p.updated_at,
      CASE WHEN p.stock_status = 'reserved' THEN 0 ELSE 1 END AS sort_rank,
      (
        SELECT pp.storage_path
        FROM public.part_photos pp
        WHERE pp.part_id = p.id
        ORDER BY pp.is_cover DESC, pp.sort_order ASC, pp.created_at ASC
        LIMIT 1
      ) AS cover_path,
      COALESCE((
        SELECT jsonb_agg(row_to_json(inv)::jsonb ORDER BY inv.issue_date DESC, inv.invoice_number DESC)
        FROM (
          SELECT DISTINCT ON (i.id)
            i.id,
            i.invoice_number,
            i.document_type,
            i.status,
            i.issue_date,
            i.currency,
            i.total_amount,
            i.balance_due,
            i.price_term,
            i.shipment_term
          FROM public.invoice_items ii
          INNER JOIN public.invoices i ON i.id = ii.invoice_id
          WHERE ii.part_id = p.id
            AND i.customer_id = cid
            AND i.status IS DISTINCT FROM 'draft'
            AND i.status IS DISTINCT FROM 'cancelled'
          ORDER BY i.id, i.issue_date DESC
        ) inv
      ), '[]'::jsonb) AS invoices
    FROM public.parts p
    WHERE p.reserved_customer_id = cid
      AND (
        p.stock_status = 'reserved'
        OR (
          p.stock_status = 'sold'
          AND EXISTS (
            SELECT 1
            FROM public.invoice_items ii
            INNER JOIN public.invoices i ON i.id = ii.invoice_id
            WHERE ii.part_id = p.id
              AND i.customer_id = cid
              AND i.status IS DISTINCT FROM 'draft'
              AND i.status IS DISTINCT FROM 'cancelled'
              AND (
                i.balance_due > 0
                OR i.document_type = 'proforma_invoice'
                OR i.status IN ('sent', 'partially_paid', 'overdue')
              )
          )
        )
      )
  ) x;

  RETURN jsonb_build_object(
    'vehicles', vehicle_rows,
    'parts', part_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_reservations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_reservations() TO authenticated;

COMMENT ON FUNCTION public.get_my_reservations() IS
  'Phase 67: portal customer read-only list of reserved (and open-invoice sold) vehicles/parts with linked non-draft invoices.';

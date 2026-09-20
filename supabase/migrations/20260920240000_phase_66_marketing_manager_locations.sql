/* Phase 66: Deeper marketing v1 + manager location scope (stock_origin).

Marketing: honest sent_count on campaigns (no open-tracking events).
Manager: allowed_stock_origins on admin_profiles; RLS filters vehicles/parts;
export shipment SELECT for managers when linked inventory matches.

Do NOT create private.is_workspace_user() zero-arg overload.
*/

-- ---------------------------------------------------------------------------
-- A) Marketing campaigns — sent_count
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS sent_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_campaigns_sent_count_nonneg'
  ) THEN
    ALTER TABLE public.marketing_campaigns
      ADD CONSTRAINT marketing_campaigns_sent_count_nonneg CHECK (sent_count >= 0);
  END IF;
END;
$$;

COMMENT ON COLUMN public.marketing_campaigns.sent_count IS
  'Phase 66: count of successful deliveries (push devices or email recipients). No open tracking.';

-- ---------------------------------------------------------------------------
-- B) Manager location scope — allowed_stock_origins
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS allowed_stock_origins text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.admin_profiles.allowed_stock_origins IS
  'Phase 66: stock_origin values a manager may see/manage (japan|dubai|singapore|china|thailand|taiwan). Empty = no inventory access. Ignored for non-manager roles.';

COMMENT ON COLUMN public.admin_profiles.role IS
  'admin=account-admin+ops; staff=ops; sales|freelancer=field agents; accounts=receivables; manager=HR + location-scoped inventory/ops';

CREATE OR REPLACE FUNCTION private.is_location_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true
      AND role = 'manager'
  );
$$;

REVOKE ALL ON FUNCTION private.is_location_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_location_manager() TO authenticated;

COMMENT ON FUNCTION private.is_location_manager() IS
  'Phase 66: active admin_profiles.role = manager (location-scoped inventory).';

CREATE OR REPLACE FUNCTION private.manager_stock_origins()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT allowed_stock_origins
      FROM public.admin_profiles
      WHERE id = (SELECT auth.uid())
        AND is_active = true
        AND role = 'manager'
    ),
    '{}'::text[]
  );
$$;

REVOKE ALL ON FUNCTION private.manager_stock_origins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.manager_stock_origins() TO authenticated;

COMMENT ON FUNCTION private.manager_stock_origins() IS
  'Phase 66: allowed_stock_origins for the current manager; empty array otherwise.';

CREATE OR REPLACE FUNCTION private.can_access_stock_origin(p_origin text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN NOT private.is_location_manager() THEN true
      WHEN p_origin IS NULL OR btrim(p_origin) = '' THEN false
      ELSE (
        COALESCE(cardinality(private.manager_stock_origins()), 0) > 0
        AND p_origin = ANY (private.manager_stock_origins())
      )
    END;
$$;

REVOKE ALL ON FUNCTION private.can_access_stock_origin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_stock_origin(text) TO authenticated;

COMMENT ON FUNCTION private.can_access_stock_origin(text) IS
  'Phase 66: ops/field/accounts unrestricted by origin; managers only when origin is assigned.';

-- ---------------------------------------------------------------------------
-- Vehicles SELECT / write scoped for managers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_read_all_vehicles" ON public.vehicles;
CREATE POLICY "admin_read_all_vehicles"
  ON public.vehicles FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    AND (
      NOT private.is_field_agent()
      OR stock_status = 'available'
      OR reserved_by = (SELECT auth.uid())
    )
    AND (
      NOT private.is_location_manager()
      OR (
        COALESCE(cardinality(private.manager_stock_origins()), 0) > 0
        AND stock_origin = ANY (private.manager_stock_origins())
      )
    )
  );

DROP POLICY IF EXISTS "admin_insert_vehicles" ON public.vehicles;
CREATE POLICY "admin_insert_vehicles"
  ON public.vehicles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    AND private.can_access_stock_origin(stock_origin)
  );

DROP POLICY IF EXISTS "admin_update_vehicles" ON public.vehicles;
CREATE POLICY "admin_update_vehicles"
  ON public.vehicles FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    AND private.can_access_stock_origin(stock_origin)
  )
  WITH CHECK (
    public.is_admin()
    AND private.can_access_stock_origin(stock_origin)
  );

DROP POLICY IF EXISTS "admin_delete_vehicles" ON public.vehicles;
CREATE POLICY "admin_delete_vehicles"
  ON public.vehicles FOR DELETE
  TO authenticated
  USING ((SELECT private.is_ops_user()));

-- ---------------------------------------------------------------------------
-- Parts SELECT / write scoped for managers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_read_all_parts" ON public.parts;
CREATE POLICY "admin_read_all_parts"
  ON public.parts FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    AND (
      NOT private.is_field_agent()
      OR stock_status = 'available'
      OR reserved_by = (SELECT auth.uid())
    )
    AND (
      NOT private.is_location_manager()
      OR (
        COALESCE(cardinality(private.manager_stock_origins()), 0) > 0
        AND stock_origin = ANY (private.manager_stock_origins())
      )
    )
  );

DROP POLICY IF EXISTS "admin_insert_parts" ON public.parts;
CREATE POLICY "admin_insert_parts"
  ON public.parts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    AND private.can_access_stock_origin(stock_origin)
  );

DROP POLICY IF EXISTS "admin_update_parts" ON public.parts;
CREATE POLICY "admin_update_parts"
  ON public.parts FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    AND private.can_access_stock_origin(stock_origin)
  )
  WITH CHECK (
    public.is_admin()
    AND private.can_access_stock_origin(stock_origin)
  );

DROP POLICY IF EXISTS "admin_delete_parts" ON public.parts;
CREATE POLICY "admin_delete_parts"
  ON public.parts FOR DELETE
  TO authenticated
  USING ((SELECT private.is_ops_user()));

-- ---------------------------------------------------------------------------
-- Export shipments: managers may SELECT when linked inventory matches
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS manager_select_export_shipments ON public.export_shipments;
CREATE POLICY manager_select_export_shipments
  ON public.export_shipments FOR SELECT
  TO authenticated
  USING (
    private.is_location_manager()
    AND COALESCE(cardinality(private.manager_stock_origins()), 0) > 0
    AND (
      EXISTS (
        SELECT 1
        FROM public.export_shipment_vehicles esv
        JOIN public.vehicles v ON v.id = esv.vehicle_id
        WHERE esv.export_shipment_id = export_shipments.id
          AND v.stock_origin = ANY (private.manager_stock_origins())
      )
      OR EXISTS (
        SELECT 1
        FROM public.export_shipment_parts esp
        JOIN public.parts p ON p.id = esp.part_id
        WHERE esp.export_shipment_id = export_shipments.id
          AND p.stock_origin = ANY (private.manager_stock_origins())
      )
    )
  );

DROP POLICY IF EXISTS manager_select_export_shipment_vehicles ON public.export_shipment_vehicles;
CREATE POLICY manager_select_export_shipment_vehicles
  ON public.export_shipment_vehicles FOR SELECT
  TO authenticated
  USING (
    private.is_location_manager()
    AND EXISTS (
      SELECT 1
      FROM public.vehicles v
      WHERE v.id = export_shipment_vehicles.vehicle_id
        AND v.stock_origin = ANY (private.manager_stock_origins())
    )
  );

DROP POLICY IF EXISTS manager_select_export_shipment_parts ON public.export_shipment_parts;
CREATE POLICY manager_select_export_shipment_parts
  ON public.export_shipment_parts FOR SELECT
  TO authenticated
  USING (
    private.is_location_manager()
    AND EXISTS (
      SELECT 1
      FROM public.parts p
      WHERE p.id = export_shipment_parts.part_id
        AND p.stock_origin = ANY (private.manager_stock_origins())
    )
  );

-- ---------------------------------------------------------------------------
-- Guard: still one is_workspace_user signature
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  overload_count integer;
BEGIN
  SELECT count(*) INTO overload_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'is_workspace_user';

  IF overload_count <> 1 THEN
    RAISE EXCEPTION
      'private.is_workspace_user overload count = %, expected 1',
      overload_count;
  END IF;
END;
$$;

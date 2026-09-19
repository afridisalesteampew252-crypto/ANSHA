/* Phase 54: field agents (sales tighten + freelancer), manager role,
   HR / workforce MVP (locations, shifts, assignments, attendance),
   catalog activity audit (admin-only SELECT on audit_logs).

Additive only. Does not alter payroll delete (Phase 48/53).
*/

-- ---------------------------------------------------------------------------
-- Roles: admin | staff | sales | freelancer | manager
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_profiles DROP CONSTRAINT IF EXISTS admin_profiles_role_check;
ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_role_check
  CHECK (role IN ('admin', 'staff', 'sales', 'freelancer', 'manager'));

COMMENT ON COLUMN public.admin_profiles.role IS
  'admin=account-admin+ops; staff=ops; sales|freelancer=field agents (catalog+reserve); manager=HR view (+ future approvals)';

-- Field agent helper (sales + freelancer share route/RLS gates)
CREATE OR REPLACE FUNCTION private.is_field_agent()
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
      AND role IN ('sales', 'freelancer')
  );
$$;

REVOKE ALL ON FUNCTION private.is_field_agent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_field_agent() TO authenticated;

COMMENT ON FUNCTION private.is_field_agent() IS
  'Phase 54: active sales or freelancer — catalog browse + reservation request only.';

-- Keep sales-only helper for own-book analytics / customer ownership
CREATE OR REPLACE FUNCTION private.is_sales_agent()
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
      AND role = 'sales'
  );
$$;

-- HR viewers: ops + manager (manager cannot write locations/assignments in v1)
CREATE OR REPLACE FUNCTION private.is_hr_viewer()
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
      AND role IN ('admin', 'staff', 'manager')
  );
$$;

REVOKE ALL ON FUNCTION private.is_hr_viewer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_hr_viewer() TO authenticated;

-- ---------------------------------------------------------------------------
-- Audit log: admin-only SELECT (was ops)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ops_select_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS admin_select_audit_logs ON public.audit_logs;

CREATE POLICY admin_select_audit_logs
  ON public.audit_logs FOR SELECT TO authenticated
  USING ((SELECT private.is_account_admin()));

COMMENT ON TABLE public.audit_logs IS
  'Append-only activity log. SELECT: account-admin only (Phase 54). Write via private.write_audit_log.';

-- ---------------------------------------------------------------------------
-- Catalog audit triggers (parts + vehicles create/update/delete + stock)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.trg_audit_catalog_part()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  act text;
  meta jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    act := 'create';
    meta := jsonb_build_object(
      'part_code', NEW.part_code,
      'name', NEW.name,
      'stock_status', NEW.stock_status,
      'stock_origin', NEW.stock_origin
    );
    PERFORM private.write_audit_log(act, 'part', NEW.id, meta, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    act := 'delete';
    meta := jsonb_build_object(
      'part_code', OLD.part_code,
      'name', OLD.name,
      'stock_status', OLD.stock_status
    );
    PERFORM private.write_audit_log(act, 'part', OLD.id, meta, auth.uid());
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.stock_status IS DISTINCT FROM NEW.stock_status THEN
    PERFORM private.write_audit_log(
      'stock_status_change',
      'part',
      NEW.id,
      jsonb_build_object(
        'old_stock_status', OLD.stock_status,
        'new_stock_status', NEW.stock_status,
        'part_code', NEW.part_code,
        'name', NEW.name
      ),
      auth.uid()
    );
  ELSIF OLD.name IS DISTINCT FROM NEW.name
     OR OLD.part_code IS DISTINCT FROM NEW.part_code
     OR OLD.quantity IS DISTINCT FROM NEW.quantity
     OR OLD.stock_origin IS DISTINCT FROM NEW.stock_origin
     OR OLD.is_published IS DISTINCT FROM NEW.is_published
     OR OLD.price IS DISTINCT FROM NEW.price
     OR OLD.reserved_customer_id IS DISTINCT FROM NEW.reserved_customer_id
  THEN
    PERFORM private.write_audit_log(
      'update',
      'part',
      NEW.id,
      jsonb_build_object(
        'part_code', NEW.part_code,
        'name', NEW.name,
        'stock_status', NEW.stock_status,
        'stock_origin', NEW.stock_origin,
        'quantity', NEW.quantity,
        'is_published', NEW.is_published
      ),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_audit_catalog_part() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS parts_audit_catalog ON public.parts;
CREATE TRIGGER parts_audit_catalog
AFTER INSERT OR UPDATE OR DELETE ON public.parts
FOR EACH ROW EXECUTE FUNCTION private.trg_audit_catalog_part();

-- Replace vehicle stock-only trigger with fuller catalog audit
DROP TRIGGER IF EXISTS vehicles_audit_stock_status ON public.vehicles;

CREATE OR REPLACE FUNCTION private.trg_audit_catalog_vehicle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.write_audit_log(
      'create',
      'vehicle',
      NEW.id,
      jsonb_build_object(
        'title', NEW.title,
        'stock_number', NEW.stock_number,
        'chassis_number', NEW.chassis_number,
        'stock_status', NEW.stock_status,
        'stock_origin', NEW.stock_origin
      ),
      auth.uid()
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM private.write_audit_log(
      'delete',
      'vehicle',
      OLD.id,
      jsonb_build_object(
        'title', OLD.title,
        'stock_number', OLD.stock_number,
        'chassis_number', OLD.chassis_number,
        'stock_status', OLD.stock_status
      ),
      auth.uid()
    );
    RETURN OLD;
  END IF;

  IF OLD.stock_status IS DISTINCT FROM NEW.stock_status THEN
    PERFORM private.write_audit_log(
      'stock_status_change',
      'vehicle',
      NEW.id,
      jsonb_build_object(
        'old_stock_status', OLD.stock_status,
        'new_stock_status', NEW.stock_status,
        'stock_number', NEW.stock_number,
        'chassis_number', NEW.chassis_number,
        'reserved_customer_id', NEW.reserved_customer_id
      ),
      auth.uid()
    );
  ELSIF OLD.title IS DISTINCT FROM NEW.title
     OR OLD.stock_number IS DISTINCT FROM NEW.stock_number
     OR OLD.chassis_number IS DISTINCT FROM NEW.chassis_number
     OR OLD.stock_origin IS DISTINCT FROM NEW.stock_origin
     OR OLD.is_published IS DISTINCT FROM NEW.is_published
     OR OLD.price IS DISTINCT FROM NEW.price
     OR OLD.lifecycle_stage IS DISTINCT FROM NEW.lifecycle_stage
     OR OLD.reserved_customer_id IS DISTINCT FROM NEW.reserved_customer_id
  THEN
    PERFORM private.write_audit_log(
      'update',
      'vehicle',
      NEW.id,
      jsonb_build_object(
        'title', NEW.title,
        'stock_number', NEW.stock_number,
        'stock_status', NEW.stock_status,
        'stock_origin', NEW.stock_origin,
        'lifecycle_stage', NEW.lifecycle_stage,
        'is_published', NEW.is_published
      ),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_audit_catalog_vehicle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vehicles_audit_catalog ON public.vehicles;
CREATE TRIGGER vehicles_audit_catalog
AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION private.trg_audit_catalog_vehicle();

-- Keep legacy function body aligned (no-op if still referenced)
CREATE OR REPLACE FUNCTION private.trg_audit_vehicle_stock_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Superseded by private.trg_audit_catalog_vehicle (Phase 54)
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- HR / workforce MVP
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shift_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL CHECK (char_length(btrim(country)) BETWEEN 2 AND 80),
  city text CHECK (city IS NULL OR char_length(btrim(city)) BETWEEN 1 AND 80),
  office_name text CHECK (office_name IS NULL OR char_length(btrim(office_name)) BETWEEN 1 AND 120),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_locations_active_idx
  ON public.shift_locations (is_active, country);

COMMENT ON TABLE public.shift_locations IS
  'Phase 54: office / yard locations for shift assignment (country + optional city/office).';

CREATE TABLE IF NOT EXISTS public.shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.shift_locations(id) ON DELETE RESTRICT,
  shift text NOT NULL CHECK (shift IN ('morning', 'night')),
  effective_from date NOT NULL DEFAULT (CURRENT_DATE),
  effective_to date,
  notes text,
  created_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_assignments_dates_chk
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS shift_assignments_user_idx
  ON public.shift_assignments (user_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS shift_assignments_location_idx
  ON public.shift_assignments (location_id, shift);

COMMENT ON TABLE public.shift_assignments IS
  'Phase 54: assign workspace users to Morning or Night at a shift_location.';

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  work_date date NOT NULL DEFAULT (CURRENT_DATE),
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'absent', 'leave', 'remote')),
  notes text,
  recorded_by uuid REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_user_date_uq UNIQUE (user_id, work_date),
  CONSTRAINT attendance_records_times_chk
    CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at)
);

CREATE INDEX IF NOT EXISTS attendance_records_date_idx
  ON public.attendance_records (work_date DESC);
CREATE INDEX IF NOT EXISTS attendance_records_user_idx
  ON public.attendance_records (user_id, work_date DESC);

COMMENT ON TABLE public.attendance_records IS
  'Phase 54: daily attendance / check-in-out tied to optional shift assignment.';

-- updated_at triggers (reuse generic if present; else inline)
CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shift_locations_updated_at ON public.shift_locations;
CREATE TRIGGER shift_locations_updated_at
BEFORE UPDATE ON public.shift_locations
FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

DROP TRIGGER IF EXISTS shift_assignments_updated_at ON public.shift_assignments;
CREATE TRIGGER shift_assignments_updated_at
BEFORE UPDATE ON public.shift_assignments
FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

DROP TRIGGER IF EXISTS attendance_records_updated_at ON public.attendance_records;
CREATE TRIGGER attendance_records_updated_at
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- RLS
ALTER TABLE public.shift_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_select_shift_locations ON public.shift_locations;
CREATE POLICY hr_select_shift_locations
  ON public.shift_locations FOR SELECT TO authenticated
  USING ((SELECT private.is_hr_viewer()));

DROP POLICY IF EXISTS ops_write_shift_locations ON public.shift_locations;
CREATE POLICY ops_write_shift_locations
  ON public.shift_locations FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS hr_select_shift_assignments ON public.shift_assignments;
CREATE POLICY hr_select_shift_assignments
  ON public.shift_assignments FOR SELECT TO authenticated
  USING (
    (SELECT private.is_hr_viewer())
    OR user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS ops_write_shift_assignments ON public.shift_assignments;
CREATE POLICY ops_write_shift_assignments
  ON public.shift_assignments FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

DROP POLICY IF EXISTS hr_select_attendance ON public.attendance_records;
CREATE POLICY hr_select_attendance
  ON public.attendance_records FOR SELECT TO authenticated
  USING (
    (SELECT private.is_hr_viewer())
    OR user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS ops_insert_attendance ON public.attendance_records;
CREATE POLICY ops_insert_attendance
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_ops_user())
    OR (
      user_id = (SELECT auth.uid())
      AND (SELECT private.is_workspace_user())
    )
  );

DROP POLICY IF EXISTS ops_update_attendance ON public.attendance_records;
CREATE POLICY ops_update_attendance
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_ops_user())
    OR user_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT private.is_ops_user())
    OR user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS ops_delete_attendance ON public.attendance_records;
CREATE POLICY ops_delete_attendance
  ON public.attendance_records FOR DELETE TO authenticated
  USING ((SELECT private.is_ops_user()));

REVOKE ALL ON public.shift_locations FROM PUBLIC, anon;
REVOKE ALL ON public.shift_assignments FROM PUBLIC, anon;
REVOKE ALL ON public.attendance_records FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;

-- Field agents (sales + freelancer): own-book customers for reservation workflow
DROP POLICY IF EXISTS workspace_select_customers ON public.customers;
CREATE POLICY workspace_select_customers
  ON public.customers FOR SELECT TO authenticated
  USING (
    (SELECT private.is_ops_user())
    OR ((SELECT private.is_field_agent()) AND owner_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS workspace_insert_customers ON public.customers;
CREATE POLICY workspace_insert_customers
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_ops_user())
    OR (
      (SELECT private.is_field_agent())
      AND owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS workspace_update_customers ON public.customers;
CREATE POLICY workspace_update_customers
  ON public.customers FOR UPDATE TO authenticated
  USING (
    (SELECT private.is_ops_user())
    OR ((SELECT private.is_field_agent()) AND owner_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT private.is_ops_user())
    OR (
      (SELECT private.is_field_agent())
      AND owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS workspace_delete_customers ON public.customers;
CREATE POLICY workspace_delete_customers
  ON public.customers FOR DELETE TO authenticated
  USING (
    (SELECT private.is_account_admin())
    OR ((SELECT private.is_field_agent()) AND owner_id = (SELECT auth.uid()))
  );

-- Seed starter offices
INSERT INTO public.shift_locations (country, city, office_name)
SELECT v.country, v.city, v.office_name
FROM (VALUES
  ('United Arab Emirates', 'Dubai', 'ANSHA Dubai office'),
  ('Pakistan', 'Karachi', 'ANSHA Karachi office'),
  ('Japan', 'Nagoya', 'ANSHA Japan yard')
) AS v(country, city, office_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.shift_locations s
  WHERE s.country = v.country
    AND COALESCE(s.city, '') = COALESCE(v.city, '')
    AND COALESCE(s.office_name, '') = COALESCE(v.office_name, '')
);

-- Guard: still one is_workspace_user signature
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

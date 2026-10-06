-- Restrict internal cost / supplier / reservation columns on vehicles and parts to staff.
--
-- Why: the "public_read_published_*" policies allowed anon AND every authenticated user
-- (including customer-portal accounts) to read every column of a published row, including
-- purchase_price, landed_cost, supplier_id, supplier_invoice_id, purchase_order_id,
-- costs_notes, customs_notes, reserved_customer_id, reserved_by and reservation_* fields.
-- RLS policies filter rows, not columns, so the fix has two parts:
--
-- 1. anon: replace the table-wide SELECT grant with a column-level grant that lists only the
--    public listing columns. Every public-site / mobile query was changed in the same PR to use
--    explicit column lists (column grants make `select=*` fail with "permission denied").
--    The public catalog now reads through a cookie-less anon client, even for signed-in users.
--
-- 2. authenticated: column grants are per database role and staff + customers share the
--    `authenticated` role, so they cannot be split by column. Instead the published-row policy
--    is limited to `anon`, and the "customer reads own reserved row" policies are dropped
--    (portal reservations already use the SECURITY DEFINER RPC get_my_reservations, which
--    returns only customer-safe fields). Staff are unaffected: every active admin_profiles
--    user is covered by workspace_read_all_vehicles / workspace_read_all_parts.
--
-- Deploy order: deploy the application code from this PR FIRST, then apply this migration.
-- (Old code read the catalog with the signed-in session and `select *`.)
--
-- Maintenance note: a NEW column added to vehicles/parts is NOT readable by anon until it is
-- added to the GRANT lists below (fail-closed by design).

-- ---------------------------------------------------------------------------
-- 1. anon: column-level SELECT only, and no write privileges at all.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.vehicles FROM anon;
REVOKE ALL ON TABLE public.parts FROM anon;

GRANT SELECT (
  id, title, slug, make, model, variant, year, chassis_code, engine_code, transmission,
  fuel_type, mileage, color, price, currency, show_price, description, location,
  is_published, is_featured, created_at, updated_at, meta_title, meta_description,
  search_keywords, stock_number, destination_markets, shipping_methods, stock_origin,
  stock_status, sold_at, vehicle_class, equipment_category, operating_hours,
  price_fob, price_cf, price_cif, stock_pool, volume_m3
) ON TABLE public.vehicles TO anon;

GRANT SELECT (
  id, part_code, name, slug, category_id, brand, part_number, oem_number, condition,
  price, currency, quantity, location, description, is_published, is_featured, show_price,
  created_at, updated_at, meta_title, meta_description, search_keywords,
  manufacturer_part_number, interchange_numbers, superseded_part_numbers, export_markets,
  stock_origin, stock_status, sold_at, price_fob, price_cf, price_cif
) ON TABLE public.parts TO anon;

-- ---------------------------------------------------------------------------
-- 2. Published-row policies: anon only. Signed-in customers browse via the anon client.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "public_read_published_vehicles" ON public.vehicles;
CREATE POLICY "public_read_published_vehicles"
  ON public.vehicles
  FOR SELECT
  TO anon
  USING (is_published = true);

DROP POLICY IF EXISTS "public_read_published_parts" ON public.parts;
CREATE POLICY "public_read_published_parts"
  ON public.parts
  FOR SELECT
  TO anon
  USING (is_published = true);

-- Customer portal reads its reservations through get_my_reservations() (SECURITY DEFINER);
-- these direct-table policies exposed every internal column of the reserved row.
DROP POLICY IF EXISTS "customer_read_own_reserved_vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "customer_read_own_reserved_parts" ON public.parts;

-- The photo policies below depended on the dropped row policies; recreate them with
-- SECURITY DEFINER helpers so a customer can still load photos of stock reserved for them.
CREATE OR REPLACE FUNCTION private.is_my_reserved_vehicle(p_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.id = p_vehicle_id
      AND v.reserved_customer_id = private.my_customer_id()
      AND v.stock_status IN ('reserved', 'sold')
  );
$$;

CREATE OR REPLACE FUNCTION private.is_my_reserved_part(p_part_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parts p
    WHERE p.id = p_part_id
      AND p.reserved_customer_id = private.my_customer_id()
      AND p.stock_status IN ('reserved', 'sold')
  );
$$;

REVOKE ALL ON FUNCTION private.is_my_reserved_vehicle(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_my_reserved_part(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_my_reserved_vehicle(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_my_reserved_part(uuid) TO authenticated;

DROP POLICY IF EXISTS "customer_read_own_reserved_vehicle_photos" ON public.vehicle_photos;
CREATE POLICY "customer_read_own_reserved_vehicle_photos"
  ON public.vehicle_photos
  FOR SELECT
  TO authenticated
  USING (private.is_my_reserved_vehicle(vehicle_id));

DROP POLICY IF EXISTS "customer_read_own_reserved_part_photos" ON public.part_photos;
CREATE POLICY "customer_read_own_reserved_part_photos"
  ON public.part_photos
  FOR SELECT
  TO authenticated
  USING (private.is_my_reserved_part(part_id));

-- public_read_published_vehicle_photos / _part_photos / _compatibility are unchanged: their
-- EXISTS (... vehicles.id ... vehicles.is_published) sub-queries only touch columns that anon
-- can still read. Staff read photos through workspace_read_all_* policies.

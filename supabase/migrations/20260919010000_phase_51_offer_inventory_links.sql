/* Phase 51: Link site_offers to inventory (vehicle and/or part) with optional deal pricing.

Adds optional FKs + discount_percent / sale_price for public deal display.
Tightens site_offers write RLS to ops (admin|staff) so sales stays blocked —
matching Marketing nav / campaigns policy intent.
*/

ALTER TABLE public.site_offers
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS part_id uuid REFERENCES public.parts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2)
    CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  ADD COLUMN IF NOT EXISTS sale_price numeric(14,2)
    CHECK (sale_price IS NULL OR sale_price >= 0);

CREATE INDEX IF NOT EXISTS site_offers_vehicle_id_idx
  ON public.site_offers (vehicle_id)
  WHERE vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS site_offers_part_id_idx
  ON public.site_offers (part_id)
  WHERE part_id IS NOT NULL;

COMMENT ON COLUMN public.site_offers.vehicle_id IS
  'Optional link to a published vehicle listing for inventory-tied deals.';
COMMENT ON COLUMN public.site_offers.part_id IS
  'Optional link to a published part listing for inventory-tied deals.';
COMMENT ON COLUMN public.site_offers.discount_percent IS
  'Optional display discount % (0–100). Does not mutate inventory list price.';
COMMENT ON COLUMN public.site_offers.sale_price IS
  'Optional display sale/ask price for the deal. Does not mutate inventory list price.';

-- Ops-only writes (sales remains read of published offers via public policy only)
DROP POLICY IF EXISTS workspace_manage_site_offers ON public.site_offers;
DROP POLICY IF EXISTS ops_manage_site_offers ON public.site_offers;

CREATE POLICY ops_manage_site_offers
  ON public.site_offers FOR ALL TO authenticated
  USING ((SELECT private.is_ops_user()))
  WITH CHECK ((SELECT private.is_ops_user()));

-- Guard: do not introduce a zero-arg is_workspace_user overload
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
END $$;

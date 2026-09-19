-- Phase 56: mark auction-sheet photos (admin-only; excluded from public gallery).

ALTER TABLE public.vehicle_photos
  ADD COLUMN IF NOT EXISTS is_auction_sheet boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vehicle_photos.is_auction_sheet IS
  'True for Japanese auction sheet images (typically filename A.*). Hidden from public catalog; visible in admin.';

CREATE INDEX IF NOT EXISTS idx_vehicle_photos_auction_sheet
  ON public.vehicle_photos (vehicle_id)
  WHERE is_auction_sheet = true;

-- Public (and non-admin authenticated) reads of published vehicles must not include auction sheets.
DROP POLICY IF EXISTS "public_read_published_vehicle_photos" ON public.vehicle_photos;

CREATE POLICY "public_read_published_vehicle_photos"
  ON public.vehicle_photos FOR SELECT
  TO anon, authenticated
  USING (
    is_auction_sheet = false
    AND EXISTS (
      SELECT 1
      FROM public.vehicles
      WHERE vehicles.id = vehicle_photos.vehicle_id
        AND vehicles.is_published = true
    )
  );

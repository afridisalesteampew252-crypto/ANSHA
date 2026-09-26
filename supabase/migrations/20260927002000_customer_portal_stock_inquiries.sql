-- Attach signed-in stock inquiries to their customer account without exposing other customers' records.
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS customer_profile_id uuid REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inquiries_customer_profile_created_idx
  ON public.inquiries (customer_profile_id, created_at DESC)
  WHERE customer_profile_id IS NOT NULL;

DROP POLICY IF EXISTS public_insert_inquiries ON public.inquiries;
CREATE POLICY public_insert_inquiries ON public.inquiries
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    customer_profile_id IS NULL
    OR (
      customer_profile_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.customer_profiles cp
        WHERE cp.id = customer_profile_id AND cp.is_active = true
      )
    )
  );

CREATE POLICY customer_read_own_inquiries ON public.inquiries
  FOR SELECT TO authenticated
  USING (
    customer_profile_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.customer_profiles cp
      WHERE cp.id = customer_profile_id AND cp.is_active = true
    )
  );

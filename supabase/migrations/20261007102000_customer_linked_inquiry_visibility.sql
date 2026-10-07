-- Admin linking uses the business customer_id; customer_profile_id is immutable
-- submission attribution and can be NULL for guest or manually logged inquiries.
-- A current canonical link takes precedence over the historical origin profile.
DROP POLICY IF EXISTS customer_read_own_inquiries ON public.inquiries;
CREATE POLICY customer_read_own_inquiries ON public.inquiries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customer_profiles cp
    WHERE cp.id = (SELECT auth.uid()) AND cp.is_active
      AND (
        inquiries.customer_id = cp.customer_id
        OR (inquiries.customer_id IS NULL AND inquiries.customer_profile_id = cp.id)
      )
  ));

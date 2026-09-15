/*
# Phase 1: Security and authorization hardening

Restricts administrative database and Storage operations to users present in
public.admin_profiles, prevents unpublished vehicle data from being exposed,
and adds upload limits for public media buckets.
*/

-- Vehicles: public users only see published inventory; staff can manage all.
DROP POLICY IF EXISTS "public_select_vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "auth_insert_vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "auth_update_vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "auth_delete_vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "admin_read_all_vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "admin_insert_vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "admin_update_vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "admin_delete_vehicles" ON public.vehicles;

CREATE POLICY "public_read_published_vehicles"
  ON public.vehicles FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "admin_read_all_vehicles"
  ON public.vehicles FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_insert_vehicles"
  ON public.vehicles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_update_vehicles"
  ON public.vehicles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_vehicles"
  ON public.vehicles FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Vehicle photos follow their parent vehicle's publication status.
DROP POLICY IF EXISTS "public_select_vehicle_photos" ON public.vehicle_photos;
DROP POLICY IF EXISTS "auth_insert_vehicle_photos" ON public.vehicle_photos;
DROP POLICY IF EXISTS "auth_update_vehicle_photos" ON public.vehicle_photos;
DROP POLICY IF EXISTS "auth_delete_vehicle_photos" ON public.vehicle_photos;
DROP POLICY IF EXISTS "admin_read_all_vehicle_photos" ON public.vehicle_photos;
DROP POLICY IF EXISTS "admin_insert_vehicle_photos" ON public.vehicle_photos;
DROP POLICY IF EXISTS "admin_update_vehicle_photos" ON public.vehicle_photos;
DROP POLICY IF EXISTS "admin_delete_vehicle_photos" ON public.vehicle_photos;

CREATE POLICY "public_read_published_vehicle_photos"
  ON public.vehicle_photos FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vehicles
      WHERE vehicles.id = vehicle_photos.vehicle_id
        AND vehicles.is_published = true
    )
  );

CREATE POLICY "admin_read_all_vehicle_photos"
  ON public.vehicle_photos FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_insert_vehicle_photos"
  ON public.vehicle_photos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_update_vehicle_photos"
  ON public.vehicle_photos FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_vehicle_photos"
  ON public.vehicle_photos FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Blog management is staff-only; public users retain published read access.
DROP POLICY IF EXISTS "auth_insert_blog_categories" ON public.blog_categories;
DROP POLICY IF EXISTS "auth_update_blog_categories" ON public.blog_categories;
DROP POLICY IF EXISTS "auth_delete_blog_categories" ON public.blog_categories;

CREATE POLICY "admin_insert_blog_categories"
  ON public.blog_categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_update_blog_categories"
  ON public.blog_categories FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_blog_categories"
  ON public.blog_categories FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "auth_read_all_blog_posts" ON public.blog_posts;
DROP POLICY IF EXISTS "auth_insert_blog_posts" ON public.blog_posts;
DROP POLICY IF EXISTS "auth_update_blog_posts" ON public.blog_posts;
DROP POLICY IF EXISTS "auth_delete_blog_posts" ON public.blog_posts;

CREATE POLICY "admin_read_all_blog_posts"
  ON public.blog_posts FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_insert_blog_posts"
  ON public.blog_posts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_update_blog_posts"
  ON public.blog_posts FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_blog_posts"
  ON public.blog_posts FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Customer request details are private to approved staff.
DROP POLICY IF EXISTS "auth_read_part_requests" ON public.part_requests;
DROP POLICY IF EXISTS "auth_update_part_requests" ON public.part_requests;
DROP POLICY IF EXISTS "auth_delete_part_requests" ON public.part_requests;

CREATE POLICY "admin_read_part_requests"
  ON public.part_requests FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_update_part_requests"
  ON public.part_requests FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_part_requests"
  ON public.part_requests FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Storage writes require an approved staff profile.
DROP POLICY IF EXISTS "auth_insert_vehicle_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_update_vehicle_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_vehicle_images" ON storage.objects;

CREATE POLICY "admin_insert_vehicle_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'vehicle-images' AND public.is_admin());

CREATE POLICY "admin_update_vehicle_images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'vehicle-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'vehicle-images' AND public.is_admin());

CREATE POLICY "admin_delete_vehicle_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'vehicle-images' AND public.is_admin());

DROP POLICY IF EXISTS "auth_insert_blog_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_update_blog_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_blog_images" ON storage.objects;

CREATE POLICY "admin_insert_blog_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'blog-images' AND public.is_admin());

CREATE POLICY "admin_update_blog_images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'blog-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'blog-images' AND public.is_admin());

CREATE POLICY "admin_delete_blog_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'blog-images' AND public.is_admin());

-- Permit ordinary web image formats only and cap each upload at 10 MiB.
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif'
    ]::text[]
WHERE id IN ('part-images', 'vehicle-images', 'blog-images');

-- Trigger functions are internal and must use a fixed search path.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated;

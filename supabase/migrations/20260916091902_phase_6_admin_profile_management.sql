/* Phase 6 follow-up: editable customer/staff profiles and protected profile images. */

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.admin_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.admin_profiles ADD COLUMN IF NOT EXISTS avatar_url text;

UPDATE public.admin_profiles AS profile
SET email = users.email
FROM auth.users AS users
WHERE users.id = profile.id AND profile.email IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_profiles_email_key
  ON public.admin_profiles (lower(email)) WHERE email IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-images',
  'profile-images',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "admin_manage_profile_images" ON storage.objects;
CREATE POLICY "admin_manage_profile_images"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'profile-images' AND public.is_admin())
WITH CHECK (bucket_id = 'profile-images' AND public.is_admin());

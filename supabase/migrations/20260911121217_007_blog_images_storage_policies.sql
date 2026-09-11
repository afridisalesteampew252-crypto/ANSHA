/*
# Add storage policies for blog-images bucket

## Overview
The blog-images bucket exists and is public, but has no storage policies.
This means authenticated users cannot upload blog images, and the public
cannot read them via the storage API (though the bucket is marked public).

## Changes
1. Add SELECT policy for anon+authenticated (public read)
2. Add INSERT policy for authenticated (admin upload)
3. Add UPDATE policy for authenticated (admin replace)
4. Add DELETE policy for authenticated (admin remove)

## Security
- Public can read blog images (bucket is public)
- Only authenticated users can upload/update/delete (admin only)
*/

-- Public read for blog-images
DROP POLICY IF EXISTS "public_read_blog_images" ON storage.objects;
CREATE POLICY "public_read_blog_images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'blog-images');

-- Authenticated insert for blog-images
DROP POLICY IF EXISTS "auth_insert_blog_images" ON storage.objects;
CREATE POLICY "auth_insert_blog_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'blog-images');

-- Authenticated update for blog-images
DROP POLICY IF EXISTS "auth_update_blog_images" ON storage.objects;
CREATE POLICY "auth_update_blog_images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'blog-images')
  WITH CHECK (bucket_id = 'blog-images');

-- Authenticated delete for blog-images
DROP POLICY IF EXISTS "auth_delete_blog_images" ON storage.objects;
CREATE POLICY "auth_delete_blog_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'blog-images');

/*
# ANSHATRADING Initial Schema

## Overview
Creates the core database structure for the ANSHATRADING automotive parts catalog and internal management system.

## New Tables

1. **admin_profiles** — Links auth.users to admin role (created first so is_admin() can reference it)
   - id (uuid PK, references auth.users)
   - full_name (text, nullable)
   - role (enum: admin, staff, default 'staff')
   - created_at

2. **categories** — Product categories (e.g., Headlights, Engines, Brakes)
   - id, name (unique), slug (unique), description, sort_order, created_at, updated_at

3. **parts** — The central business object
   - id, part_code (unique), name, slug (unique), category_id (FK), brand, part_number, oem_number,
     condition (new/used/refurbished/for-parts), price, currency, quantity, location, description,
     is_published, is_featured, show_price, created_at, updated_at

4. **part_photos** — Photos linked to parts (storage_path, is_cover, sort_order)

5. **part_compatibility** — Vehicle compatibility entries (make, model, variant, chassis_code, engine_code, year_from, year_to)

6. **inquiries** — Customer inquiries (part_id, customer_name, email, phone, message, status)

## Security (RLS)
- Public can read categories, published parts + their photos/compatibility
- Anyone can submit an inquiry (public INSERT)
- Only admins can read/write inquiries, manage all parts/categories/photos
- is_admin() SECURITY DEFINER function checks admin_profiles
- Storage bucket "part-images": public read, admin write

## Indexes
- parts: slug, part_code (unique), category_id, is_published, is_featured, oem_number, part_number, name
- part_photos.part_id, part_compatibility.part_id
- inquiries: part_id, status, created_at

## Important Notes
1. admin_profiles created BEFORE is_admin() function to avoid ordering errors
2. Public users (anon) can only see published parts
3. Part codes and slugs are unique at the database level
4. Inquiries only visible to authenticated admins/staff
*/

-- =====================
-- admin_profiles (created first so is_admin() can reference it)
-- =====================
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- Helper function: is_admin (SECURITY DEFINER so it can read admin_profiles regardless of RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = auth.uid()
  );
$$;

-- Admins can see all admin profiles
DROP POLICY IF EXISTS "admin_read_admin_profiles" ON public.admin_profiles;
CREATE POLICY "admin_read_admin_profiles"
  ON public.admin_profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- A user can read their own profile
DROP POLICY IF EXISTS "self_read_admin_profile" ON public.admin_profiles;
CREATE POLICY "self_read_admin_profile"
  ON public.admin_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Admins can insert profiles
DROP POLICY IF EXISTS "admin_insert_admin_profiles" ON public.admin_profiles;
CREATE POLICY "admin_insert_admin_profiles"
  ON public.admin_profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Admins can update profiles
DROP POLICY IF EXISTS "admin_update_admin_profiles" ON public.admin_profiles;
CREATE POLICY "admin_update_admin_profiles"
  ON public.admin_profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admins can delete profiles
DROP POLICY IF EXISTS "admin_delete_admin_profiles" ON public.admin_profiles;
CREATE POLICY "admin_delete_admin_profiles"
  ON public.admin_profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================
-- categories
-- =====================
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_categories" ON public.categories;
CREATE POLICY "public_read_categories"
  ON public.categories FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_categories" ON public.categories;
CREATE POLICY "admin_insert_categories"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_categories" ON public.categories;
CREATE POLICY "admin_update_categories"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_categories" ON public.categories;
CREATE POLICY "admin_delete_categories"
  ON public.categories FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================
-- parts
-- =====================
CREATE TABLE IF NOT EXISTS public.parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_code text NOT NULL UNIQUE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  brand text,
  part_number text,
  oem_number text,
  condition text NOT NULL DEFAULT 'used' CHECK (condition IN ('new', 'used', 'refurbished', 'for-parts')),
  price numeric(12,2),
  currency text NOT NULL DEFAULT 'USD',
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  location text,
  description text,
  is_published boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  show_price boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_published_parts" ON public.parts;
CREATE POLICY "public_read_published_parts"
  ON public.parts FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_parts" ON public.parts;
CREATE POLICY "admin_read_all_parts"
  ON public.parts FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_parts" ON public.parts;
CREATE POLICY "admin_insert_parts"
  ON public.parts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_parts" ON public.parts;
CREATE POLICY "admin_update_parts"
  ON public.parts FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_parts" ON public.parts;
CREATE POLICY "admin_delete_parts"
  ON public.parts FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================
-- part_photos
-- =====================
CREATE TABLE IF NOT EXISTS public.part_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  is_cover boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.part_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_published_part_photos" ON public.part_photos;
CREATE POLICY "public_read_published_part_photos"
  ON public.part_photos FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parts
      WHERE parts.id = part_photos.part_id
      AND parts.is_published = true
    )
  );

DROP POLICY IF EXISTS "admin_read_all_part_photos" ON public.part_photos;
CREATE POLICY "admin_read_all_part_photos"
  ON public.part_photos FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_part_photos" ON public.part_photos;
CREATE POLICY "admin_insert_part_photos"
  ON public.part_photos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_part_photos" ON public.part_photos;
CREATE POLICY "admin_update_part_photos"
  ON public.part_photos FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_part_photos" ON public.part_photos;
CREATE POLICY "admin_delete_part_photos"
  ON public.part_photos FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================
-- part_compatibility
-- =====================
CREATE TABLE IF NOT EXISTS public.part_compatibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  make text NOT NULL,
  model text NOT NULL,
  variant text,
  chassis_code text,
  engine_code text,
  year_from integer CHECK (year_from IS NULL OR (year_from >= 1900 AND year_from <= 2100)),
  year_to integer CHECK (year_to IS NULL OR (year_to >= 1900 AND year_to <= 2100)),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.part_compatibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_published_compatibility" ON public.part_compatibility;
CREATE POLICY "public_read_published_compatibility"
  ON public.part_compatibility FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parts
      WHERE parts.id = part_compatibility.part_id
      AND parts.is_published = true
    )
  );

DROP POLICY IF EXISTS "admin_read_all_compatibility" ON public.part_compatibility;
CREATE POLICY "admin_read_all_compatibility"
  ON public.part_compatibility FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_compatibility" ON public.part_compatibility;
CREATE POLICY "admin_insert_compatibility"
  ON public.part_compatibility FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_compatibility" ON public.part_compatibility;
CREATE POLICY "admin_update_compatibility"
  ON public.part_compatibility FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_compatibility" ON public.part_compatibility;
CREATE POLICY "admin_delete_compatibility"
  ON public.part_compatibility FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================
-- inquiries
-- =====================
CREATE TABLE IF NOT EXISTS public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid REFERENCES public.parts(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'responded', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_inquiries" ON public.inquiries;
CREATE POLICY "public_insert_inquiries"
  ON public.inquiries FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_read_inquiries" ON public.inquiries;
CREATE POLICY "admin_read_inquiries"
  ON public.inquiries FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_update_inquiries" ON public.inquiries;
CREATE POLICY "admin_update_inquiries"
  ON public.inquiries FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_inquiries" ON public.inquiries;
CREATE POLICY "admin_delete_inquiries"
  ON public.inquiries FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================
-- Indexes
-- =====================
CREATE INDEX IF NOT EXISTS idx_parts_category_id ON public.parts(category_id);
CREATE INDEX IF NOT EXISTS idx_parts_is_published ON public.parts(is_published);
CREATE INDEX IF NOT EXISTS idx_parts_is_featured ON public.parts(is_featured);
CREATE INDEX IF NOT EXISTS idx_parts_oem_number ON public.parts(oem_number);
CREATE INDEX IF NOT EXISTS idx_parts_part_number ON public.parts(part_number);
CREATE INDEX IF NOT EXISTS idx_parts_name ON public.parts(name);
CREATE INDEX IF NOT EXISTS idx_part_photos_part_id ON public.part_photos(part_id);
CREATE INDEX IF NOT EXISTS idx_part_compatibility_part_id ON public.part_compatibility(part_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_part_id ON public.inquiries(part_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON public.inquiries(created_at DESC);

-- =====================
-- updated_at trigger
-- =====================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parts_updated_at ON public.parts;
CREATE TRIGGER parts_updated_at BEFORE UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS categories_updated_at ON public.categories;
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS inquiries_updated_at ON public.inquiries;
CREATE TRIGGER inquiries_updated_at BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================
-- slugify helper
-- =====================
CREATE OR REPLACE FUNCTION public.slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        trim(input),
        '[^a-zA-Z0-9\s-]',
        '',
        'g'
      ),
      '\s+',
      '-',
      'g'
    )
  );
$$;

-- =====================
-- Storage bucket for part images
-- =====================
INSERT INTO storage.buckets (id, name, public)
VALUES ('part-images', 'part-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_part_images" ON storage.objects;
CREATE POLICY "public_read_part_images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'part-images');

DROP POLICY IF EXISTS "admin_insert_part_images" ON storage.objects;
CREATE POLICY "admin_insert_part_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'part-images' AND public.is_admin());

DROP POLICY IF EXISTS "admin_update_part_images" ON storage.objects;
CREATE POLICY "admin_update_part_images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'part-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'part-images' AND public.is_admin());

DROP POLICY IF EXISTS "admin_delete_part_images" ON storage.objects;
CREATE POLICY "admin_delete_part_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'part-images' AND public.is_admin());

-- =====================
-- Seed initial categories
-- =====================
INSERT INTO public.categories (name, slug, sort_order) VALUES
  ('Headlights', 'headlights', 1),
  ('Taillights', 'taillights', 2),
  ('Engines', 'engines', 3),
  ('Transmissions', 'transmissions', 4),
  ('Brakes', 'brakes', 5),
  ('Suspension', 'suspension', 6),
  ('Body Parts', 'body-parts', 7),
  ('Electrical', 'electrical', 8),
  ('Interior', 'interior', 9),
  ('Cooling System', 'cooling-system', 10),
  ('Exhaust', 'exhaust', 11),
  ('Filters', 'filters', 12)
ON CONFLICT (name) DO NOTHING;

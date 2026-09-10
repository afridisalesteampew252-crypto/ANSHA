/*
# Create vehicles table and storage bucket

## Purpose
Adds a vehicles feature so the site can showcase vehicles (for sale or for reference) with multiple photos, specs, and a public listing + detail page. Admin can add/edit/delete vehicles.

## New Tables
- `vehicles` — stores vehicle listings
  - `id` (uuid, PK)
  - `title` (text, not null) — display name e.g. "Toyota Aqua 2018"
  - `slug` (text, unique, not null) — URL slug
  - `make` (text, not null) — manufacturer e.g. "Toyota"
  - `model` (text, not null) — model e.g. "Aqua"
  - `variant` (text) — trim/variant
  - `year` (int) — model year
  - `chassis_code` (text) — chassis code e.g. "NHP10"
  - `engine_code` (text) — engine code
  - `transmission` (text) — e.g. "Automatic", "Manual"
  - `fuel_type` (text) — e.g. "Petrol", "Hybrid", "Diesel"
  - `mileage` (int) — mileage in km
  - `color` (text) — exterior color
  - `price` (numeric) — asking price (0 or null = ask price)
  - `currency` (text, default 'USD')
  - `show_price` (boolean, default false) — whether to show price publicly
  - `description` (text) — free-form description
  - `location` (text) — physical location
  - `is_published` (boolean, default false)
  - `is_featured` (boolean, default false)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

- `vehicle_photos` — stores photos for each vehicle
  - `id` (uuid, PK)
  - `vehicle_id` (uuid, FK -> vehicles.id ON DELETE CASCADE)
  - `storage_path` (text, not null) — path in the `vehicle-images` storage bucket
  - `is_cover` (boolean, default false)
  - `sort_order` (int, default 0)
  - `created_at` (timestamptz)

## Security
- RLS enabled on both `vehicles` and `vehicle_photos`.
- Since this app has an admin auth flow but public browsing, SELECT is open to `anon, authenticated` so public visitors can see published vehicles. INSERT/UPDATE/DELETE are restricted to `authenticated` users (admin staff).
- Storage bucket `vehicle-images` is created as public for image serving.

## Notes
1. Public visitors can browse published vehicles and their photos.
2. Only authenticated admin staff can create, update, or delete vehicles and photos.
3. Price display logic: if price is 0 or null or show_price is false, the UI shows "Ask Price".
*/

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  make text NOT NULL,
  model text NOT NULL,
  variant text,
  year int,
  chassis_code text,
  engine_code text,
  transmission text,
  fuel_type text,
  mileage int,
  color text,
  price numeric(12,2),
  currency text NOT NULL DEFAULT 'USD',
  show_price boolean NOT NULL DEFAULT false,
  description text,
  location text,
  is_published boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_is_published ON vehicles(is_published);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_featured ON vehicles(is_featured);
CREATE INDEX IF NOT EXISTS idx_vehicles_created_at ON vehicles(created_at DESC);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_vehicles" ON vehicles;
CREATE POLICY "public_select_vehicles"
ON vehicles FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_vehicles" ON vehicles;
CREATE POLICY "auth_insert_vehicles"
ON vehicles FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_vehicles" ON vehicles;
CREATE POLICY "auth_update_vehicles"
ON vehicles FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_vehicles" ON vehicles;
CREATE POLICY "auth_delete_vehicles"
ON vehicles FOR DELETE
TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS vehicle_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  is_cover boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_photos_vehicle_id ON vehicle_photos(vehicle_id);

ALTER TABLE vehicle_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_vehicle_photos" ON vehicle_photos;
CREATE POLICY "public_select_vehicle_photos"
ON vehicle_photos FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_vehicle_photos" ON vehicle_photos;
CREATE POLICY "auth_insert_vehicle_photos"
ON vehicle_photos FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_vehicle_photos" ON vehicle_photos;
CREATE POLICY "auth_update_vehicle_photos"
ON vehicle_photos FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_vehicle_photos" ON vehicle_photos;
CREATE POLICY "auth_delete_vehicle_photos"
ON vehicle_photos FOR DELETE
TO authenticated USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-images', 'vehicle-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_vehicle_images" ON storage.objects;
CREATE POLICY "public_read_vehicle_images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'vehicle-images');

DROP POLICY IF EXISTS "auth_insert_vehicle_images" ON storage.objects;
CREATE POLICY "auth_insert_vehicle_images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vehicle-images');

DROP POLICY IF EXISTS "auth_update_vehicle_images" ON storage.objects;
CREATE POLICY "auth_update_vehicle_images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'vehicle-images') WITH CHECK (bucket_id = 'vehicle-images');

DROP POLICY IF EXISTS "auth_delete_vehicle_images" ON storage.objects;
CREATE POLICY "auth_delete_vehicle_images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vehicle-images');

/*
# Create Blog System and Part Requests Tables

## Overview
This migration adds a complete blog system (categories + posts) and a part requests table
for customers who can't find a part in the catalog.

## New Tables

### blog_categories
- `id` (uuid, primary key)
- `name` (text, unique, not null) — category display name
- `slug` (text, unique, not null) — URL-friendly identifier
- `description` (text, nullable) — category description
- `created_at` (timestamptz, default now())

### blog_posts
- `id` (uuid, primary key)
- `title` (text, not null)
- `slug` (text, unique, not null) — SEO-friendly URL
- `excerpt` (text, nullable) — short summary for cards/listings
- `content` (text, nullable) — full article body (HTML or markdown)
- `featured_image` (text, nullable) — URL or storage path to hero image
- `category_id` (uuid, nullable, FK → blog_categories.id)
- `author_id` (uuid, nullable, FK → auth.users.id)
- `status` (text, not null, default 'draft') — draft | published | archived
- `is_featured` (boolean, default false)
- `meta_title` (text, nullable) — SEO title
- `meta_description` (text, nullable) — SEO description
- `published_at` (timestamptz, nullable) — when the post was published
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### part_requests
- `id` (uuid, primary key)
- `customer_name` (text, not null)
- `email` (text, nullable)
- `phone` (text, nullable)
- `vehicle_make` (text, nullable)
- `vehicle_model` (text, nullable)
- `vehicle_year` (text, nullable)
- `part_name` (text, nullable)
- `part_number` (text, nullable)
- `message` (text, nullable)
- `status` (text, not null, default 'new') — new | reviewed | fulfilled | closed
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

## Security (RLS)

### blog_categories
- Public read (anon + authenticated) — anyone can see categories
- No public write — only authenticated admin users can insert/update/delete

### blog_posts
- Public read for published posts only (status = 'published') — anyone can read published articles
- Authenticated users can read all posts (for admin management)
- Only authenticated users can insert/update/delete (admin management)

### part_requests
- Public insert (anon + authenticated) — anyone can submit a part request
- No public read — only authenticated admin users can view requests
- No public update/delete — only authenticated admin users can manage requests

## Indexes
- blog_posts.slug (unique)
- blog_posts.category_id
- blog_posts.status
- blog_posts.published_at
- blog_categories.slug (unique)
- part_requests.status
- part_requests.created_at
*/

-- Blog categories
CREATE TABLE IF NOT EXISTS blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_blog_categories" ON blog_categories;
CREATE POLICY "public_read_blog_categories"
  ON blog_categories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_blog_categories" ON blog_categories;
CREATE POLICY "auth_insert_blog_categories"
  ON blog_categories FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_blog_categories" ON blog_categories;
CREATE POLICY "auth_update_blog_categories"
  ON blog_categories FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_blog_categories" ON blog_categories;
CREATE POLICY "auth_delete_blog_categories"
  ON blog_categories FOR DELETE
  TO authenticated USING (true);

-- Blog posts
CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  excerpt text,
  content text,
  featured_image text,
  category_id uuid REFERENCES blog_categories(id) ON DELETE SET NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_featured boolean NOT NULL DEFAULT false,
  meta_title text,
  meta_description text,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_published_blog_posts" ON blog_posts;
CREATE POLICY "public_read_published_blog_posts"
  ON blog_posts FOR SELECT
  TO anon, authenticated USING (status = 'published');

DROP POLICY IF EXISTS "auth_read_all_blog_posts" ON blog_posts;
CREATE POLICY "auth_read_all_blog_posts"
  ON blog_posts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_blog_posts" ON blog_posts;
CREATE POLICY "auth_insert_blog_posts"
  ON blog_posts FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_blog_posts" ON blog_posts;
CREATE POLICY "auth_update_blog_posts"
  ON blog_posts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_blog_posts" ON blog_posts;
CREATE POLICY "auth_delete_blog_posts"
  ON blog_posts FOR DELETE
  TO authenticated USING (true);

-- Part requests
CREATE TABLE IF NOT EXISTS part_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  email text,
  phone text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year text,
  part_name text,
  part_number text,
  message text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'fulfilled', 'closed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE part_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_part_requests" ON part_requests;
CREATE POLICY "public_insert_part_requests"
  ON part_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_read_part_requests" ON part_requests;
CREATE POLICY "auth_read_part_requests"
  ON part_requests FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_part_requests" ON part_requests;
CREATE POLICY "auth_update_part_requests"
  ON part_requests FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_part_requests" ON part_requests;
CREATE POLICY "auth_delete_part_requests"
  ON part_requests FOR DELETE
  TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_category_id ON blog_posts(category_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_part_requests_status ON part_requests(status);
CREATE INDEX IF NOT EXISTS idx_part_requests_created_at ON part_requests(created_at DESC);

-- Updated_at trigger for blog_posts
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_posts_updated_at ON blog_posts;
CREATE TRIGGER blog_posts_updated_at BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS part_requests_updated_at ON part_requests;
CREATE TRIGGER part_requests_updated_at BEFORE UPDATE ON part_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

/*
# Add image_url column to categories

## Purpose
Adds an image_url column to the categories table so each category can display a representative photo on the homepage and categories page.

## Changes
- `categories.image_url` (text, nullable) — URL to a category image

## Security
- No security changes needed. Existing RLS policies cover the new column.
*/

ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url text;

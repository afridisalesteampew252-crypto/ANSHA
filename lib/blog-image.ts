import { siteConfig } from '@/lib/site-config';

/** Resolve a blog featured_image value to a URL for cards, heroes, and OG tags. */
export function blogImageUrl(
  featuredImage: string | null | undefined,
  options?: { absolute?: boolean },
): string | null {
  if (!featuredImage?.trim()) return null;
  const value = featuredImage.trim();
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) {
    if (options?.absolute) {
      const base = (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, '');
      return `${base}${value}`;
    }
    return value;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/blog-images/${value}`;
}

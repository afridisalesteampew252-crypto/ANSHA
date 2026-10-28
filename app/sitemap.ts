import type { MetadataRoute } from 'next';
import { EXPORT_MARKETS } from '@/lib/export-markets';
import { siteConfig } from '@/lib/site-config';
import { createPublicSupabaseClient } from '@/lib/supabase/public';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;
  const supabase = createPublicSupabaseClient();

  // Static pages do not get a synthetic `lastModified: new Date()` value. A false fresh date
  // on every sitemap regeneration weakens the usefulness of lastmod for search engines.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/parts`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/vehicles`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/machinery`, changeFrequency: 'daily', priority: 0.85 },
    { url: `${baseUrl}/categories`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/blog`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/reviews`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/offers`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/contact`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/cookie-policy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/banking`, changeFrequency: 'monthly', priority: 0.4 },
  ];

  try {
    const [{ data: posts }, { data: parts }, { data: vehicles }, { data: categories }] = await Promise.all([
      supabase.from('blog_posts').select('slug, updated_at').eq('status', 'published'),
      supabase.from('parts').select('slug, updated_at').eq('is_published', true).eq('stock_status', 'available'),
      supabase.from('vehicles').select('slug, updated_at').eq('is_published', true).eq('stock_status', 'available'),
      supabase.from('categories').select('slug, updated_at'),
    ]);

    /** Markets share the global published vehicle pool — skip when that pool is empty (noindex). */
    const marketRoutes: MetadataRoute.Sitemap =
      (vehicles || []).length > 0
        ? EXPORT_MARKETS.map((market) => ({
            url: `${baseUrl}/markets/${market.code.toLowerCase()}`,
            changeFrequency: 'weekly' as const,
            priority: 0.65,
          }))
        : [];

    const blogRoutes: MetadataRoute.Sitemap = (posts || []).map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

    const inventoryRoutes: MetadataRoute.Sitemap = [
      ...(parts || []).map((item) => ({
        url: `${baseUrl}/parts/${item.slug}`,
        lastModified: new Date(item.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
      ...(vehicles || []).map((item) => ({
        url: `${baseUrl}/vehicles/${item.slug}`,
        lastModified: new Date(item.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
      ...(categories || []).map((item) => ({
        url: `${baseUrl}/categories/${item.slug}`,
        lastModified: new Date(item.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    ];

    return [...staticRoutes, ...marketRoutes, ...inventoryRoutes, ...blogRoutes];
  } catch {
    return staticRoutes;
  }
}

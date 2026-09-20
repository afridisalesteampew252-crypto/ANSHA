import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site-config';
import { supabase } from '@/lib/supabase/client';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/parts`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/vehicles`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/machinery`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.85 },
    { url: `${baseUrl}/categories`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/reviews`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/offers`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/cookie-policy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/banking`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  ];

  try {
    const [{ data: posts }, { data: parts }, { data: vehicles }, { data: categories }] = await Promise.all([
      supabase.from('blog_posts').select('slug, updated_at').eq('status', 'published'),
      supabase.from('parts').select('slug, updated_at').eq('is_published', true).eq('stock_status', 'available'),
      supabase.from('vehicles').select('slug, updated_at').eq('is_published', true).eq('stock_status', 'available'),
      supabase.from('categories').select('slug, updated_at'),
    ]);

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

    return [...staticRoutes, ...inventoryRoutes, ...blogRoutes];
  } catch {
    return staticRoutes;
  }
}

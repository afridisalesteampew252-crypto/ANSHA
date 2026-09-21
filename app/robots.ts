import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site-config';

/**
 * Crawl rules for public content. Auth still protects private data —
 * robots is not a security boundary.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/portal', '/api'],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}

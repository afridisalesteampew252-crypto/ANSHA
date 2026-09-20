import { siteConfig } from '@/lib/site-config';

/** Default social / share image (1200×630). Stable public URL for Google & crawlers. */
export const defaultOgImagePath = '/images/og-default.jpg';

export const defaultOgImage = {
  url: defaultOgImagePath,
  width: 1200,
  height: 630,
  alt: `${siteConfig.name} — vehicles and auto parts exporter`,
} as const;

/** Favicon Google recommends: square, >48px, crawlable, stable URL. */
export const favicon48Path = '/icons/favicon-48.png';

export function absoluteMediaUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${siteConfig.url}${normalized}`;
}

import type { Metadata } from 'next';
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

const DEFAULT_DESCRIPTION_MAX = 160;

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

/** Collapse whitespace / control noise for titles (single source for metadata). */
export function sanitizeTitle(title: string) {
  return collapseWhitespace(title.replace(/[\u0000-\u001F\u007F]/g, ''));
}

/** Collapse whitespace and soft-trim long descriptions for meta/OG. */
export function sanitizeDescription(description: string, maxLength = DEFAULT_DESCRIPTION_MAX) {
  const cleaned = collapseWhitespace(description.replace(/[\u0000-\u001F\u007F]/g, ''));
  if (cleaned.length <= maxLength) return cleaned;
  const truncated = cleaned.slice(0, maxLength - 1);
  const lastSpace = truncated.lastIndexOf(' ');
  const body = (lastSpace > Math.floor(maxLength * 0.5) ? truncated.slice(0, lastSpace) : truncated).trimEnd();
  return `${body}…`;
}

/** Absolute URL on the canonical site origin (never localhost/preview). */
export function absoluteUrl(path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/') return siteConfig.url;
  return `${siteConfig.url}${normalized}`;
}

export function absoluteMediaUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return absoluteUrl(normalized);
}

/**
 * Inventory image alt from real title / year-make-model only.
 * Never invents angles, grades, condition claims, or keyword stuffing.
 */
export function vehicleImageAlt(
  vehicle: {
    title?: string | null;
    year?: number | string | null;
    make?: string | null;
    model?: string | null;
  },
  options?: { photoIndex?: number },
) {
  const fromFields = [vehicle.year, vehicle.make, vehicle.model]
    .map((part) => (part == null || part === '' ? '' : String(part)))
    .filter(Boolean)
    .join(' ')
    .trim();
  const base = collapseWhitespace(fromFields || vehicle.title || 'Vehicle');
  const index = options?.photoIndex;
  if (index != null && index >= 1) return `${base} — photo ${index}`;
  return base;
}

/** Part image alt from real name (and brand when not already in the name). */
export function partImageAlt(
  part: { name?: string | null; brand?: string | null },
  options?: { photoIndex?: number },
) {
  const name = collapseWhitespace(part.name || 'Part');
  const brand = collapseWhitespace(part.brand || '');
  const base =
    brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name;
  const index = options?.photoIndex;
  if (index != null && index >= 1) return `${base} — photo ${index}`;
  return base;
}

export type BuildPageMetadataInput = {
  title: string;
  description: string;
  /** Pathname for canonical + OG url, e.g. `/about` or `/`. */
  path: string;
  image?: {
    url: string;
    width?: number;
    height?: number;
    alt?: string;
  };
  noIndex?: boolean;
  /** When noIndex, whether crawlers may follow links (default false). */
  followWhenNoIndex?: boolean;
  /** Skip root title template (`%s | ANSHA TRADING`). */
  absoluteTitle?: boolean;
};

/**
 * Remove a trailing brand suffix (e.g. "… | ANSHA Trading", "… - ANSHA TRADING CO") from a
 * page title. The root layout template already appends "| ANSHA TRADING", so stored SEO
 * titles that include the brand would otherwise render it twice.
 */
export function stripTrailingBrand(title: string) {
  const suffix = /\s*[|\-–—:]\s*ansha(?:\s+trading)?(?:\s+(?:co\.?|company|llc|fze))?\.?\s*$/i;
  let current = title.trim();
  while (suffix.test(current)) {
    const next = current.replace(suffix, '').trim();
    if (!next) break;
    current = next;
  }
  return current || title;
}

/**
 * Shared Metadata for public pages: title, description, canonical, Open Graph, Twitter.
 * Callers pass real copy only — do not invent specs, prices, or claims here.
 */
export function buildPageMetadata(input: BuildPageMetadataInput): Metadata {
  const title = input.absoluteTitle
    ? sanitizeTitle(input.title)
    : stripTrailingBrand(sanitizeTitle(input.title));
  const description = sanitizeDescription(input.description);
  const canonicalPath = input.path.startsWith('/') ? input.path : `/${input.path}`;
  const pageUrl = absoluteUrl(canonicalPath);

  const imageUrl = absoluteMediaUrl(input.image?.url ?? defaultOgImage.url);
  const image = {
    url: imageUrl,
    width: input.image?.width ?? defaultOgImage.width,
    height: input.image?.height ?? defaultOgImage.height,
    alt: input.image?.alt ?? title,
  };

  return {
    title: input.absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: siteConfig.name,
      type: 'website',
      locale: 'en_AE',
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
    ...(input.noIndex
      ? { robots: { index: false, follow: input.followWhenNoIndex === true } }
      : {}),
  };
}

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** True when the URL carries any non-empty query value (faceted / sorted / paginated listings). */
export function hasListingFacetParams(searchParams: SearchParamsRecord | null | undefined) {
  if (!searchParams) return false;
  return Object.values(searchParams).some((value) => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.some((item) => String(item).trim().length > 0);
    return String(value).trim().length > 0;
  });
}

/**
 * Listing hub metadata: clean URL is indexable; any filter/sort/page query
 * canonicalizes to the parent path and is noindex (avoid facet URL bloat).
 */
export function buildListingPageMetadata(input: {
  title: string;
  description: string;
  /** Clean listing path, e.g. `/vehicles`. */
  path: string;
  searchParams?: SearchParamsRecord | null;
  image?: BuildPageMetadataInput['image'];
}): Metadata {
  const faceted = hasListingFacetParams(input.searchParams);
  return buildPageMetadata({
    title: input.title,
    description: input.description,
    path: input.path,
    image: input.image,
    noIndex: faceted,
    followWhenNoIndex: true,
  });
}

/** Prefer year/make/model when present; otherwise fall back to stored title. */
export function vehicleListingTitle(input: {
  title?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  variant?: string | null;
}) {
  const ymm = [input.year, input.make, input.model, input.variant]
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean)
    .join(' ');
  const stored = input.title?.trim() || '';
  return sanitizeTitle(ymm || stored || 'Vehicle');
}

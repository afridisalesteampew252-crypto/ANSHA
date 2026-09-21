import { absoluteMediaUrl, absoluteUrl, defaultOgImage } from '@/lib/seo';
import { siteConfig } from '@/lib/site-config';

export type BreadcrumbCrumb = {
  name: string;
  /** Pathname or absolute URL. Omit for the current (non-linked) crumb. */
  href?: string;
};

export type ItemListEntry = {
  name: string;
  url: string;
  image?: string | null;
};

/** Single-source Organization graph for the root layout only — do not re-emit on child pages. */
export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: siteConfig.url,
    email: siteConfig.email,
    telephone: siteConfig.phone,
    description: siteConfig.description,
    taxID: siteConfig.taxRegistrationNumber,
    logo: absoluteMediaUrl('/icons/icon-512.png'),
    image: absoluteMediaUrl(defaultOgImage.url),
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Meydan Grandstand, 6th Floor, Meydan Road, Nad Al Sheba',
      addressLocality: 'Dubai',
      addressCountry: 'AE',
    },
  };
}

/** Single-source WebSite graph for the root layout only — do not re-emit on child pages. */
export function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteConfig.url}/parts?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildBreadcrumbListJsonLd(items: BreadcrumbCrumb[]) {
  const list = items.filter((item) => item.name.trim().length > 0);
  if (list.length < 2) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list.map((item, index) => {
      const entry: Record<string, unknown> = {
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
      };
      if (item.href) {
        entry.item = item.href.startsWith('http') ? item.href : absoluteUrl(item.href);
      }
      return entry;
    }),
  };
}

export function buildItemListJsonLd(input: {
  name: string;
  description?: string;
  url: string;
  items: ItemListEntry[];
}) {
  if (!input.items.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    description: input.description || undefined,
    url: input.url.startsWith('http') ? input.url : absoluteUrl(input.url),
    numberOfItems: input.items.length,
    itemListElement: input.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: item.url.startsWith('http') ? item.url : absoluteUrl(item.url),
      name: item.name,
      ...(item.image ? { image: item.image.startsWith('http') ? item.image : absoluteMediaUrl(item.image) } : {}),
    })),
  };
}

export function buildArticleJsonLd(input: {
  headline: string;
  description?: string | null;
  url: string;
  datePublished?: string | null;
  dateModified?: string | null;
  image?: string | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline,
    description: input.description || undefined,
    datePublished: input.datePublished || undefined,
    dateModified: input.dateModified || input.datePublished || undefined,
    image: input.image || undefined,
    author: { '@type': 'Organization', name: siteConfig.name },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.url,
      logo: {
        '@type': 'ImageObject',
        url: absoluteMediaUrl('/icons/icon-512.png'),
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': input.url.startsWith('http') ? input.url : absoluteUrl(input.url),
    },
  };
}

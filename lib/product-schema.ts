import type { Review } from '@/lib/types';

/** Positive catalog amount suitable for Product Offer.price */
export function positiveCatalogPrice(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

/**
 * Resolve a public offer price for JSON-LD.
 * Prefer deal → list → FOB → C&F → CIF. Only uses term prices when showPrice is on
 * (same visibility as the public UI). Returns null when nothing valid is publishable.
 */
export function resolveProductOfferPrice(input: {
  dealPrice?: number | null;
  showPrice: boolean;
  price?: number | null;
  priceFob?: number | null;
  priceCf?: number | null;
  priceCif?: number | null;
}): number | null {
  const deal = positiveCatalogPrice(input.dealPrice);
  if (deal != null) return deal;
  if (!input.showPrice) return null;
  return (
    positiveCatalogPrice(input.price) ??
    positiveCatalogPrice(input.priceFob) ??
    positiveCatalogPrice(input.priceCf) ??
    positiveCatalogPrice(input.priceCif)
  );
}

export type ProductOfferAvailability =
  | 'https://schema.org/InStock'
  | 'https://schema.org/OutOfStock'
  | 'https://schema.org/SoldOut'
  | 'https://schema.org/LimitedAvailability';

/**
 * Build schema.org Offer only when price + currency are valid.
 * Omitting offers avoids GSC "price or priceSpecification.price" errors.
 */
export function buildProductOffer(input: {
  price: number | null;
  currency: string | null | undefined;
  url: string;
  availability: ProductOfferAvailability;
}): Record<string, unknown> | undefined {
  const price = positiveCatalogPrice(input.price);
  const currency = (input.currency || '').trim();
  if (price == null || !currency) return undefined;

  return {
    '@type': 'Offer',
    availability: input.availability,
    priceCurrency: currency,
    price,
    url: input.url,
  };
}

/** Real published testimonials → Product aggregateRating + review (never invented). */
export function buildProductReviewFields(
  reviews: Review[],
  itemReviewed: { name: string; url: string },
): { aggregateRating?: Record<string, unknown>; review?: Record<string, unknown>[] } {
  const published = reviews.filter(
    (r) => r.is_published && r.rating >= 1 && r.rating <= 5 && (r.quote || '').trim().length > 0,
  );
  if (published.length === 0) return {};

  const ratingSum = published.reduce((sum, r) => sum + r.rating, 0);
  const ratingValue = Math.round((ratingSum / published.length) * 10) / 10;

  return {
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue,
      bestRating: 5,
      worstRating: 1,
      reviewCount: published.length,
    },
    review: published.slice(0, 10).map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.name },
      reviewBody: r.quote,
      reviewRating: {
        '@type': 'Rating',
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1,
      },
      itemReviewed: {
        '@type': 'Product',
        name: itemReviewed.name,
        url: itemReviewed.url,
      },
    })),
  };
}

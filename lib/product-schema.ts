/** Positive catalog amount suitable for Product Offer.price */
export function positiveCatalogPrice(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

/**
 * Resolve a public offer price for JSON-LD.
 * Prefer deal → FOB → legacy list price → C&F → CIF. Only uses term prices when showPrice is on
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
    positiveCatalogPrice(input.priceFob) ??
    positiveCatalogPrice(input.price) ??
    positiveCatalogPrice(input.priceCf) ??
    positiveCatalogPrice(input.priceCif)
  );
}

/**
 * Public catalog card / hero price label.
 * Mirrors resolveProductOfferPrice (deal → FOB → legacy list price → C&F → CIF); never invents amounts.
 */
/**
 * Public card prices for the explicitly configured export terms.
 * Older records with only the legacy price keep the neutral "Export price" label.
 */
export function publicPriceLines(input: {
  showPrice: boolean;
  stockStatus?: string | null;
  price?: number | null;
  priceFob?: number | null;
  priceCf?: number | null;
  priceCif?: number | null;
}): Array<{ label: string; amount: number }> {
  if (!input.showPrice || input.stockStatus === 'sold') return [];

  const termPrices = [
    { label: 'FOB', amount: positiveCatalogPrice(input.priceFob) },
    { label: 'C&F', amount: positiveCatalogPrice(input.priceCf) },
    { label: 'CIF', amount: positiveCatalogPrice(input.priceCif) },
  ].filter((line): line is { label: string; amount: number } => line.amount != null);

  if (termPrices.length > 0) return termPrices;

  const legacyPrice = positiveCatalogPrice(input.price);
  return legacyPrice == null ? [] : [{ label: 'Export price', amount: legacyPrice }];
}

export function publicPriceLabel(input: {
  currency?: string | null;
  stockStatus?: string | null;
  dealPrice?: number | null;
  showPrice: boolean;
  price?: number | null;
  priceFob?: number | null;
  priceCf?: number | null;
  priceCif?: number | null;
  /** When sold, prefer this over quote/price text. Default "Sold". */
  soldLabel?: string;
  /** When nothing publishable. Default "Ask for quote". */
  askLabel?: string;
}): string {
  if (input.stockStatus === 'sold') return input.soldLabel ?? 'Sold';
  const amount = resolveProductOfferPrice(input);
  const currency = (input.currency || '').trim();
  if (amount != null && currency) {
    return `${currency} ${amount.toLocaleString()}`;
  }
  return input.askLabel ?? 'Ask for quote';
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

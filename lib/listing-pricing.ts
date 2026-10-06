import { positiveCatalogPrice, publicPriceLabel, resolveProductOfferPrice } from '@/lib/product-schema';
import { effectiveDealPrice } from '@/lib/site-offers';
import type { SiteOffer } from '@/lib/types';

export type ListingPriceInput = {
  currency: string | null | undefined;
  stock_status?: string | null;
  show_price: boolean | null | undefined;
  price: number | null | undefined;
  price_fob: number | null | undefined;
  price_cf: number | null | undefined;
  price_cif: number | null | undefined;
};

export type ListingPricing = {
  /** Undiscounted list amount used as the deal baseline (null when prices are hidden). */
  listingPrice: number | null;
  dealPrice: number | null;
  displayPrice: number | null;
  priceLabel: string;
  /**
   * The amount the detail page visibly renders, or null when it shows "Ask for quote".
   * JSON-LD Offer.price must use exactly this value so structured data never advertises a
   * price that the page does not show.
   */
  visiblePrice: number | null;
};

/**
 * Single source of truth for detail-page pricing, used by BOTH the server page (JSON-LD)
 * and the client view, so the two can never disagree.
 * `basis`: vehicles discount from FOB (falling back to the legacy list price); parts from
 * the legacy list price (existing behaviour of each page).
 */
export function resolveListingPricing(
  item: ListingPriceInput,
  deal: Pick<SiteOffer, 'sale_price' | 'discount_percent'> | null | undefined,
  options: { basis: 'fob' | 'price'; askLabel?: string }
): ListingPricing {
  const showPrice = Boolean(item.show_price);
  const listingPrice = !showPrice
    ? null
    : options.basis === 'fob'
      ? positiveCatalogPrice(item.price_fob) ?? positiveCatalogPrice(item.price)
      : positiveCatalogPrice(item.price);
  const dealPrice = deal ? effectiveDealPrice(listingPrice, deal) : null;
  const priceInput = {
    dealPrice,
    showPrice,
    price: item.price,
    priceFob: item.price_fob,
    priceCf: item.price_cf,
    priceCif: item.price_cif,
  };
  const displayPrice = resolveProductOfferPrice(priceInput);
  const priceLabel = publicPriceLabel({
    ...priceInput,
    currency: item.currency,
    stockStatus: item.stock_status,
    ...(options.askLabel ? { askLabel: options.askLabel } : {}),
  });
  const hasCurrency = Boolean((item.currency || '').trim());
  const visiblePrice =
    item.stock_status === 'sold'
      ? null
      : dealPrice != null
        ? dealPrice
        : displayPrice != null && hasCurrency
          ? displayPrice
          : null;
  return { listingPrice, dealPrice, displayPrice, priceLabel, visiblePrice };
}

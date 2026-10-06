import type { SiteOffer } from '@/lib/types';

export type InventoryPick = {
  id: string;
  label: string;
  slug: string;
};

/** Resolve public CTA path from offer inventory links or manual href. */
export function resolveOfferHref(offer: Pick<SiteOffer, 'href' | 'vehicle_id' | 'part_id'> & {
  vehicle_slug?: string | null;
  part_slug?: string | null;
}): string {
  if (offer.vehicle_id && offer.vehicle_slug) return `/vehicles/${offer.vehicle_slug}`;
  if (offer.part_id && offer.part_slug) return `/parts/${offer.part_slug}`;
  const href = (offer.href || '/offers').trim();
  return href.startsWith('/') ? href : `/${href}`;
}

export function formatDealDiscount(percent: number | null | undefined): string | null {
  if (percent == null || Number.isNaN(Number(percent)) || Number(percent) <= 0) return null;
  const n = Number(percent);
  return Number.isInteger(n) ? `${n}% off` : `${n.toFixed(1)}% off`;
}

export function formatDealSalePrice(
  salePrice: number | null | undefined,
  currency = 'USD',
): string | null {
  if (salePrice == null || Number.isNaN(Number(salePrice)) || Number(salePrice) < 0) return null;
  return `${currency} ${Number(salePrice).toLocaleString('en-US')}`;
}

/** Effective display price: sale_price, else list × (1 − discount%), else null. */
export function effectiveDealPrice(
  listPrice: number | null | undefined,
  offer: Pick<SiteOffer, 'sale_price' | 'discount_percent'>,
): number | null {
  if (offer.sale_price != null && Number(offer.sale_price) >= 0) return Number(offer.sale_price);
  if (
    listPrice != null &&
    listPrice > 0 &&
    offer.discount_percent != null &&
    Number(offer.discount_percent) > 0
  ) {
    return Math.round(listPrice * (1 - Number(offer.discount_percent) / 100) * 100) / 100;
  }
  return null;
}

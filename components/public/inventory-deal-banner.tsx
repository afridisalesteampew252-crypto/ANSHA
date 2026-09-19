'use client';

import Link from 'next/link';
import { ArrowRight, Tag } from 'lucide-react';
import { formatDealDiscount, formatDealSalePrice } from '@/lib/site-offers';
import type { SiteOffer } from '@/lib/types';

type Props = {
  offer: SiteOffer;
  currency?: string;
  listPrice?: number | null;
  className?: string;
};

export function InventoryDealBanner({ offer, currency = 'USD', listPrice, className }: Props) {
  const discountLabel = formatDealDiscount(offer.discount_percent);
  const saleLabel = formatDealSalePrice(offer.sale_price, currency);
  const showStruck =
    listPrice != null &&
    listPrice > 0 &&
    ((offer.sale_price != null && offer.sale_price < listPrice) ||
      (offer.discount_percent != null && offer.discount_percent > 0));

  return (
    <aside
      className={`relative overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/[0.12] via-accent/[0.06] to-transparent p-4 sm:p-5 ${className || ''}`}
    >
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/15 blur-2xl" aria-hidden />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">
            <Tag className="h-3.5 w-3.5" />
            Active deal
          </p>
          <h2 className="text-base font-bold leading-snug sm:text-lg">{offer.title}</h2>
          {offer.summary ? (
            <p className="text-sm leading-6 text-muted-foreground">{offer.summary}</p>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
            {discountLabel ? (
              <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-white">
                {discountLabel}
              </span>
            ) : null}
            {saleLabel ? (
              <span className="text-lg font-extrabold tracking-tight">{saleLabel}</span>
            ) : null}
            {showStruck ? (
              <span className="text-sm text-muted-foreground line-through">
                {currency} {listPrice!.toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
        <Link
          href="/offers"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-accent/30 bg-background px-4 text-sm font-bold text-foreground transition hover:border-accent hover:text-accent"
        >
          All deals <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </aside>
  );
}

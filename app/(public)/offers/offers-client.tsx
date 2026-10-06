'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRight, CarFront, Package, Tag } from 'lucide-react';
import { formatDealDiscount, formatDealSalePrice } from '@/lib/site-offers';
import type { SiteOffer } from '@/lib/types';

export type OfferRow = SiteOffer & {
  vehicles?: { slug: string; title: string; currency: string } | null;
  parts?: { slug: string; name: string; currency: string } | null;
};

/** Offers are loaded on the server (ISR) and passed in, so they are in the initial HTML. */
export default function PublicOffersPage({ rows }: { rows: OfferRow[] }) {
  return (
    <>
      <section className="relative overflow-hidden bg-[#101114] py-12 text-white sm:py-16">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_78%_20%,rgba(220,38,38,.4),transparent_32%),linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:auto,44px_44px,44px_44px]" />
        <div className="container-page relative">
          <span className="eyebrow text-accent">Deals and offers</span>
          <h1 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-5xl">Current export offers</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
            Published promotions from ANSHA Trading — including inventory-linked vehicle and parts deals.
          </p>
        </div>
      </section>
      <div className="surface-featured border-t border-accent/10">
      <div className="container-page py-8 sm:py-12">
        {rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-accent/20 bg-card py-16 text-center">
            <Tag className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <h2 className="mt-4 text-xl font-extrabold">No live offers right now</h2>
            <p className="mt-1 text-sm text-muted-foreground">Check back soon or browse the parts catalog.</p>
            <Link href="/parts" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-accent">
              Browse parts <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((row) => {
              const discountLabel = formatDealDiscount(row.discount_percent);
              const currency = row.vehicles?.currency || row.parts?.currency || 'USD';
              const saleLabel = formatDealSalePrice(row.sale_price, currency);
              const inventoryHint = row.vehicles?.title
                ? { icon: CarFront, label: row.vehicles.title }
                : row.parts?.name
                  ? { icon: Package, label: row.parts.name }
                  : null;
              return (
                <li
                  key={row.id}
                  className="catalog-panel p-5 transition duration-300 hover:border-accent/40 hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {discountLabel ? (
                          <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-white">
                            {discountLabel}
                          </span>
                        ) : null}
                        {saleLabel ? (
                          <span className="text-sm font-extrabold tracking-tight">{saleLabel}</span>
                        ) : null}
                      </div>
                      <h2 className="text-lg font-bold leading-snug sm:text-xl">{row.title}</h2>
                      {row.summary ? <p className="text-sm leading-6 text-muted-foreground">{row.summary}</p> : null}
                      {inventoryHint ? (
                        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <inventoryHint.icon className="h-3.5 w-3.5 text-accent" />
                          {inventoryHint.label}
                        </p>
                      ) : null}
                      {row.published_at ? (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(row.published_at), 'dd MMM yyyy')}
                        </p>
                      ) : null}
                    </div>
                    <Link
                      href={row.href}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-white transition hover:bg-accent/90 sm:w-auto"
                    >
                      View deal <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      </div>
    </>
  );
}

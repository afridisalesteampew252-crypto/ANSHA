'use client';

import Link from 'next/link';
import { ArrowUpRight, Images, MessageCircle, PackageCheck, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/public/brand-logo';
import { CatalogImage, publicPartImageUrl } from '@/components/public/catalog-image';
import { StockOriginBadge } from '@/components/public/stock-origin-badge';
import { SaveItemActions, toPartSaveItem } from '@/components/public/save-item-actions';
import { effectiveDealPrice, formatDealDiscount } from '@/lib/site-offers';
import { publicPriceLabel, publicPriceLines } from '@/lib/product-schema';
import { partImageAlt } from '@/lib/seo';
import { conditionLabels, siteConfig } from '@/lib/site-config';
import type { PublicPartCard } from '@/lib/public-card-data';
import type { SiteOffer } from '@/lib/types';

interface PartCardProps {
  part: PublicPartCard;
  priority?: boolean;
  deal?: SiteOffer | null;
}

export function PartCard({ part, priority = false, deal = null }: PartCardProps) {
  const coverPhoto = part.part_photos?.find((photo) => photo.is_cover) || part.part_photos?.[0];
  const compatibility = part.part_compatibility?.[0];
  const photoUrl = coverPhoto ? publicPartImageUrl(coverPhoto.storage_path) : null;
  const imageAlt = partImageAlt(part);
  const listPrice = part.show_price && part.price && part.price > 0 ? Number(part.price) : null;
  const dealPrice =
    part.stock_status !== 'sold' && deal ? effectiveDealPrice(listPrice, deal) : null;
  const discountLabel = deal ? formatDealDiscount(deal.discount_percent) : null;
  const priceLabel = publicPriceLabel({
    currency: part.currency,
    stockStatus: part.stock_status,
    dealPrice,
    showPrice: Boolean(part.show_price),
    price: part.price,
    priceFob: part.price_fob,
    priceCf: part.price_cf,
    priceCif: part.price_cif,
  });
  const catalogPriceLines = publicPriceLines({
    showPrice: Boolean(part.show_price),
    stockStatus: part.stock_status,
    price: part.price,
    priceFob: part.price_fob,
    priceCf: part.price_cf,
    priceCif: part.price_cif,
  });
  const savedPriceLabel = dealPrice != null ? priceLabel : catalogPriceLines.length > 0
    ? catalogPriceLines.map((line) => `${line.label} ${part.currency} ${line.amount.toLocaleString()}`).join(' · ')
    : priceLabel;
  const oemOrCode = part.oem_number || part.part_code;
  const waMessage = `Hello ${siteConfig.name}, I'm interested in ${part.name} (${part.part_code}). Is it available?`;
  const waHref = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(waMessage)}`;
  const saveItem = toPartSaveItem({
    id: part.id,
    slug: part.slug,
    name: part.name,
    part_code: part.part_code,
    priceLabel: savedPriceLabel,
    imageUrl: photoUrl,
  });

  return (
    <article className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/85 bg-card text-card-foreground shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition duration-300 before:absolute before:inset-x-0 before:top-0 before:z-20 before:h-1 before:bg-gradient-to-r before:from-[#f47a1f] before:via-[#f2a900] before:to-[#d21e1e] hover:-translate-y-1 hover:border-[#f47a1f]/55 hover:shadow-[0_18px_40px_rgba(15,23,42,0.12),0_0_0_1px_rgba(244,122,31,0.12)]">
      <div className="relative min-w-0">
        <Link href={`/parts/${part.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-gradient-to-br from-orange-500/[0.07] via-background to-red-500/[0.04]">
          {photoUrl ? (
            <CatalogImage
              src={photoUrl}
              alt={imageAlt}
              fill
              priority={priority}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="p-2.5 transition-transform duration-500 group-hover:scale-[1.04] sm:p-4"
              objectFit="contain"
            />
          ) : (
            <span className="flex h-full items-center justify-center">
              <Wrench className="h-10 w-10 text-muted-foreground/25 sm:h-12 sm:w-12" />
            </span>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#101114]/55 to-transparent opacity-80" />
          {part.stock_status === 'sold' && (
            <span className="absolute inset-0 grid place-items-center bg-[#101114]/40 text-2xl font-black uppercase tracking-[0.2em] text-white sm:text-3xl">
              Sold
            </span>
          )}
          {(part.part_photos?.length || 0) > 0 && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-[#101114]/85 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur sm:bottom-2.5 sm:left-2.5 sm:px-2 sm:py-1 sm:text-[10px]">
              <Images className="h-3 w-3" />
              Photos: {part.part_photos?.length}
            </span>
          )}
        </Link>

        {/* Keep overlays to origin (left) + save actions (right) so badges never collide on ~170px cards */}
        <div className="pointer-events-none absolute inset-x-1.5 top-1.5 flex items-start justify-between gap-1 sm:inset-x-2.5 sm:top-2.5 sm:gap-2">
          <div className="pointer-events-auto max-w-[58%] min-w-0">
            <StockOriginBadge origin={part.stock_origin} compact className="border border-foreground/15" />
          </div>
          <div className="pointer-events-auto shrink-0">
            <SaveItemActions item={saveItem} size="xs" className="gap-1" />
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-2.5 sm:p-4">
        <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1">
          {part.is_featured ? (
            <Badge className="h-5 border-0 bg-gradient-to-r from-[#f47a1f] to-[#d21e1e] px-1.5 text-[9px] text-white shadow-sm sm:text-[10px]">Featured</Badge>
          ) : (
            <Badge className="h-5 border border-foreground/10 bg-secondary/80 px-1.5 text-[9px] capitalize text-foreground sm:text-[10px]">
              {conditionLabels[part.condition] || part.condition}
            </Badge>
          )}
          {part.stock_status !== 'sold' && part.quantity > 0 && (
            <Badge className="h-5 gap-0.5 border border-orange-500/30 bg-orange-500/10 px-1.5 text-[9px] text-orange-800 dark:text-orange-200 sm:text-[10px]">
              <PackageCheck className="h-2.5 w-2.5 text-accent" />
              Stock
            </Badge>
          )}
        </div>

        <span className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-orange-700 dark:text-orange-300 sm:text-[10px] sm:tracking-[0.14em]">
          {part.categories?.name || 'Automotive part'}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] font-semibold text-foreground/75 sm:text-[11px]" title={oemOrCode}>
          {oemOrCode}
        </span>

        <Link href={`/parts/${part.slug}`} className="mt-1 min-w-0">
          <h3 className="line-clamp-2 min-h-[2.4rem] text-[13px] font-bold leading-snug text-foreground transition-colors group-hover:text-accent sm:min-h-[2.5rem] sm:text-[15px]">
            {part.name}
          </h3>
        </Link>

        {part.brand && (
          <div className="mt-1.5 min-w-0">
            <BrandLogo brand={part.brand} size="sm" />
          </div>
        )}
        {compatibility && (
          <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground sm:mt-1.5 sm:text-xs">
            Fits {compatibility.make} {compatibility.model}
            {compatibility.chassis_code ? ` · ${compatibility.chassis_code}` : ''}
            {compatibility.year_from ? ` · ${compatibility.year_from}${compatibility.year_to ? `–${compatibility.year_to}` : ''}` : ''}
          </p>
        )}

        <div className="mt-auto space-y-2 border-t border-orange-500/20 pt-2.5 sm:pt-3">
          <div className="min-w-0">
            <div className="mb-0.5 flex flex-wrap items-center gap-1">
              {discountLabel && part.stock_status !== 'sold' ? (
                <Badge className="h-5 border-0 bg-gradient-to-r from-[#f47a1f] to-[#d21e1e] px-1.5 text-[9px] text-white">{discountLabel}</Badge>
              ) : null}
              {deal && !discountLabel && dealPrice != null && part.stock_status !== 'sold' ? (
                <Badge className="h-5 border-0 bg-gradient-to-r from-[#f47a1f] to-[#d21e1e] px-1.5 text-[9px] text-white">Deal</Badge>
              ) : null}
            </div>
            {dealPrice != null ? (
              <>
                <span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[10px]">Deal price</span>
                <strong className="block truncate text-sm font-extrabold tracking-tight text-foreground sm:text-lg">{priceLabel}</strong>
              </>
            ) : catalogPriceLines.length > 0 ? (
              <div className="flex flex-col gap-y-1.5">
                {catalogPriceLines.map((line) => (
                  <div key={line.label} className="min-w-0">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300 sm:text-[10px]">{line.label}</span>
                    <strong className="block whitespace-nowrap text-xs font-extrabold tracking-tight text-foreground sm:text-base">{part.currency} {line.amount.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[10px]">Price</span>
                <strong className="block truncate text-sm font-extrabold tracking-tight text-foreground sm:text-lg">{priceLabel}</strong>
              </>
            )}
            {dealPrice != null && listPrice != null && dealPrice < listPrice ? (
              <span className="mt-0.5 block text-[11px] text-muted-foreground line-through sm:text-xs">
                {part.currency} {listPrice.toLocaleString()}
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#1fb858] bg-[#25D366] text-white shadow-[0_8px_20px_rgba(37,211,102,0.28)] transition hover:bg-[#20bd5a] hover:shadow-[0_10px_24px_rgba(37,211,102,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
              aria-label={`Ask about ${part.name} on WhatsApp`}
            >
              <MessageCircle className="h-5 w-5" />
            </a>
            <Link
              href={`/parts/${part.slug}`}
              className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-[#f47a1f] to-[#d21e1e] px-2.5 text-[11px] font-bold text-white shadow-sm transition hover:from-[#e76812] hover:to-[#b91c1c] sm:flex-none sm:px-3.5 sm:text-xs"
            >
              View <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

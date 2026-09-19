'use client';

import Link from 'next/link';
import { ArrowUpRight, Images, MessageCircle, PackageCheck, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/public/brand-logo';
import { CatalogImage, publicPartImageUrl } from '@/components/public/catalog-image';
import { StockOriginBadge } from '@/components/public/stock-origin-badge';
import { SaveItemActions, toPartSaveItem } from '@/components/public/save-item-actions';
import { conditionLabels, siteConfig } from '@/lib/site-config';
import type { PartWithRelations } from '@/lib/types';

interface PartCardProps {
  part: PartWithRelations;
}

export function PartCard({ part }: PartCardProps) {
  const coverPhoto = part.part_photos?.find((photo) => photo.is_cover) || part.part_photos?.[0];
  const compatibility = part.part_compatibility?.[0];
  const photoUrl = coverPhoto ? publicPartImageUrl(coverPhoto.storage_path) : null;
  const hasPrice = Boolean(part.show_price && part.price && part.price > 0);
  const priceLabel = part.stock_status === 'sold'
    ? 'Sold'
    : hasPrice
      ? `${part.currency} ${part.price!.toLocaleString()}`
      : 'Ask for quote';
  const waMessage = `Hello ${siteConfig.name}, I'm interested in ${part.name} (${part.part_code}). Is it available?`;
  const waHref = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(waMessage)}`;
  const saveItem = toPartSaveItem({
    id: part.id,
    slug: part.slug,
    name: part.name,
    part_code: part.part_code,
    priceLabel,
    imageUrl: photoUrl,
  });

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-card text-card-foreground shadow-card transition duration-300 hover:-translate-y-1 hover:border-accent hover:shadow-card-hover">
      <div className="relative">
        <Link href={`/parts/${part.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-[#101114]/[0.04]">
          {photoUrl ? (
            <CatalogImage
              src={photoUrl}
              alt={part.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="p-3 transition-transform duration-500 group-hover:scale-[1.04] sm:p-4"
              objectFit="contain"
            />
          ) : (
            <span className="flex h-full items-center justify-center"><Wrench className="h-12 w-12 text-muted-foreground/25" /></span>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#101114]/55 to-transparent opacity-80" />
          {part.stock_status === 'sold' && (
            <span className="absolute inset-0 grid place-items-center bg-[#101114]/40 text-3xl font-black uppercase tracking-[0.2em] text-white">Sold</span>
          )}
          {(part.part_photos?.length || 0) > 1 && (
            <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-full bg-[#101114]/85 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
              <Images className="h-3 w-3" />{part.part_photos?.length}
            </span>
          )}
        </Link>

        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-1">
            <StockOriginBadge origin={part.stock_origin} compact className="border border-foreground/15" />
            {part.is_featured ? (
              <Badge className="border-0 bg-accent text-accent-foreground">Featured</Badge>
            ) : (
              <Badge className="border border-foreground/10 bg-card/95 capitalize text-foreground backdrop-blur">
                {conditionLabels[part.condition] || part.condition}
              </Badge>
            )}
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-1.5">
            {part.stock_status !== 'sold' && part.quantity > 0 && (
              <Badge className="gap-1 border-0 bg-[#101114] text-white">
                <PackageCheck className="h-3 w-3 text-accent" />In stock
              </Badge>
            )}
            <SaveItemActions item={saveItem} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
            {part.categories?.name || 'Automotive part'}
          </span>
          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
            {part.oem_number || part.part_code}
          </span>
        </div>
        <Link href={`/parts/${part.slug}`}>
          <h3 className="line-clamp-2 min-h-[2.5rem] text-[14px] font-bold leading-snug text-foreground transition-colors group-hover:text-accent sm:text-[15px]">
            {part.name}
          </h3>
        </Link>
        {part.brand && <div className="mt-1.5"><BrandLogo brand={part.brand} size="sm" /></div>}
        {compatibility && (
          <p className="mt-1.5 line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">
            Fits {compatibility.make} {compatibility.model}
            {compatibility.chassis_code ? ` · ${compatibility.chassis_code}` : ''}
            {compatibility.year_from ? ` · ${compatibility.year_from}${compatibility.year_to ? `–${compatibility.year_to}` : ''}` : ''}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-foreground/10 pt-3">
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {hasPrice ? 'Export price' : 'Price'}
            </span>
            <strong className="block truncate text-base font-extrabold tracking-tight text-foreground sm:text-lg">
              {priceLabel}
            </strong>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-10 w-10 place-items-center rounded-full bg-[#25D366] text-white transition hover:brightness-110"
              aria-label={`Ask about ${part.name} on WhatsApp`}
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <Link
              href={`/parts/${part.slug}`}
              className="inline-flex h-10 items-center gap-1 rounded-full bg-accent px-3 text-[11px] font-bold text-accent-foreground transition hover:bg-accent/90 sm:px-3.5 sm:text-xs"
            >
              View <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

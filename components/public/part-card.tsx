'use client';

import Link from 'next/link';
import { ArrowUpRight, Images, MessageCircle, PackageCheck, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/public/brand-logo';
import { CatalogImage, publicPartImageUrl } from '@/components/public/catalog-image';
import { StockOriginBadge } from '@/components/public/stock-origin-badge';
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
  const waMessage = `Hello ${siteConfig.name}, I'm interested in ${part.name} (${part.part_code}). Is it available?`;
  const waHref = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(waMessage)}`;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_4px_18px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:border-accent/30 hover:shadow-[0_18px_45px_rgba(15,23,42,0.1)]">
      <Link href={`/parts/${part.slug}`} className="relative block aspect-[1.08/1] overflow-hidden bg-[radial-gradient(circle_at_50%_35%,hsl(var(--background)),hsl(var(--secondary)))]">
        {photoUrl ? (
          <CatalogImage
            src={photoUrl}
            alt={part.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="p-5 transition-transform duration-500 group-hover:scale-[1.055]"
            objectFit="contain"
          />
        ) : (
          <span className="flex h-full items-center justify-center"><Wrench className="h-12 w-12 text-muted-foreground/20" /></span>
        )}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <StockOriginBadge origin={part.stock_origin} compact className="border border-border/60" />
            <Badge className="border-0 bg-background/90 capitalize text-foreground shadow-sm backdrop-blur">
              {conditionLabels[part.condition] || part.condition}
            </Badge>
          </div>
          {part.stock_status !== 'sold' && part.quantity > 0 && (
            <Badge className="gap-1 border-0 bg-emerald-600 text-white shadow-sm">
              <PackageCheck className="h-3 w-3" />In stock
            </Badge>
          )}
        </div>
        {part.stock_status === 'sold' && <span className="absolute inset-0 grid place-items-center bg-black/25 text-3xl font-black uppercase tracking-[0.2em] text-white">Sold</span>}
        {(part.part_photos?.length || 0) > 1 && (
          <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-[#101114]/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            <Images className="h-3 w-3" />{part.part_photos?.length}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
            {part.categories?.name || 'Automotive part'}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{part.part_code}</span>
        </div>
        <Link href={`/parts/${part.slug}`}>
          <h3 className="line-clamp-2 min-h-11 text-[15px] font-bold leading-snug transition-colors group-hover:text-accent">{part.name}</h3>
        </Link>
        {part.brand && <div className="mt-2"><BrandLogo brand={part.brand} size="sm" /></div>}
        {compatibility && (
          <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
            {compatibility.make} {compatibility.model}
            {compatibility.chassis_code ? ` · ${compatibility.chassis_code}` : ''}
            {compatibility.year_from ? ` · ${compatibility.year_from}${compatibility.year_to ? `–${compatibility.year_to}` : ''}` : ''}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/70 pt-4">
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{hasPrice ? 'Export price' : 'Price'}</span>
            <strong className="text-lg font-extrabold tracking-tight">
              {part.stock_status === 'sold' ? 'Sold' : hasPrice ? `${part.currency} ${part.price!.toLocaleString()}` : 'Ask for quote'}
            </strong>
          </div>
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-white shadow-md transition hover:scale-105" aria-label={`Ask about ${part.name} on WhatsApp`}>
            <MessageCircle className="h-4 w-4" />
          </a>
        </div>
        <Link href={`/parts/${part.slug}`} className="mt-3 flex items-center justify-between rounded-xl bg-accent px-3 py-2.5 text-xs font-bold text-accent-foreground shadow-sm transition hover:bg-accent/90">
          View details <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

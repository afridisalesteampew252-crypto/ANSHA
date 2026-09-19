'use client';

import Link from 'next/link';
import { ArrowUpRight, Calendar, Car, Fuel, Gauge, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CatalogImage, publicVehicleImageUrl } from '@/components/public/catalog-image';
import { StockOriginBadge } from '@/components/public/stock-origin-badge';
import { SaveItemActions, toVehicleSaveItem } from '@/components/public/save-item-actions';
import { siteConfig } from '@/lib/site-config';
import type { VehicleWithPhotos } from '@/lib/types';

interface VehicleCardProps {
  vehicle: VehicleWithPhotos;
  priority?: boolean;
}

export function VehicleCard({ vehicle, priority = false }: VehicleCardProps) {
  const coverPhoto = vehicle.vehicle_photos?.find((photo) => photo.is_cover) || vehicle.vehicle_photos?.[0];
  const photoUrl = coverPhoto ? publicVehicleImageUrl(coverPhoto.storage_path) : null;
  const hasPrice = Boolean(vehicle.show_price && vehicle.price && vehicle.price > 0);
  const priceLabel = vehicle.stock_status === 'sold'
    ? 'Sold'
    : hasPrice
      ? `${vehicle.currency} ${vehicle.price!.toLocaleString()}`
      : 'Ask for quote';
  const waHref = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(`Hello ${siteConfig.name}, I'm interested in ${vehicle.title}. Is it available?`)}`;
  const saveItem = toVehicleSaveItem({
    id: vehicle.id,
    slug: vehicle.slug,
    title: vehicle.title,
    subtitle: [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' '),
    priceLabel,
    imageUrl: photoUrl,
  });

  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-foreground/10 bg-card text-card-foreground transition duration-300 hover:-translate-y-0.5 hover:border-accent sm:rounded-2xl">
      <div className="relative min-w-0">
        <Link href={`/vehicles/${vehicle.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-[#101114]/[0.04]">
          {photoUrl ? (
            <CatalogImage
              src={photoUrl}
              alt={vehicle.title}
              fill
              priority={priority}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="transition-transform duration-500 group-hover:scale-105"
              objectFit="cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center">
              <Car className="h-12 w-12 text-muted-foreground/25 sm:h-14 sm:w-14" />
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#101114]/75 to-transparent" />
          {vehicle.year ? (
            <span className="absolute bottom-2.5 left-2.5 text-xs font-bold text-white sm:bottom-3 sm:left-3 sm:text-sm">
              {vehicle.year} {vehicle.model}
            </span>
          ) : null}
          {vehicle.stock_status === 'sold' ? (
            <span className="absolute inset-0 grid place-items-center bg-[#101114]/40 text-2xl font-black uppercase tracking-[0.2em] text-white sm:text-3xl">
              Sold
            </span>
          ) : null}
        </Link>

        <div className="pointer-events-none absolute inset-x-1.5 top-1.5 flex items-start justify-between gap-1 sm:inset-x-3 sm:top-3 sm:gap-2">
          <div className="pointer-events-auto max-w-[58%] min-w-0">
            <StockOriginBadge origin={vehicle.stock_origin} compact />
          </div>
          <div className="pointer-events-auto shrink-0">
            <SaveItemActions item={saveItem} size="xs" className="gap-1" />
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-2.5 sm:p-5">
        {vehicle.is_featured && vehicle.stock_status !== 'sold' ? (
          <Badge className="mb-1.5 h-5 w-fit border-0 bg-accent px-1.5 text-[9px] text-accent-foreground sm:text-[10px]">
            Featured
          </Badge>
        ) : null}
        <Link href={`/vehicles/${vehicle.slug}`} className="min-w-0">
          <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground transition-colors group-hover:text-accent sm:text-base">
            {vehicle.title}
          </h3>
        </Link>
        <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground sm:mt-3 sm:gap-x-3 sm:gap-y-1.5 sm:text-[11px]">
          {vehicle.year ? (
            <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-accent" />{vehicle.year}</span>
          ) : null}
          {vehicle.fuel_type ? (
            <span className="inline-flex items-center gap-1"><Fuel className="h-3.5 w-3.5 text-accent" />{vehicle.fuel_type}</span>
          ) : null}
          {vehicle.transmission ? (
            <span className="inline-flex items-center gap-1"><Car className="h-3.5 w-3.5 text-accent" />{vehicle.transmission}</span>
          ) : null}
          {vehicle.mileage != null ? (
            <span className="inline-flex items-center gap-1"><Gauge className="h-3.5 w-3.5 text-accent" />{vehicle.mileage.toLocaleString()} km</span>
          ) : null}
        </div>
        <div className="mt-auto space-y-2 border-t border-foreground/10 pt-2.5 sm:pt-4">
          <div className="min-w-0">
            <span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[10px]">
              {hasPrice ? 'Export price' : 'Price'}
            </span>
            <strong className="block truncate text-sm font-extrabold tracking-tight text-foreground sm:text-lg">{priceLabel}</strong>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#25D366] text-white transition hover:brightness-110 sm:h-11 sm:w-11"
              aria-label={`Ask about ${vehicle.title} on WhatsApp`}
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <Link
              href={`/vehicles/${vehicle.slug}`}
              className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-full bg-accent px-2.5 text-[11px] font-bold text-accent-foreground transition hover:bg-accent/90 sm:h-11 sm:flex-none sm:gap-1.5 sm:px-3.5 sm:text-xs"
            >
              View <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

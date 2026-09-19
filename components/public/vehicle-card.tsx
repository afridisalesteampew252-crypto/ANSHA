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
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-card text-card-foreground transition duration-300 hover:-translate-y-1 hover:border-accent">
      <div className="relative">
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
              <Car className="h-14 w-14 text-muted-foreground/25" />
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#101114]/75 to-transparent" />
          {vehicle.year ? (
            <span className="absolute bottom-3 left-3 text-sm font-bold text-white">
              {vehicle.year} {vehicle.model}
            </span>
          ) : null}
          {vehicle.stock_status === 'sold' ? (
            <span className="absolute inset-0 grid place-items-center bg-[#101114]/40 text-3xl font-black uppercase tracking-[0.2em] text-white">
              Sold
            </span>
          ) : null}
        </Link>

        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap gap-2">
            <StockOriginBadge origin={vehicle.stock_origin} compact />
            {vehicle.stock_status === 'sold' ? (
              <Badge className="border-0 bg-[#101114] text-white">Sold</Badge>
            ) : vehicle.is_featured ? (
              <Badge className="border-0 bg-accent text-accent-foreground">Featured</Badge>
            ) : null}
          </div>
          <div className="pointer-events-auto">
            <SaveItemActions item={saveItem} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <Link href={`/vehicles/${vehicle.slug}`}>
          <h3 className="line-clamp-2 text-base font-bold leading-snug text-foreground transition-colors group-hover:text-accent">{vehicle.title}</h3>
        </Link>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
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
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-foreground/10 pt-4">
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {hasPrice ? 'Export price' : 'Price'}
            </span>
            <strong className="text-lg font-extrabold tracking-tight text-foreground">{priceLabel}</strong>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-11 w-11 place-items-center rounded-full bg-[#25D366] text-white transition hover:brightness-110"
              aria-label={`Ask about ${vehicle.title} on WhatsApp`}
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <Link
              href={`/vehicles/${vehicle.slug}`}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-3.5 text-xs font-bold text-accent-foreground transition hover:bg-accent/90"
            >
              View <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

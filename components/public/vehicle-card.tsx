'use client';

import Link from 'next/link';
import { ArrowUpRight, Calendar, Car, Fuel, Gauge, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { siteConfig } from '@/lib/site-config';
import type { VehicleWithPhotos } from '@/lib/types';

interface VehicleCardProps {
  vehicle: VehicleWithPhotos;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
  const coverPhoto = vehicle.vehicle_photos?.find((photo) => photo.is_cover) || vehicle.vehicle_photos?.[0];
  const photoUrl = coverPhoto
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-images/${coverPhoto.storage_path}`
    : null;
  const hasPrice = Boolean(vehicle.show_price && vehicle.price && vehicle.price > 0);
  const waHref = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(`Hello ${siteConfig.name}, I'm interested in ${vehicle.title}. Is it available?`)}`;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_4px_18px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:border-accent/30 hover:shadow-[0_18px_45px_rgba(15,23,42,0.1)]">
      <Link href={`/vehicles/${vehicle.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-secondary">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={vehicle.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <span className="flex h-full items-center justify-center"><Car className="h-14 w-14 text-muted-foreground/20" /></span>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute left-3 top-3 flex gap-2">
          {vehicle.is_featured && <Badge className="border-0 bg-accent text-white">Featured</Badge>}
          <Badge className="border-0 bg-background/90 text-foreground">{vehicle.make}</Badge>
        </div>
        {vehicle.year && <span className="absolute bottom-3 left-3 text-sm font-bold text-white">{vehicle.year} {vehicle.model}</span>}
      </Link>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <Link href={`/vehicles/${vehicle.slug}`}><h3 className="line-clamp-2 text-base font-bold group-hover:text-accent">{vehicle.title}</h3></Link>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-secondary/55 p-3 text-[11px] text-muted-foreground">
          {vehicle.year && <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-accent" />{vehicle.year}</span>}
          {vehicle.fuel_type && <span className="flex items-center gap-1.5"><Fuel className="h-3.5 w-3.5 text-accent" />{vehicle.fuel_type}</span>}
          {vehicle.transmission && <span className="flex items-center gap-1.5"><Car className="h-3.5 w-3.5 text-accent" />{vehicle.transmission}</span>}
          {vehicle.mileage != null && <span className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5 text-accent" />{vehicle.mileage.toLocaleString()} km</span>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{hasPrice ? 'Export price' : 'Price'}</span>
            <strong className="text-lg font-extrabold">{hasPrice ? `${vehicle.currency} ${vehicle.price!.toLocaleString()}` : 'Ask for quote'}</strong>
          </div>
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="grid h-10 w-10 place-items-center rounded-full bg-[#25D366] text-white" aria-label={`Ask about ${vehicle.title} on WhatsApp`}><MessageCircle className="h-4 w-4" /></a>
        </div>
        <Link href={`/vehicles/${vehicle.slug}`} className="mt-3 flex items-center justify-between rounded-xl bg-secondary/70 px-3 py-2.5 text-xs font-bold hover:bg-foreground hover:text-background">
          View vehicle <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

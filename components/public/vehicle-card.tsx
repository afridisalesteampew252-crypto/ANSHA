'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Car, Gauge, Fuel, Calendar, ArrowRight, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { siteConfig } from '@/lib/site-config';
import type { VehicleWithPhotos } from '@/lib/types';

interface VehicleCardProps {
  vehicle: VehicleWithPhotos;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
  const coverPhoto = vehicle.vehicle_photos?.find((p) => p.is_cover) || vehicle.vehicle_photos?.[0];
  const photoUrl = coverPhoto
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-images/${coverPhoto.storage_path}`
    : null;

  const hasPrice = vehicle.show_price && vehicle.price && vehicle.price > 0;
  const waMessage = `Hello ${siteConfig.name}, I'm interested in ${vehicle.title}. Is it available?`;
  const waHref = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(waMessage)}`;

  return (
    <Card className="group overflow-hidden transition-all duration-200 hover:shadow-card-hover hover:border-foreground/15">
      <Link href={`/vehicles/${vehicle.slug}`} className="block">
        <div className="relative aspect-[4/3] bg-secondary overflow-hidden">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={vehicle.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Car className="h-12 w-12 text-muted-foreground/25" />
            </div>
          )}
          {vehicle.is_featured && (
            <div className="absolute top-2.5 left-2.5">
              <Badge className="bg-accent text-accent-foreground border-accent backdrop-blur-sm">
                Featured
              </Badge>
            </div>
          )}
        </div>
      </Link>

      <CardContent className="p-4">
        <Link href={`/vehicles/${vehicle.slug}`} className="block">
          <h3 className="font-semibold text-sm leading-snug line-clamp-1 transition-colors group-hover:text-accent">
            {vehicle.title}
          </h3>
        </Link>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {vehicle.year && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {vehicle.year}
            </span>
          )}
          {vehicle.fuel_type && (
            <span className="flex items-center gap-1">
              <Fuel className="h-3 w-3" />
              {vehicle.fuel_type}
            </span>
          )}
          {vehicle.transmission && (
            <span className="flex items-center gap-1">
              <Car className="h-3 w-3" />
              {vehicle.transmission}
            </span>
          )}
          {vehicle.mileage != null && (
            <span className="flex items-center gap-1">
              <Gauge className="h-3 w-3" />
              {vehicle.mileage.toLocaleString()} km
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            {hasPrice ? (
              <span className="font-bold text-base">
                {vehicle.currency} {vehicle.price!.toLocaleString()}
              </span>
            ) : (
              <span className="text-sm font-semibold text-foreground">Ask Price</span>
            )}
          </div>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#25D366] text-white transition-opacity hover:opacity-90"
            title="Inquire on WhatsApp"
          >
            <MessageCircle className="h-4 w-4" />
          </a>
        </div>
        <Link
          href={`/vehicles/${vehicle.slug}`}
          className="mt-2.5 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View Details
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </CardContent>
    </Card>
  );
}

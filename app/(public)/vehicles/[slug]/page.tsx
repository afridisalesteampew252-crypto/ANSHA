'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  Car,
  Gauge,
  Fuel,
  Calendar,
  ChevronRight,
  CheckCircle2,
  XCircle,
  MapPin,
  Cog,
  Hash,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { InquiryDialog } from '@/components/public/inquiry-dialog';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { supabase } from '@/lib/supabase/client';
import { siteConfig } from '@/lib/site-config';
import type { VehicleWithPhotos } from '@/lib/types';

export default function VehicleDetailPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const [vehicle, setVehicle] = useState<VehicleWithPhotos | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*, vehicle_photos(*)')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();

      if (error || !data) {
        setNotFoundFlag(true);
        setLoading(false);
        return;
      }

      const typedData = data as unknown as VehicleWithPhotos;
      const sortedPhotos = (typedData.vehicle_photos || []).sort((a, b) => a.sort_order - b.sort_order);
      const coverIndex = sortedPhotos.findIndex((p) => p.is_cover);
      setVehicle({ ...typedData, vehicle_photos: sortedPhotos });
      setSelectedImage(coverIndex >= 0 ? coverIndex : 0);
      setLoading(false);
    })();
  }, [slug]);

  if (notFoundFlag) {
    notFound();
  }

  if (loading || !vehicle) {
    return (
      <div className="container-page py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
      </div>
    );
  }

  const photos = vehicle.vehicle_photos || [];
  const currentPhoto = photos[selectedImage];
  const photoUrl = currentPhoto
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-images/${currentPhoto.storage_path}`
    : null;

  const hasPrice = vehicle.show_price && vehicle.price && vehicle.price > 0;

  const specs = [
    { icon: Calendar, label: 'Year', value: vehicle.year?.toString() },
    { icon: Cog, label: 'Transmission', value: vehicle.transmission },
    { icon: Fuel, label: 'Fuel Type', value: vehicle.fuel_type },
    { icon: Gauge, label: 'Mileage', value: vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} km` : null },
    { icon: Palette, label: 'Color', value: vehicle.color },
    { icon: Hash, label: 'Chassis', value: vehicle.chassis_code },
    { icon: Cog, label: 'Engine', value: vehicle.engine_code },
    { icon: Car, label: 'Variant', value: vehicle.variant },
  ].filter((s) => s.value);

  return (
    <div className="container-page py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/vehicles" className="hover:text-foreground">Vehicles</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium truncate">{vehicle.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Image gallery */}
        <div className="space-y-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-secondary">
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt={vehicle.title}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Car className="h-20 w-20 text-muted-foreground/30" />
              </div>
            )}
            {vehicle.is_featured && (
              <div className="absolute top-3 left-3">
                <Badge className="bg-foreground text-background border-foreground">Featured</Badge>
              </div>
            )}
          </div>

          {photos.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {photos.map((photo, idx) => {
                const thumbUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-images/${photo.storage_path}`;
                return (
                  <button
                    key={photo.id}
                    onClick={() => setSelectedImage(idx)}
                    className={`relative aspect-square overflow-hidden rounded-md border-2 transition-all ${
                      idx === selectedImage ? 'border-foreground' : 'border-border hover:border-foreground/40'
                    }`}
                  >
                    <Image
                      src={thumbUrl}
                      alt={`${vehicle.title} ${idx + 1}`}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Vehicle info */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{vehicle.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {vehicle.make} {vehicle.model}
              {vehicle.variant ? ` • ${vehicle.variant}` : ''}
            </p>
          </div>

          {/* Price & availability */}
          <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Price</p>
              {hasPrice ? (
                <p className="text-2xl font-bold">
                  {vehicle.currency} {vehicle.price!.toLocaleString()}
                </p>
              ) : (
                <p className="text-2xl font-bold">Ask Price</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Available</span>
              </div>
            </div>
          </div>

          {/* Specs grid */}
          {specs.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {specs.map((spec) => (
                <div key={spec.label} className="flex items-center gap-2.5 rounded-lg border border-border p-3">
                  <spec.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{spec.label}</p>
                    <p className="text-sm font-medium truncate">{spec.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Location */}
          {vehicle.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Location: {vehicle.location}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <InquiryDialog
              triggerLabel="Send Inquiry"
              triggerSize="lg"
              triggerVariant="default"
            />
            <WhatsAppButton
              message={`Hello ${siteConfig.name}, I'm interested in ${vehicle.title}. Is it available?`}
              size="lg"
              variant="outline"
            />
          </div>

          {/* Description */}
          {vehicle.description && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Description</h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {vehicle.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

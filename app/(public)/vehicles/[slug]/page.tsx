'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
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
  ZoomIn,
  ChevronLeft,
  Images,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { JsonLd } from '@/components/seo/json-ld';

export default function VehicleDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = use(props.params);
  const { slug } = params;
  const [vehicle, setVehicle] = useState<VehicleWithPhotos | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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

  const navigatePhoto = (dir: 'prev' | 'next') => {
    setSelectedImage((prev) => {
      if (dir === 'prev') return prev === 0 ? photos.length - 1 : prev - 1;
      return prev === photos.length - 1 ? 0 : prev + 1;
    });
  };

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
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': ['Vehicle', 'Product'],
          name: vehicle.title,
          description: vehicle.description || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model} for export`,
          brand: { '@type': 'Brand', name: vehicle.make },
          model: vehicle.model,
          vehicleModelDate: vehicle.year?.toString(),
          vehicleIdentificationNumber: vehicle.chassis_code || undefined,
          mileageFromOdometer: vehicle.mileage != null ? { '@type': 'QuantitativeValue', value: vehicle.mileage, unitCode: 'KMT' } : undefined,
          image: photos.map((photo) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-images/${photo.storage_path}`),
          url: `${siteConfig.url}/vehicles/${vehicle.slug}`,
          offers: {
            '@type': 'Offer',
            availability: 'https://schema.org/InStock',
            priceCurrency: vehicle.currency,
            price: hasPrice ? vehicle.price : undefined,
            url: `${siteConfig.url}/vehicles/${vehicle.slug}`,
          },
        }}
      />
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
          <div
            className="group relative aspect-[4/3] cursor-zoom-in overflow-hidden rounded-xl border border-border bg-gradient-to-br from-secondary/80 to-background shadow-sm"
            onClick={() => photoUrl && setLightboxOpen(true)}
            role={photoUrl ? 'button' : undefined}
            tabIndex={photoUrl ? 0 : undefined}
            onKeyDown={(event) => {
              if (photoUrl && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                setLightboxOpen(true);
              }
            }}
            aria-label={photoUrl ? `Open ${vehicle.title} image ${selectedImage + 1} in full screen` : undefined}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={vehicle.title}
                className="h-full w-full object-contain p-2 sm:p-4"
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
            {photoUrl && (
              <div className="absolute inset-0 hidden items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/15 group-hover:opacity-100 sm:flex">
                <div className="flex items-center gap-2 rounded-lg bg-background/95 px-3 py-1.5 text-sm font-medium shadow-lg">
                  <ZoomIn className="h-4 w-4" />
                  Click to view
                </div>
              </div>
            )}
            {photos.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); navigatePhoto('prev'); }}
                  className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-md transition hover:bg-background sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); navigatePhoto('next'); }}
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-md transition hover:bg-background sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
                  {selectedImage + 1} / {photos.length}
                </div>
              </>
            )}
          </div>

          {photos.length > 1 && (
            <div className="flex snap-x gap-2 overflow-x-auto pb-2" aria-label="Vehicle photo thumbnails">
              {photos.map((photo, idx) => {
                const thumbUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-images/${photo.storage_path}`;
                return (
                  <button
                    key={photo.id}
                    onClick={() => setSelectedImage(idx)}
                    aria-label={`Show photo ${idx + 1} of ${photos.length}`}
                    aria-current={idx === selectedImage ? 'true' : undefined}
                    className={`relative aspect-square w-20 shrink-0 snap-start overflow-hidden rounded-lg border-2 bg-secondary/60 transition-all sm:w-24 ${
                      idx === selectedImage ? 'border-accent ring-2 ring-accent/15' : 'border-border hover:border-foreground/40'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl}
                      alt={`${vehicle.title} ${idx + 1}`}
                      className="h-full w-full object-contain p-1"
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

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="h-[92vh] max-w-[96vw] overflow-hidden border-white/10 bg-black/95 p-0 sm:max-w-6xl">
          <DialogTitle className="sr-only">{vehicle.title} — Image {selectedImage + 1}</DialogTitle>
          <div className="relative flex h-full min-h-[50vh] flex-col items-center justify-center p-4 pb-24 sm:p-8 sm:pb-28">
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={vehicle.title}
                className="h-full min-h-0 w-full object-contain"
              />
            )}
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => navigatePhoto('prev')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={() => navigatePhoto('next')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 overflow-x-auto rounded-xl bg-white/10 p-2 backdrop-blur-sm">
                  <div className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-white/80">
                    <Images className="h-4 w-4" />
                    {selectedImage + 1}/{photos.length}
                  </div>
                  {photos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setSelectedImage(index)}
                      aria-label={`Show photo ${index + 1}`}
                      aria-current={index === selectedImage ? 'true' : undefined}
                      className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 bg-white/5 ${index === selectedImage ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-images/${photo.storage_path}`} alt="" className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

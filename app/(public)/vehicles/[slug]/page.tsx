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
  MapPin,
  Cog,
  Hash,
  Palette,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { InquiryDialog } from '@/components/public/inquiry-dialog';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { VehiclePhotoGallery } from '@/components/public/vehicle-photo-gallery';
import { InventoryDealBanner } from '@/components/public/inventory-deal-banner';
import { SaveItemActions, toVehicleSaveItem } from '@/components/public/save-item-actions';
import { supabase } from '@/lib/supabase/client';
import { siteConfig } from '@/lib/site-config';
import { effectiveDealPrice } from '@/lib/site-offers';
import type { SiteOffer, VehicleWithPhotos } from '@/lib/types';
import { JsonLd } from '@/components/seo/json-ld';
import { publicVehicleImageUrl } from '@/components/public/catalog-image';

export default function VehicleDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = use(props.params);
  const { slug } = params;
  const [vehicle, setVehicle] = useState<VehicleWithPhotos | null>(null);
  const [deal, setDeal] = useState<SiteOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [coverIndex, setCoverIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*, vehicle_photos(*)')
        .eq('slug', slug)
        .eq('is_published', true)
        .eq('stock_status', 'available')
        .maybeSingle();

      if (error || !data) {
        setNotFoundFlag(true);
        setLoading(false);
        return;
      }

      const typedData = data as unknown as VehicleWithPhotos;
      const sortedPhotos = (typedData.vehicle_photos || []).sort((a, b) => a.sort_order - b.sort_order);
      const nextCover = sortedPhotos.findIndex((p) => p.is_cover);
      setVehicle({ ...typedData, vehicle_photos: sortedPhotos });
      setCoverIndex(nextCover >= 0 ? nextCover : 0);

      const { data: offerRows } = await supabase
        .from('site_offers')
        .select('*')
        .eq('is_published', true)
        .eq('vehicle_id', typedData.id)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(1);
      setDeal(((offerRows || [])[0] as SiteOffer | undefined) || null);
      setLoading(false);
    })();
  }, [slug]);

  if (notFoundFlag) {
    notFound();
  }

  if (loading || !vehicle) {
    return (
      <div className="container-page overflow-x-clip py-8">
        <div className="grid min-w-0 gap-8 lg:grid-cols-2">
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
  const hasPrice = vehicle.show_price && vehicle.price && vehicle.price > 0;
  const dealPrice = deal ? effectiveDealPrice(hasPrice ? vehicle.price : null, deal) : null;

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
    <div className="overflow-x-clip">
      <div className="border-b border-border bg-gradient-to-b from-secondary/60 to-background">
        <div className="container-page py-5 sm:py-6">
          <nav className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/" className="shrink-0 hover:text-foreground">Home</Link>
            <ChevronRight className="h-4 w-4 shrink-0" />
            <Link href="/vehicles" className="shrink-0 hover:text-foreground">Vehicles</Link>
            <ChevronRight className="h-4 w-4 shrink-0" />
            <span className="truncate font-medium text-foreground">{vehicle.title}</span>
          </nav>
        </div>
      </div>

      <div className="container-page py-8 sm:py-10">
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
          image: photos.map((photo) => publicVehicleImageUrl(photo.storage_path)),
          url: `${siteConfig.url}/vehicles/${vehicle.slug}`,
          offers: {
            '@type': 'Offer',
            availability: 'https://schema.org/InStock',
            priceCurrency: vehicle.currency,
            price: dealPrice ?? (hasPrice ? vehicle.price : undefined),
            url: `${siteConfig.url}/vehicles/${vehicle.slug}`,
          },
        }}
      />

      <div className="grid min-w-0 gap-8 lg:grid-cols-2 lg:gap-10">
        <VehiclePhotoGallery
          title={vehicle.title}
          photos={photos}
          featured={vehicle.is_featured}
          initialIndex={coverIndex}
        />

        <div className="min-w-0 space-y-6">
          <div>
            <p className="eyebrow">Export vehicle</p>
            <h1 className="mt-2 font-display text-2xl font-black tracking-tight md:text-3xl lg:text-4xl">{vehicle.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {vehicle.make} {vehicle.model}
              {vehicle.variant ? ` • ${vehicle.variant}` : ''}
            </p>
          </div>

          {deal ? (
            <InventoryDealBanner
              offer={deal}
              currency={vehicle.currency}
              listPrice={hasPrice ? vehicle.price : null}
            />
          ) : null}

          <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/40 p-4 sm:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {dealPrice != null ? 'Deal price' : 'Export price'}
              </p>
              {dealPrice != null ? (
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <p className="text-2xl font-black tracking-tight sm:text-3xl">
                    {vehicle.currency} {dealPrice.toLocaleString()}
                  </p>
                  {hasPrice ? (
                    <span className="text-sm text-muted-foreground line-through">
                      {vehicle.currency} {vehicle.price!.toLocaleString()}
                    </span>
                  ) : null}
                </div>
              ) : hasPrice ? (
                <p className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                  {vehicle.currency} {vehicle.price!.toLocaleString()}
                </p>
              ) : (
                <p className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Ask for quote</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
              <div className="mt-1 flex items-center justify-end gap-1.5 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-semibold">Available</span>
              </div>
            </div>
          </div>

          {specs.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {specs.map((spec) => (
                <div key={spec.label} className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border p-3">
                  <spec.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{spec.label}</p>
                    <p className="truncate text-sm font-medium">{spec.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {vehicle.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>Location: {vehicle.location}</span>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <SaveItemActions
              size="md"
              showLabels
              item={toVehicleSaveItem({
                id: vehicle.id,
                slug: vehicle.slug,
                title: vehicle.title,
                subtitle: [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' '),
                priceLabel: dealPrice != null
                  ? `${vehicle.currency} ${dealPrice.toLocaleString()}`
                  : hasPrice
                    ? `${vehicle.currency} ${vehicle.price!.toLocaleString()}`
                    : 'Ask for quote',
                imageUrl: photos[0] ? publicVehicleImageUrl(photos[0].storage_path) : null,
              })}
            />
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
          </div>

          {vehicle.description && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Description</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {vehicle.description}
              </p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

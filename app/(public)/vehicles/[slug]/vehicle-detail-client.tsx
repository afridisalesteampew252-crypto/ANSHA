'use client';

import Link from 'next/link';
import {
  Car,
  Gauge,
  Fuel,
  Calendar,
  CheckCircle2,
  MapPin,
  Cog,
  Hash,
  Palette,
} from 'lucide-react';
import { InquiryDialog } from '@/components/public/inquiry-dialog';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { VehicleCard } from '@/components/public/vehicle-card';
import { VehiclePhotoGallery } from '@/components/public/vehicle-photo-gallery';
import { InventoryDealBanner } from '@/components/public/inventory-deal-banner';
import { IncotermQuoteStrip } from '@/components/public/incoterm-quote-strip';
import { SaveItemActions, toVehicleSaveItem } from '@/components/public/save-item-actions';
import { siteConfig } from '@/lib/site-config';
import { resolveListingPricing } from '@/lib/listing-pricing';
import type { SiteOffer, VehicleWithPhotos } from '@/lib/types';
import { PageBreadcrumbs } from '@/components/seo/page-breadcrumbs';
import { publicVehicleImageUrl } from '@/components/public/catalog-image';
import type { PublicVehicleCard } from '@/lib/public-card-data';
import {
  equipmentCategoryLabel,
  isMachineryClass,
  vehicleClassLabel,
} from '@/lib/vehicle-class';

export type VehicleDetailClientProps = {
  vehicle: VehicleWithPhotos;
  deal: SiteOffer | null;
  relatedVehicles: PublicVehicleCard[];
};

/**
 * Vehicle detail view. Data is loaded on the server (ISR) and passed in as props so the
 * full listing, including the price, is in the initial HTML.
 */
export function VehicleDetailClient({ vehicle, deal, relatedVehicles }: VehicleDetailClientProps) {
  const photos = vehicle.vehicle_photos || [];
  const coverIdx = photos.findIndex((p) => p.is_cover);
  const coverIndex = coverIdx >= 0 ? coverIdx : 0;
  const { listingPrice, dealPrice, displayPrice, priceLabel } = resolveListingPricing(vehicle, deal, {
    basis: 'fob',
  });
  const hasPrice = listingPrice != null;

  const machineryUnit = isMachineryClass(vehicle.vehicle_class);
  const specs = [
    { icon: Calendar, label: 'Year', value: vehicle.year?.toString() },
    { icon: Cog, label: 'Transmission', value: vehicle.transmission },
    { icon: Fuel, label: 'Fuel Type', value: vehicle.fuel_type },
    {
      icon: Gauge,
      label: machineryUnit && vehicle.operating_hours != null ? 'Operating hours' : 'Mileage',
      value:
        vehicle.operating_hours != null
          ? `${vehicle.operating_hours.toLocaleString()} hrs`
          : vehicle.mileage != null
            ? `${vehicle.mileage.toLocaleString()} km`
            : null,
    },
    { icon: Palette, label: 'Color', value: vehicle.color },
    { icon: Hash, label: 'Chassis', value: vehicle.chassis_code },
    { icon: Cog, label: 'Engine', value: vehicle.engine_code },
    { icon: Car, label: 'Variant', value: vehicle.variant },
    {
      icon: Car,
      label: 'Class',
      value: machineryUnit
        ? [vehicleClassLabel(vehicle.vehicle_class), equipmentCategoryLabel(vehicle.equipment_category)]
            .filter(Boolean)
            .join(' · ')
        : null,
    },
  ].filter((s) => s.value);

  const catalogHref = machineryUnit ? '/machinery' : '/vehicles';
  const catalogLabel = machineryUnit ? 'Machinery' : 'Vehicles';
  const makeHref = vehicle.make
    ? `${catalogHref}?brand=${encodeURIComponent(vehicle.make)}`
    : catalogHref;

  return (
    <div className="overflow-x-clip">
      <div className="page-band">
        <div className="container-page py-5 sm:py-6">
          <PageBreadcrumbs
            includeJsonLd={false}
            items={[
              { name: 'Home', href: '/' },
              { name: catalogLabel, href: catalogHref },
              ...(vehicle.make ? [{ name: vehicle.make, href: makeHref }] : []),
              { name: vehicle.title },
            ]}
          />
        </div>
      </div>

      <div className="surface-cool">
      <div className="container-page py-8 sm:py-10">

      <div className="grid min-w-0 gap-8 lg:grid-cols-2 lg:gap-10">
        <VehiclePhotoGallery
          title={vehicle.title}
          photos={photos}
          featured={vehicle.is_featured}
          initialIndex={coverIndex}
          year={vehicle.year}
          make={vehicle.make}
          model={vehicle.model}
        />

        <div className="min-w-0 space-y-6">
          <div>
            <p className="eyebrow">
              {vehicle.stock_pool === 'auction_third_party' ? 'Auction listing' : 'Export vehicle'}
            </p>
            <h1 className="mt-2 font-display text-2xl font-black tracking-tight md:text-3xl lg:text-4xl">{vehicle.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {vehicle.make} {vehicle.model}
              {vehicle.variant ? ` • ${vehicle.variant}` : ''}
              {vehicle.stock_pool === 'auction_third_party' ? ' · Auction stock' : ''}
            </p>
          </div>

          {deal ? (
            <InventoryDealBanner
              offer={deal}
              currency={vehicle.currency}
              listPrice={listingPrice}
            />
          ) : null}

          <div className="flex items-center justify-between rounded-2xl border border-accent/20 bg-[#101114] p-4 text-white sm:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                {dealPrice != null ? 'Deal price' : 'Export price'}
              </p>
              {dealPrice != null ? (
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <p className="text-2xl font-black tracking-tight sm:text-3xl">
                    {vehicle.currency} {dealPrice.toLocaleString()}
                  </p>
                  {hasPrice ? (
                    <span className="text-sm text-white/40 line-through">
                      {vehicle.currency} {listingPrice!.toLocaleString()}
                    </span>
                  ) : null}
                </div>
              ) : displayPrice != null ? (
                <p className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{priceLabel}</p>
              ) : (
                <p className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Ask for quote</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Status</p>
              <div className="mt-1 flex items-center justify-end gap-1.5 text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-semibold">Available</span>
              </div>
            </div>
          </div>

          <IncotermQuoteStrip
            currency={vehicle.currency}
            showPrice={Boolean(vehicle.show_price)}
            priceFob={vehicle.price_fob}
            priceCf={vehicle.price_cf}
            priceCif={vehicle.price_cif}
          />

          {specs.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {specs.map((spec) => (
                <div key={spec.label} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-accent/15 bg-card p-3">
                  <spec.icon className="h-4 w-4 shrink-0 text-accent" />
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
              <MapPin className="h-4 w-4 shrink-0 text-accent" />
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
                priceLabel,
                imageUrl: photos[0] ? publicVehicleImageUrl(photos[0].storage_path) : null,
              })}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <InquiryDialog
                vehicleId={vehicle.id}
                partName={[vehicle.title, vehicle.stock_number ? `#${vehicle.stock_number}` : null].filter(Boolean).join(' · ')}
                triggerLabel="Send Inquiry"
                triggerSize="lg"
                triggerVariant="accent"
              />
              <WhatsAppButton
                message={`Hello ${siteConfig.name}, I'm interested in ${vehicle.title}. Is it available?`}
                size="lg"
                variant="outline"
              />
            </div>
          </div>

          {vehicle.description && (
            <div className="rounded-2xl border border-accent/10 bg-card p-4 sm:p-5">
              <h2 className="mb-2 text-sm font-semibold">Description</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {vehicle.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {(relatedVehicles.length > 0 || vehicle.make) && (
        <div className="mt-12 border-t border-accent/10 pt-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">More from stock</p>
              <h2 className="font-display text-xl font-black tracking-tight">
                {vehicle.make ? `Related ${vehicle.make} units` : 'Related inventory'}
              </h2>
            </div>
            <Link href={makeHref} className="text-sm font-semibold text-accent hover:underline">
              Browse {vehicle.make || catalogLabel}
            </Link>
          </div>
          {relatedVehicles.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {relatedVehicles.map((item) => (
                <VehicleCard key={item.id} vehicle={item} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              See the full {catalogLabel.toLowerCase()} catalog for more published stock.
            </p>
          )}
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

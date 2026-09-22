'use client';

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { CatalogImage, publicVehicleImageUrl } from '@/components/public/catalog-image';
import { StockOriginBadge } from '@/components/public/stock-origin-badge';
import { SaveItemActions, toVehicleSaveItem } from '@/components/public/save-item-actions';
import { effectiveDealPrice, formatDealDiscount } from '@/lib/site-offers';
import { publicPriceLabel } from '@/lib/product-schema';
import { siteConfig } from '@/lib/site-config';
import { vehicleImageAlt } from '@/lib/seo';
import { pickVehicleCoverPhoto } from '@/lib/vehicle-photos';
import type { SiteOffer, VehicleWithPhotos } from '@/lib/types';

/** Large media-row card for homepage featured stock (2-col max). */
export function FeaturedVehicleRow({
  vehicle,
  deal = null,
  priority = false,
}: {
  vehicle: VehicleWithPhotos;
  deal?: SiteOffer | null;
  priority?: boolean;
}) {
  const coverPhoto = pickVehicleCoverPhoto(vehicle.vehicle_photos);
  const photoUrl = coverPhoto ? publicVehicleImageUrl(coverPhoto.storage_path) : null;
  const imageAlt = vehicleImageAlt(vehicle);
  const listPrice =
    vehicle.show_price && vehicle.price && vehicle.price > 0 ? Number(vehicle.price) : null;
  const dealPrice =
    vehicle.stock_status !== 'sold' && deal ? effectiveDealPrice(listPrice, deal) : null;
  const discountLabel = deal ? formatDealDiscount(deal.discount_percent) : null;
  const priceLabel = publicPriceLabel({
    currency: vehicle.currency,
    stockStatus: vehicle.stock_status,
    dealPrice,
    showPrice: Boolean(vehicle.show_price),
    price: vehicle.price,
    priceFob: vehicle.price_fob,
    priceCf: vehicle.price_cf,
    priceCif: vehicle.price_cif,
  });
  const subtitle = [vehicle.variant, vehicle.fuel_type, vehicle.transmission].filter(Boolean).join(' / ');
  const saveItem = toVehicleSaveItem({
    id: vehicle.id,
    slug: vehicle.slug,
    title: vehicle.title,
    subtitle: [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' '),
    priceLabel,
    imageUrl: photoUrl,
  });
  const inquireHref = `/contact?vehicle=${encodeURIComponent(vehicle.slug)}`;
  const waHref = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(
    `Hello ${siteConfig.name}, I'm interested in ${vehicle.title}. Is it available?`
  )}`;

  return (
    <article className="inventory-card group flex flex-col overflow-hidden rounded-[1.35rem] sm:flex-row">
      <Link
        href={`/vehicles/${vehicle.slug}`}
        className="relative h-[220px] w-full shrink-0 overflow-hidden bg-[#e4e8ed] sm:h-auto sm:w-[45%] sm:min-h-[240px]"
      >
        {photoUrl ? (
          <CatalogImage
            src={photoUrl}
            alt={imageAlt}
            fill
            priority={priority}
            sizes="(max-width: 640px) 100vw, 40vw"
            className="inventory-media object-cover"
            objectFit="cover"
          />
        ) : (
          <span className="inventory-media absolute inset-0 bg-gradient-to-br from-[#828789] to-[#5c6366]" />
        )}
        {vehicle.stock_number ? (
          <span className="absolute left-3 top-3 z-10 rounded border border-[#cdbfc1] bg-white/90 px-2.5 py-1 font-mono text-[11px] font-bold text-[#171415] backdrop-blur-sm">
            REF: {vehicle.stock_number}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col justify-between bg-white p-5 sm:w-[55%] sm:p-6">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StockOriginBadge origin={vehicle.stock_origin} compact />
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Available
            </span>
            {discountLabel ? (
              <span className="rounded bg-[#171415] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                {discountLabel}
              </span>
            ) : null}
          </div>
          <h3 className="font-display text-xl font-bold leading-tight text-[#171415]">
            <Link href={`/vehicles/${vehicle.slug}`} className="hover:text-[#d21e1e]">
              {vehicle.title}
            </Link>
          </h3>
          {subtitle ? <p className="mt-2 font-mono text-sm text-[#5c6366]">{subtitle}</p> : null}
          <p className="mt-3 text-sm font-extrabold tracking-tight text-[#171415]">{priceLabel}</p>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-[#cdbfc1]/40 pt-4">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:brightness-110"
            aria-label={`WhatsApp about ${vehicle.title}`}
          >
            <MessageCircle className="h-4 w-4" />
          </a>
          <SaveItemActions item={saveItem} size="sm" />
          <Link
            href={inquireHref}
            className="ml-auto inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[#d21e1e] px-5 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-[#c35252]"
          >
            Inquire
          </Link>
        </div>
      </div>
    </article>
  );
}

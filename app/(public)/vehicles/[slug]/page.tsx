import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/json-ld';
import { resolveListingPricing } from '@/lib/listing-pricing';
import { publicVehicleImageUrl } from '@/lib/public-media';
import { buildProductOffer } from '@/lib/product-schema';
import { getPublicVehicleBySlug, getVehicleDetailExtras } from '@/lib/public-listing-data';
import { absoluteUrl } from '@/lib/seo';
import { buildBreadcrumbListJsonLd } from '@/lib/seo-schema';
import {
  equipmentCategoryLabel,
  isMachineryClass,
  vehicleClassLabel,
} from '@/lib/vehicle-class';
import { VehicleDetailClient } from './vehicle-detail-client';

type Props = { params: Promise<{ slug: string }> };

/**
 * ISR: pages are rendered on first request and cached at the edge. Admin saves trigger
 * on-demand revalidation (/api/revalidate); this interval is the fallback.
 */
export const revalidate = 600;

export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

export default async function VehicleDetailPage({ params }: Props) {
  const { slug } = await params;
  const vehicle = await getPublicVehicleBySlug(slug);
  if (!vehicle) notFound();

  const { deal, relatedVehicles } = await getVehicleDetailExtras(vehicle);
  const photos = vehicle.vehicle_photos || [];
  const pageUrl = absoluteUrl(`/vehicles/${vehicle.slug}`);
  const pricing = resolveListingPricing(vehicle, deal, { basis: 'fob' });
  // Offer only when the page visibly shows this exact amount + currency.
  const offers = buildProductOffer({
    price: pricing.visiblePrice,
    currency: vehicle.currency,
    url: pageUrl,
    availability: 'https://schema.org/InStock',
  });

  const machineryUnit = isMachineryClass(vehicle.vehicle_class);
  const catalogHref = machineryUnit ? '/machinery' : '/vehicles';
  const catalogLabel = machineryUnit ? 'Machinery' : 'Vehicles';
  const makeHref = vehicle.make
    ? `${catalogHref}?brand=${encodeURIComponent(vehicle.make)}`
    : catalogHref;

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': ['Vehicle', 'Product'],
    name: vehicle.title,
    description:
      vehicle.description ||
      `${vehicle.year || ''} ${vehicle.make} ${vehicle.model} for export`.trim(),
    brand: { '@type': 'Brand', name: vehicle.make },
    model: vehicle.model,
    category: machineryUnit
      ? equipmentCategoryLabel(vehicle.equipment_category) || vehicleClassLabel(vehicle.vehicle_class)
      : undefined,
    vehicleModelDate: vehicle.year?.toString(),
    // A JDM chassis/model code (e.g. "GDJ150W") is not a 17-character VIN.
    ...(vehicle.chassis_code
      ? {
          additionalProperty: [
            { '@type': 'PropertyValue', name: 'Chassis code', value: vehicle.chassis_code },
          ],
        }
      : {}),
    mileageFromOdometer:
      vehicle.mileage != null
        ? { '@type': 'QuantitativeValue', value: vehicle.mileage, unitCode: 'KMT' }
        : undefined,
    image: photos.map((photo) => publicVehicleImageUrl(photo.storage_path)),
    url: pageUrl,
    ...(offers ? { offers } : {}),
  };

  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: 'Home', href: '/' },
    { name: catalogLabel, href: catalogHref },
    ...(vehicle.make ? [{ name: vehicle.make, href: makeHref }] : []),
    { name: vehicle.title },
  ]);

  return (
    <>
      <JsonLd data={productJsonLd} />
      {breadcrumbJsonLd ? <JsonLd data={breadcrumbJsonLd} /> : null}
      <VehicleDetailClient vehicle={vehicle} deal={deal} relatedVehicles={relatedVehicles} />
    </>
  );
}

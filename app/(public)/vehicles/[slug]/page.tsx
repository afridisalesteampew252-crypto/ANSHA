import { JsonLd } from '@/components/seo/json-ld';
import { publicVehicleImageUrl } from '@/lib/public-media';
import {
  buildProductOffer,
  buildProductReviewFields,
  resolveProductOfferPrice,
} from '@/lib/product-schema';
import { getPublishedReviews } from '@/lib/reviews';
import { absoluteUrl } from '@/lib/seo';
import { buildBreadcrumbListJsonLd } from '@/lib/seo-schema';
import { effectiveDealPrice } from '@/lib/site-offers';
import { siteConfig } from '@/lib/site-config';
import { createPublicSupabaseClient } from '@/lib/supabase/public';
import {
  equipmentCategoryLabel,
  isMachineryClass,
  vehicleClassLabel,
} from '@/lib/vehicle-class';
import { publicVehiclePhotos } from '@/lib/vehicle-photos';
import type { SiteOffer } from '@/lib/types';
import { VehicleDetailClient } from './vehicle-detail-client';

type Props = { params: Promise<{ slug: string }> };

export default async function VehicleDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = createPublicSupabaseClient();

  const { data } = await supabase
    .from('vehicles')
    .select(
      'id, slug, title, description, make, model, year, chassis_code, mileage, currency, show_price, price, price_fob, price_cf, price_cif, vehicle_class, equipment_category, vehicle_photos(storage_path, is_cover, sort_order, is_auction_sheet)'
    )
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('stock_status', 'available')
    .maybeSingle();

  if (!data) {
    return <VehicleDetailClient slug={slug} />;
  }

  const photos = publicVehiclePhotos(
    ((data.vehicle_photos || []) as Array<{
      storage_path: string;
      is_cover: boolean | null;
      sort_order: number | null;
      is_auction_sheet: boolean | null;
    }>).map((photo) => ({
      storage_path: photo.storage_path,
      is_cover: Boolean(photo.is_cover),
      sort_order: photo.sort_order ?? 0,
      is_auction_sheet: Boolean(photo.is_auction_sheet),
    }))
  ).sort((a, b) => a.sort_order - b.sort_order);

  const [{ data: offerRows }, reviews] = await Promise.all([
    supabase
      .from('site_offers')
      .select('sale_price,discount_percent')
      .eq('is_published', true)
      .eq('vehicle_id', data.id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(1),
    getPublishedReviews(10),
  ]);

  const deal = ((offerRows || [])[0] as Pick<SiteOffer, 'sale_price' | 'discount_percent'> | undefined) || null;
  const hasListPrice = Boolean(data.show_price && data.price && Number(data.price) > 0);
  const dealPrice = deal ? effectiveDealPrice(hasListPrice ? Number(data.price) : null, deal) : null;
  const pageUrl = absoluteUrl(`/vehicles/${data.slug}`);
  const offerPrice = resolveProductOfferPrice({
    dealPrice,
    showPrice: Boolean(data.show_price),
    price: data.price,
    priceFob: data.price_fob,
    priceCf: data.price_cf,
    priceCif: data.price_cif,
  });
  const offers = buildProductOffer({
    price: offerPrice,
    currency: data.currency,
    url: pageUrl,
    availability: 'https://schema.org/InStock',
  });
  const reviewFields = buildProductReviewFields(reviews, {
    name: data.title,
    url: pageUrl,
  });

  const machineryUnit = isMachineryClass(data.vehicle_class);
  const catalogHref = machineryUnit ? '/machinery' : '/vehicles';
  const catalogLabel = machineryUnit ? 'Machinery' : 'Vehicles';
  const makeHref = data.make
    ? `${catalogHref}?brand=${encodeURIComponent(data.make)}`
    : catalogHref;

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': ['Vehicle', 'Product'],
    name: data.title,
    description:
      data.description || `${data.year || ''} ${data.make} ${data.model} for export`.trim(),
    brand: { '@type': 'Brand', name: data.make },
    model: data.model,
    category: machineryUnit
      ? equipmentCategoryLabel(data.equipment_category) || vehicleClassLabel(data.vehicle_class)
      : undefined,
    vehicleModelDate: data.year?.toString(),
    vehicleIdentificationNumber: data.chassis_code || undefined,
    mileageFromOdometer:
      data.mileage != null
        ? { '@type': 'QuantitativeValue', value: data.mileage, unitCode: 'KMT' }
        : undefined,
    image: photos.map((photo) => publicVehicleImageUrl(photo.storage_path)),
    url: pageUrl,
    ...(offers ? { offers } : {}),
    ...reviewFields,
  };

  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: 'Home', href: '/' },
    { name: catalogLabel, href: catalogHref },
    ...(data.make ? [{ name: data.make, href: makeHref }] : []),
    { name: data.title },
  ]);

  return (
    <>
      <JsonLd data={productJsonLd} />
      {breadcrumbJsonLd ? <JsonLd data={breadcrumbJsonLd} /> : null}
      <VehicleDetailClient slug={slug} />
    </>
  );
}

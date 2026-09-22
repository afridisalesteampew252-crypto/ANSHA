import { JsonLd } from '@/components/seo/json-ld';
import { publicPartImageUrl } from '@/lib/public-media';
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
import type { SiteOffer } from '@/lib/types';
import { PartDetailClient } from './part-detail-client';

type Props = { params: Promise<{ slug: string }> };

export default async function PartDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = createPublicSupabaseClient();

  const { data } = await supabase
    .from('parts')
    .select(
      'id, slug, name, description, part_code, part_number, oem_number, brand, currency, show_price, price, price_fob, price_cf, price_cif, quantity, categories(name, slug), part_photos(storage_path, is_cover, sort_order)'
    )
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('stock_status', 'available')
    .maybeSingle();

  if (!data) {
    return <PartDetailClient slug={slug} />;
  }

  const photos = [...(data.part_photos || [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const [{ data: offerRows }, reviews] = await Promise.all([
    supabase
      .from('site_offers')
      .select('sale_price,discount_percent')
      .eq('is_published', true)
      .eq('part_id', data.id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(1),
    getPublishedReviews(10),
  ]);

  const deal = ((offerRows || [])[0] as Pick<SiteOffer, 'sale_price' | 'discount_percent'> | undefined) || null;
  const hasListPrice = Boolean(data.show_price && data.price && Number(data.price) > 0);
  const dealPrice = deal ? effectiveDealPrice(hasListPrice ? Number(data.price) : null, deal) : null;
  const pageUrl = absoluteUrl(`/parts/${data.slug}`);
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
    availability:
      (data.quantity ?? 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
  });
  const reviewFields = buildProductReviewFields(reviews, {
    name: data.name,
    url: pageUrl,
  });

  const rawCategory = data.categories as
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null
    | undefined;
  const category = Array.isArray(rawCategory) ? rawCategory[0] : rawCategory;

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: data.name,
    description: data.description || `${data.name} supplied by ${siteConfig.name}`,
    sku: data.part_code,
    mpn: data.part_number || data.oem_number || undefined,
    brand: data.brand ? { '@type': 'Brand', name: data.brand } : undefined,
    image: photos.map((photo) => publicPartImageUrl(photo.storage_path)),
    url: pageUrl,
    ...(offers ? { offers } : {}),
    ...reviewFields,
  };

  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: 'Home', href: '/' },
    { name: 'Parts', href: '/parts' },
    ...(category ? [{ name: category.name, href: `/categories/${category.slug}` }] : []),
    { name: data.name },
  ]);

  return (
    <>
      <JsonLd data={productJsonLd} />
      {breadcrumbJsonLd ? <JsonLd data={breadcrumbJsonLd} /> : null}
      <PartDetailClient slug={slug} />
    </>
  );
}

import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/json-ld';
import { resolveListingPricing } from '@/lib/listing-pricing';
import { publicPartImageUrl } from '@/lib/public-media';
import { buildProductOffer } from '@/lib/product-schema';
import { getPartDetailExtras, getPublicPartBySlug } from '@/lib/public-listing-data';
import { absoluteUrl } from '@/lib/seo';
import { buildBreadcrumbListJsonLd } from '@/lib/seo-schema';
import { siteConfig } from '@/lib/site-config';
import { PartDetailClient } from './part-detail-client';

type Props = { params: Promise<{ slug: string }> };

/**
 * ISR: pages are rendered on first request and cached at the edge. Admin saves trigger
 * on-demand revalidation (/api/revalidate); this interval is the fallback.
 */
export const revalidate = 600;

export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

export default async function PartDetailPage({ params }: Props) {
  const { slug } = await params;
  const part = await getPublicPartBySlug(slug);
  if (!part) notFound();

  const { deal, relatedParts } = await getPartDetailExtras(part);
  const photos = part.part_photos || [];
  const pageUrl = absoluteUrl(`/parts/${part.slug}`);
  const pricing = resolveListingPricing(part, deal, { basis: 'price', askLabel: 'Ask Price' });
  // Offer only when the page visibly shows this exact amount + currency.
  const offers = buildProductOffer({
    price: pricing.visiblePrice,
    currency: part.currency,
    url: pageUrl,
    availability:
      (part.quantity ?? 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
  });

  const category = part.categories;

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: part.name,
    description: part.description || `${part.name} supplied by ${siteConfig.name}`,
    sku: part.part_code,
    mpn: part.part_number || part.oem_number || undefined,
    brand: part.brand ? { '@type': 'Brand', name: part.brand } : undefined,
    image: photos.map((photo) => publicPartImageUrl(photo.storage_path)),
    url: pageUrl,
    ...(offers ? { offers } : {}),
  };

  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: 'Home', href: '/' },
    { name: 'Parts', href: '/parts' },
    ...(category ? [{ name: category.name, href: `/categories/${category.slug}` }] : []),
    { name: part.name },
  ]);

  return (
    <>
      <JsonLd data={productJsonLd} />
      {breadcrumbJsonLd ? <JsonLd data={breadcrumbJsonLd} /> : null}
      <PartDetailClient part={part} deal={deal} relatedParts={relatedParts} />
    </>
  );
}

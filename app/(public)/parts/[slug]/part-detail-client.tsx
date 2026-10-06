'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Wrench,
  Tag,
  Hash,
  Car,
  Calendar,
  ChevronRight,
  CheckCircle2,
  XCircle,
  MapPin,
  Box,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { PartCard } from '@/components/public/part-card';
import { InquiryDialog } from '@/components/public/inquiry-dialog';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { BrandLogo } from '@/components/public/brand-logo';
import { InventoryDealBanner } from '@/components/public/inventory-deal-banner';
import { IncotermQuoteStrip } from '@/components/public/incoterm-quote-strip';
import { SaveItemActions, toPartSaveItem } from '@/components/public/save-item-actions';
import { publicPartImageUrl } from '@/components/public/catalog-image';
import { PublicImageGallery } from '@/components/public/public-image-gallery';
import { useInventoryDeals } from '@/hooks/use-inventory-deals';
import { getPublicCatalogClient } from '@/lib/supabase/public-catalog';
import { partImageAlt } from '@/lib/seo';
import { conditionLabels, conditionBadgeClasses, siteConfig } from '@/lib/site-config';
import { effectiveDealPrice } from '@/lib/site-offers';
import { publicPriceLabel, resolveProductOfferPrice } from '@/lib/product-schema';
import type { PartWithRelations, SiteOffer } from '@/lib/types';
import { PUBLIC_PART_DETAIL_SELECT } from '@/lib/public-card-data';
import { PageBreadcrumbs } from '@/components/seo/page-breadcrumbs';

// Public catalog data is read with the anon client, even for signed-in users.
const supabase = getPublicCatalogClient();

export function PartDetailClient({ slug }: { slug: string }) {
  const { dealForPart } = useInventoryDeals();
  const [part, setPart] = useState<PartWithRelations | null>(null);
  const [relatedParts, setRelatedParts] = useState<PartWithRelations[]>([]);
  const [deal, setDeal] = useState<SiteOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [coverIndex, setCoverIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('parts')
        .select(PUBLIC_PART_DETAIL_SELECT)
        .eq('slug', slug)
        .eq('is_published', true)
        .eq('stock_status', 'available')
        .maybeSingle();

      if (error || !data) {
        setNotFoundFlag(true);
        setLoading(false);
        return;
      }

      const typedData = data as unknown as PartWithRelations;
      const sortedPhotos = (typedData.part_photos || []).sort((a, b) => a.sort_order - b.sort_order);
      const coverIndex = sortedPhotos.findIndex((p) => p.is_cover);
      setPart({ ...typedData, part_photos: sortedPhotos });
      setCoverIndex(coverIndex >= 0 ? coverIndex : 0);

      const { data: offerRows } = await supabase
        .from('site_offers')
        .select('*')
        .eq('is_published', true)
        .eq('part_id', typedData.id)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(1);
      setDeal(((offerRows || [])[0] as SiteOffer | undefined) || null);
      setLoading(false);

      // Fetch related parts (same category, excluding this one)
      if (typedData.category_id) {
        const { data: related } = await supabase
          .from('parts')
          .select(PUBLIC_PART_DETAIL_SELECT)
          .eq('is_published', true)
          .eq('stock_status', 'available')
          .eq('category_id', typedData.category_id)
          .neq('id', typedData.id)
          .limit(4);
        setRelatedParts((related || []) as unknown as PartWithRelations[]);
      }
    })();
  }, [slug]);

  if (notFoundFlag) {
    notFound();
  }

  if (loading || !part) {
    return (
      <div className="container-page py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-lg" />
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

  const photos = part.part_photos || [];
  const compatibilities = part.part_compatibility || [];
  const galleryImages = photos.map((photo, index) => ({
    id: photo.id,
    src: publicPartImageUrl(photo.storage_path),
    alt: partImageAlt(part, { photoIndex: index + 1 }),
  }));
  const hasListPrice = Boolean(part.show_price && part.price && part.price > 0);
  const dealPrice = deal ? effectiveDealPrice(hasListPrice ? part.price : null, deal) : null;
  const displayPrice = resolveProductOfferPrice({
    dealPrice,
    showPrice: Boolean(part.show_price),
    price: part.price,
    priceFob: part.price_fob,
    priceCf: part.price_cf,
    priceCif: part.price_cif,
  });
  const priceLabel = publicPriceLabel({
    currency: part.currency,
    stockStatus: part.stock_status,
    dealPrice,
    showPrice: Boolean(part.show_price),
    price: part.price,
    priceFob: part.price_fob,
    priceCf: part.price_cf,
    priceCif: part.price_cif,
    askLabel: 'Ask Price',
  });

  return (
    <div className="overflow-x-clip">
      <div className="page-band">
        <div className="container-page py-5 sm:py-6">
          <PageBreadcrumbs
            includeJsonLd={false}
            items={[
              { name: 'Home', href: '/' },
              { name: 'Parts', href: '/parts' },
              ...(part.categories
                ? [{ name: part.categories.name, href: `/categories/${part.categories.slug}` }]
                : []),
              { name: part.name },
            ]}
          />
        </div>
      </div>

      <div className="surface-mist">
      <div className="container-page py-8 sm:py-10">

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        <PublicImageGallery
          images={galleryImages}
          initialIndex={coverIndex}
          aspectClassName="aspect-square"
          objectFit="contain"
          emptyIcon={<Wrench className="h-20 w-20 text-muted-foreground/30" />}
          badge={
            <Badge variant="outline" className={`capitalize ${conditionBadgeClasses[part.condition] || ''}`}>
              {conditionLabels[part.condition] || part.condition}
            </Badge>
          }
        />

        {/* Product info */}
        <div className="space-y-6">
          <div>
            {part.categories && (
              <Link
                href={`/categories/${part.categories.slug}`}
                className="text-sm font-medium text-accent hover:underline"
              >
                {part.categories.name}
              </Link>
            )}
            <h1 className="mt-1 font-display text-2xl font-black tracking-tight md:text-3xl">{part.name}</h1>
            <p className="mt-2 font-mono text-sm text-muted-foreground">{part.part_code}</p>
          </div>

          {deal ? (
            <InventoryDealBanner
              offer={deal}
              currency={part.currency}
              listPrice={hasListPrice ? part.price : null}
            />
          ) : null}

          {/* Key info grid */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {part.oem_number && (
              <div className="flex items-center gap-2 rounded-xl border border-accent/15 bg-card p-3">
                <Hash className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-xs text-muted-foreground">OEM Number</p>
                  <p className="text-sm font-medium font-mono">{part.oem_number}</p>
                </div>
              </div>
            )}
            {part.part_number && (
              <div className="flex items-center gap-2 rounded-xl border border-accent/15 bg-card p-3">
                <Tag className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-xs text-muted-foreground">Part Number</p>
                  <p className="text-sm font-medium font-mono">{part.part_number}</p>
                </div>
              </div>
            )}
            {part.brand && (
              <div className="flex items-center gap-2 rounded-xl border border-accent/15 bg-card p-3">
                <Box className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-xs text-muted-foreground">Brand</p>
                  <div className="mt-0.5">
                    <BrandLogo brand={part.brand} size="md" />
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-accent/15 bg-card p-3">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Condition</p>
                <p className="text-sm font-medium capitalize">{conditionLabels[part.condition] || part.condition}</p>
              </div>
            </div>
          </div>

          {/* Price & availability */}
          <div className="flex items-center justify-between rounded-2xl border border-accent/20 bg-[#101114] p-4 text-white sm:p-5">
            <div>
              {dealPrice != null ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Deal price</p>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                    <p className="text-2xl font-black">
                      {part.currency} {dealPrice.toLocaleString()}
                    </p>
                    {hasListPrice ? (
                      <span className="text-sm text-white/40 line-through">
                        {part.currency} {part.price!.toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : displayPrice != null ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Price</p>
                  <p className="text-2xl font-black">{priceLabel}</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Price</p>
                  <p className="text-2xl font-black">Ask Price</p>
                </>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Availability</p>
              {part.quantity > 0 ? (
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">In Stock</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-white/50">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Out of Stock</span>
                </div>
              )}
            </div>
          </div>

          <IncotermQuoteStrip
            currency={part.currency}
            showPrice={Boolean(part.show_price)}
            priceFob={part.price_fob}
            priceCf={part.price_cf}
            priceCif={part.price_cif}
          />

          {/* Location */}
          {part.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Location: {part.location}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <SaveItemActions
              size="md"
              showLabels
              item={toPartSaveItem({
                id: part.id,
                slug: part.slug,
                name: part.name,
                part_code: part.part_code,
                priceLabel,
                imageUrl: (() => {
                  const cover = part.part_photos?.find((p) => p.is_cover) || part.part_photos?.[0];
                  return cover ? publicPartImageUrl(cover.storage_path) : null;
                })(),
              })}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <InquiryDialog
                partId={part.id}
                partName={[part.name, part.part_code].filter(Boolean).join(' · ')}
                triggerLabel="Send Inquiry"
                triggerSize="lg"
                triggerVariant="accent"
              />
              <WhatsAppButton
                message={`Hello ${siteConfig.name}, I'm interested in ${part.name} (${part.part_code}). Is it available?`}
                size="lg"
                variant="outline"
              />
            </div>
          </div>

          {/* Description */}
          {part.description && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Description</h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {part.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Compatibility */}
      {compatibilities.length > 0 && (
        <Card className="mt-8 border-accent/15">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Car className="h-5 w-5 text-accent" />
              Vehicle Compatibility
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Make</th>
                    <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Model</th>
                    <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Variant</th>
                    <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Chassis</th>
                    <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Engine</th>
                    <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Years</th>
                  </tr>
                </thead>
                <tbody>
                  {compatibilities.map((comp) => (
                    <tr key={comp.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-4 font-medium">{comp.make}</td>
                      <td className="py-3 pr-4">{comp.model}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{comp.variant || '—'}</td>
                      <td className="py-3 pr-4 font-mono text-muted-foreground">{comp.chassis_code || '—'}</td>
                      <td className="py-3 pr-4 font-mono text-muted-foreground">{comp.engine_code || '—'}</td>
                      <td className="py-3 pr-4">
                        {comp.year_from || comp.year_to ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {comp.year_from || '?'}{comp.year_to ? `–${comp.year_to}` : ''}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Related parts */}
      {relatedParts.length > 0 && (
        <div className="mt-12">
          <Separator className="mb-8" />
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-xl font-black tracking-tight">Related Parts</h2>
            {part.categories ? (
              <Link
                href={`/categories/${part.categories.slug}`}
                className="text-sm font-semibold text-accent hover:underline"
              >
                More in {part.categories.name}
              </Link>
            ) : (
              <Link href="/parts" className="text-sm font-semibold text-accent hover:underline">
                Browse all parts
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {relatedParts.map((rp) => (
              <PartCard key={rp.id} part={rp} deal={dealForPart(rp.id)} />
            ))}
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

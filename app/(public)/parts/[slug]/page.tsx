'use client';

import { useState, useEffect, use } from 'react';
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
import { PartCard } from '@/components/public/part-card';
import { InquiryDialog } from '@/components/public/inquiry-dialog';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { BrandLogo } from '@/components/public/brand-logo';
import { InventoryDealBanner } from '@/components/public/inventory-deal-banner';
import { IncotermQuoteStrip } from '@/components/public/incoterm-quote-strip';
import { SaveItemActions, toPartSaveItem } from '@/components/public/save-item-actions';
import { publicPartImageUrl } from '@/components/public/catalog-image';
import { useInventoryDeals } from '@/hooks/use-inventory-deals';
import { supabase } from '@/lib/supabase/client';
import { conditionLabels, conditionBadgeClasses, siteConfig } from '@/lib/site-config';
import { effectiveDealPrice } from '@/lib/site-offers';
import type { PartWithRelations, SiteOffer } from '@/lib/types';
import { JsonLd } from '@/components/seo/json-ld';

export default function PartDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = use(props.params);
  const { slug } = params;
  const { dealForPart } = useInventoryDeals();
  const [part, setPart] = useState<PartWithRelations | null>(null);
  const [relatedParts, setRelatedParts] = useState<PartWithRelations[]>([]);
  const [deal, setDeal] = useState<SiteOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('parts')
        .select('*, categories(*), part_photos(*), part_compatibility(*)')
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
      setSelectedImage(coverIndex >= 0 ? coverIndex : 0);

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
          .select('*, categories(*), part_photos(*), part_compatibility(*)')
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
  const currentPhoto = photos[selectedImage];
  const photoUrl = currentPhoto
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/part-images/${currentPhoto.storage_path}`
    : null;
  const hasListPrice = Boolean(part.show_price && part.price && part.price > 0);
  const dealPrice = deal ? effectiveDealPrice(hasListPrice ? part.price : null, deal) : null;

  const navigatePhoto = (dir: 'prev' | 'next') => {
    setSelectedImage((prev) => {
      if (dir === 'prev') return prev === 0 ? photos.length - 1 : prev - 1;
      return prev === photos.length - 1 ? 0 : prev + 1;
    });
  };

  return (
    <div className="overflow-x-clip">
      <div className="page-band">
        <div className="container-page py-5 sm:py-6">
          <nav className="flex min-w-0 items-center gap-1.5 text-sm text-white/55">
            <Link href="/" className="shrink-0 hover:text-white">Home</Link>
            <ChevronRight className="h-4 w-4 shrink-0" />
            <Link href="/parts" className="shrink-0 hover:text-white">Parts</Link>
            {part.categories && (
              <>
                <ChevronRight className="h-4 w-4 shrink-0" />
                <Link href={`/categories/${part.categories.slug}`} className="shrink-0 hover:text-white">
                  {part.categories.name}
                </Link>
              </>
            )}
            <ChevronRight className="h-4 w-4 shrink-0" />
            <span className="truncate font-medium text-white">{part.name}</span>
          </nav>
        </div>
      </div>

      <div className="surface-mist">
      <div className="container-page py-8 sm:py-10">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: part.name,
          description: part.description || `${part.name} supplied by ${siteConfig.name}`,
          sku: part.part_code,
          mpn: part.part_number || part.oem_number || undefined,
          brand: part.brand ? { '@type': 'Brand', name: part.brand } : undefined,
          image: photos.map((photo) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/part-images/${photo.storage_path}`),
          url: `${siteConfig.url}/parts/${part.slug}`,
          offers: {
            '@type': 'Offer',
            availability: part.quantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            priceCurrency: part.currency,
            price: dealPrice ?? (part.show_price && part.price ? part.price : undefined),
            url: `${siteConfig.url}/parts/${part.slug}`,
          },
        }}
      />

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        {/* Image gallery */}
        <div className="space-y-4">
          <div
            className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-2xl border border-accent/15 bg-card shadow-sm"
            onClick={() => photoUrl && setLightboxOpen(true)}
            role={photoUrl ? 'button' : undefined}
            tabIndex={photoUrl ? 0 : undefined}
            onKeyDown={(event) => {
              if (photoUrl && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                setLightboxOpen(true);
              }
            }}
            aria-label={photoUrl ? `Open ${part.name} image ${selectedImage + 1} in full screen` : undefined}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={part.name}
                className="h-full w-full object-contain p-3 sm:p-6"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Wrench className="h-20 w-20 text-muted-foreground/30" />
              </div>
            )}
            <div className="absolute top-3 left-3">
              <Badge variant="outline" className={`capitalize ${conditionBadgeClasses[part.condition] || ''}`}>
                {conditionLabels[part.condition] || part.condition}
              </Badge>
            </div>
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

          {/* Thumbnails */}
          {photos.length > 1 && (
            <div className="flex snap-x gap-2 overflow-x-auto pb-2" aria-label="Part photo thumbnails">
              {photos.map((photo, idx) => {
                const thumbUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/part-images/${photo.storage_path}`;
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
                      alt={`${part.name} ${idx + 1}`}
                      className="h-full w-full object-contain p-1"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
              ) : hasListPrice ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Price</p>
                  <p className="text-2xl font-black">
                    {part.currency} {part.price!.toLocaleString()}
                  </p>
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
                priceLabel: part.show_price && part.price
                  ? `${part.currency} ${part.price.toLocaleString()}`
                  : 'Ask for quote',
                imageUrl: (() => {
                  const cover = part.part_photos?.find((p) => p.is_cover) || part.part_photos?.[0];
                  return cover ? publicPartImageUrl(cover.storage_path) : null;
                })(),
              })}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <InquiryDialog
                partId={part.id}
                partName={part.name}
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

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="h-[92vh] max-w-[96vw] overflow-hidden border-white/10 bg-black/95 p-0 sm:max-w-6xl">
          <DialogTitle className="sr-only">{part.name} — Image {selectedImage + 1}</DialogTitle>
          <div className="relative flex h-full min-h-[50vh] flex-col items-center justify-center p-4 pb-24 sm:p-8 sm:pb-28">
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={part.name}
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
                      <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/part-images/${photo.storage_path}`} alt="" className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Related parts */}
      {relatedParts.length > 0 && (
        <div className="mt-12">
          <Separator className="mb-8" />
          <h2 className="mb-6 font-display text-xl font-black tracking-tight">Related Parts</h2>
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

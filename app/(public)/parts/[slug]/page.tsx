'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
import { supabase } from '@/lib/supabase/client';
import { conditionLabels, conditionBadgeClasses, siteConfig } from '@/lib/site-config';
import type { PartWithRelations } from '@/lib/types';

export default function PartDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [part, setPart] = useState<PartWithRelations | null>(null);
  const [relatedParts, setRelatedParts] = useState<PartWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('parts')
        .select('*, categories(*), part_photos(*), part_compatibility(*)')
        .eq('slug', slug)
        .eq('is_published', true)
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
      setLoading(false);

      // Fetch related parts (same category, excluding this one)
      if (typedData.category_id) {
        const { data: related } = await supabase
          .from('parts')
          .select('*, categories(*), part_photos(*), part_compatibility(*)')
          .eq('is_published', true)
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

  return (
    <div className="container-page py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/parts" className="hover:text-foreground">Parts</Link>
        {part.categories && (
          <>
            <ChevronRight className="h-4 w-4" />
            <Link href={`/categories/${part.categories.slug}`} className="hover:text-foreground">
              {part.categories.name}
            </Link>
          </>
        )}
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium truncate">{part.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Image gallery */}
        <div className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary">
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt={part.name}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                priority
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
          </div>

          {/* Thumbnails */}
          {photos.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {photos.map((photo, idx) => {
                const thumbUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/part-images/${photo.storage_path}`;
                return (
                  <button
                    key={photo.id}
                    onClick={() => setSelectedImage(idx)}
                    className={`relative aspect-square overflow-hidden rounded-md border-2 transition-all ${
                      idx === selectedImage ? 'border-primary' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Image
                      src={thumbUrl}
                      alt={`${part.name} ${idx + 1}`}
                      fill
                      sizes="80px"
                      className="object-cover"
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
                className="text-sm font-medium text-primary hover:underline"
              >
                {part.categories.name}
              </Link>
            )}
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{part.name}</h1>
            <p className="mt-2 font-mono text-sm text-muted-foreground">{part.part_code}</p>
          </div>

          {/* Key info grid */}
          <div className="grid grid-cols-2 gap-4">
            {part.oem_number && (
              <div className="flex items-center gap-2 rounded-lg border border-border p-3">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">OEM Number</p>
                  <p className="text-sm font-medium font-mono">{part.oem_number}</p>
                </div>
              </div>
            )}
            {part.part_number && (
              <div className="flex items-center gap-2 rounded-lg border border-border p-3">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Part Number</p>
                  <p className="text-sm font-medium font-mono">{part.part_number}</p>
                </div>
              </div>
            )}
            {part.brand && (
              <div className="flex items-center gap-2 rounded-lg border border-border p-3">
                <Box className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Brand</p>
                  <p className="text-sm font-medium">{part.brand}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg border border-border p-3">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Condition</p>
                <p className="text-sm font-medium capitalize">{conditionLabels[part.condition] || part.condition}</p>
              </div>
            </div>
          </div>

          {/* Price & availability */}
          <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
            <div>
              {part.show_price && part.price ? (
                <>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="text-2xl font-bold">
                    {part.currency} {part.price.toLocaleString()}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="text-lg font-semibold text-muted-foreground">Price on inquiry</p>
                </>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Availability</p>
              {part.quantity > 0 ? (
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">In Stock</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Out of Stock</span>
                </div>
              )}
            </div>
          </div>

          {/* Location */}
          {part.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Location: {part.location}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <InquiryDialog
              partId={part.id}
              partName={part.name}
              triggerLabel="Send Inquiry"
              triggerSize="lg"
              triggerVariant="default"
            />
            <WhatsAppButton
              message={`Hello ${siteConfig.name}, I'm interested in ${part.name} (${part.part_code}). Is it available?`}
              size="lg"
              variant="outline"
            />
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
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Car className="h-5 w-5 text-primary" />
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
          <h2 className="mb-6 text-xl font-bold tracking-tight">Related Parts</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedParts.map((rp) => (
              <PartCard key={rp.id} part={rp} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

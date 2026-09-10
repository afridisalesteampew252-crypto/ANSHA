'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Wrench, ArrowRight, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { conditionBadgeClasses, conditionLabels, siteConfig } from '@/lib/site-config';
import type { PartWithRelations } from '@/lib/types';

interface PartCardProps {
  part: PartWithRelations;
}

export function PartCard({ part }: PartCardProps) {
  const coverPhoto = part.part_photos?.find((p) => p.is_cover) || part.part_photos?.[0];
  const compatibility = part.part_compatibility?.[0];
  const photoUrl = coverPhoto
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/part-images/${coverPhoto.storage_path}`
    : null;

  const hasPrice = part.show_price && part.price && part.price > 0;
  const waMessage = `Hello ${siteConfig.name}, I'm interested in ${part.name} (${part.part_code}). Is it available?`;
  const waHref = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(waMessage)}`;

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg hover:border-foreground/15">
      <Link href={`/parts/${part.slug}`} className="block">
        <div className="relative aspect-square bg-secondary overflow-hidden">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={part.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Wrench className="h-12 w-12 text-muted-foreground/25" />
            </div>
          )}
          <div className="absolute top-2.5 left-2.5">
            <Badge variant="outline" className={`capitalize backdrop-blur-sm ${conditionBadgeClasses[part.condition] || ''}`}>
              {conditionLabels[part.condition] || part.condition}
            </Badge>
          </div>
          {part.quantity > 0 && (
            <div className="absolute top-2.5 right-2.5">
              <Badge variant="outline" className="bg-white/90 backdrop-blur-sm text-emerald-700 border-emerald-200">
                In Stock
              </Badge>
            </div>
          )}
        </div>
      </Link>

      <CardContent className="p-4">
        <Link href={`/parts/${part.slug}`} className="block">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 transition-colors group-hover:text-foreground">
            {part.name}
          </h3>
        </Link>
        <p className="mt-1 text-xs text-muted-foreground font-mono">{part.part_code}</p>
        {compatibility && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
            {compatibility.make} {compatibility.model}
            {compatibility.chassis_code ? ` • ${compatibility.chassis_code}` : ''}
            {compatibility.year_from ? ` • ${compatibility.year_from}${compatibility.year_to ? `–${compatibility.year_to}` : ''}` : ''}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            {hasPrice ? (
              <span className="font-bold text-base">
                {part.currency} {part.price!.toLocaleString()}
              </span>
            ) : (
              <span className="text-sm font-semibold text-foreground">Ask Price</span>
            )}
          </div>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#25D366] text-white transition-opacity hover:opacity-90"
            title="Inquire on WhatsApp"
          >
            <MessageCircle className="h-4 w-4" />
          </a>
        </div>
        <Link
          href={`/parts/${part.slug}`}
          className="mt-2.5 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View Details
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </CardContent>
    </Card>
  );
}

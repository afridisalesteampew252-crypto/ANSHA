'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Search, Wrench, ShieldCheck, Truck, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { conditionBadgeClasses, conditionLabels } from '@/lib/site-config';
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

  return (
    <Link href={`/parts/${part.slug}`} className="group block">
      <Card className="overflow-hidden transition-all hover:shadow-md hover:border-primary/30">
        <div className="relative aspect-square bg-secondary overflow-hidden">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={part.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Wrench className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          <div className="absolute top-2 left-2">
            <Badge variant="outline" className={`capitalize ${conditionBadgeClasses[part.condition] || ''}`}>
              {conditionLabels[part.condition] || part.condition}
            </Badge>
          </div>
          {part.quantity > 0 && (
            <div className="absolute top-2 right-2">
              <Badge variant="outline" className="bg-white/90 text-emerald-700 border-emerald-200">
                Available
              </Badge>
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {part.name}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground font-mono">{part.part_code}</p>
          {compatibility && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
              {compatibility.make} {compatibility.model}
              {compatibility.chassis_code ? ` • ${compatibility.chassis_code}` : ''}
              {compatibility.year_from ? ` • ${compatibility.year_from}${compatibility.year_to ? `–${compatibility.year_to}` : ''}` : ''}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between">
            {part.show_price && part.price ? (
              <span className="font-bold text-sm">
                {part.currency} {part.price.toLocaleString()}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Price on inquiry</span>
            )}
            <span className="text-xs font-medium text-primary group-hover:underline">
              View Details →
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

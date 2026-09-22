'use client';

import { Car } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { publicVehicleImageUrl } from '@/components/public/catalog-image';
import { PublicImageGallery } from '@/components/public/public-image-gallery';
import { vehicleImageAlt } from '@/lib/seo';
import type { VehiclePhoto } from '@/lib/types';

type VehiclePhotoGalleryProps = {
  title: string;
  photos: VehiclePhoto[];
  featured?: boolean;
  initialIndex?: number;
  /** Optional year/make/model for alt text (never invents specs). */
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
};

/** Same public props API — internals now share swipe/thumbs/fullscreen gallery. */
export function VehiclePhotoGallery({
  title,
  photos,
  featured = false,
  initialIndex = 0,
  year,
  make,
  model,
}: VehiclePhotoGalleryProps) {
  const altBase = { title, year, make, model };
  const images = photos.map((photo, index) => ({
    id: photo.id,
    src: publicVehicleImageUrl(photo.storage_path),
    alt: vehicleImageAlt(altBase, { photoIndex: index + 1 }),
  }));

  return (
    <PublicImageGallery
      images={images}
      initialIndex={initialIndex}
      objectFit="contain"
      emptyIcon={<Car className="h-20 w-20 text-muted-foreground/30" />}
      badge={featured ? <Badge className="border-foreground bg-foreground text-background">Featured</Badge> : undefined}
    />
  );
}

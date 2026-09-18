'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

type CatalogImageProps = {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
  objectFit?: 'contain' | 'cover';
};

/** Optimized catalog/media image. Use for Supabase public buckets and local /images. */
export function CatalogImage({
  src,
  alt,
  fill,
  width,
  height,
  className,
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  priority = false,
  objectFit = 'contain',
}: CatalogImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      priority={priority}
      quality={72}
      className={cn(objectFit === 'cover' ? 'object-cover' : 'object-contain', className)}
    />
  );
}

export function publicPartImageUrl(storagePath: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/part-images/${storagePath}`;
}

export function publicVehicleImageUrl(storagePath: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-images/${storagePath}`;
}

import type { Metadata } from 'next';
import { getPublicVehicleBySlug } from '@/lib/public-listing-data';
import { publicVehicleImageUrl } from '@/lib/public-media';
import {
  absoluteMediaUrl,
  buildPageMetadata,
  defaultOgImage,
  sanitizeDescription,
  vehicleListingTitle,
} from '@/lib/seo';
import { siteConfig } from '@/lib/site-config';

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicVehicleBySlug(slug);

  if (!data) {
    return {
      title: 'Vehicle not found',
      robots: { index: false, follow: false },
    };
  }

  const photos = data.vehicle_photos || [];
  const cover = photos.find((p) => p.is_cover) || photos[0];
  const imageUrl = cover?.storage_path
    ? publicVehicleImageUrl(cover.storage_path)
    : absoluteMediaUrl(defaultOgImage.url);

  const title = vehicleListingTitle({
    title: data.title,
    year: data.year,
    make: data.make,
    model: data.model,
    variant: data.variant,
  });

  const ymm = [data.year, data.make, data.model].filter(Boolean).join(' ');
  const description = sanitizeDescription(
    data.description?.trim() ||
      (ymm
        ? `${ymm} — published export vehicle from ${siteConfig.name}.`
        : `Published export vehicle from ${siteConfig.name}.`)
  );

  return buildPageMetadata({
    title,
    description,
    path: `/vehicles/${slug}`,
    image: { url: imageUrl, alt: title },
  });
}

export default function VehicleSlugLayout({ children }: Props) {
  return children;
}

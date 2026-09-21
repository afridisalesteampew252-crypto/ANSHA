import type { Metadata } from 'next';
import { createPublicSupabaseClient } from '@/lib/supabase/public';
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
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from('vehicles')
    .select(
      'title, description, make, model, year, variant, vehicle_photos(storage_path, is_cover, sort_order, is_auction_sheet)'
    )
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('stock_status', 'available')
    .maybeSingle();

  if (!data) {
    return {
      title: 'Vehicle not found',
      robots: { index: false, follow: false },
    };
  }

  const rawPhotos = (data.vehicle_photos || []) as Array<{
    storage_path: string;
    is_cover: boolean | null;
    sort_order: number | null;
    is_auction_sheet: boolean | null;
  }>;
  const photos = rawPhotos
    .filter((photo) => !photo.is_auction_sheet)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
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

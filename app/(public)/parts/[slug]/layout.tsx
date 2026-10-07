import type { Metadata } from 'next';
import { getPublicPartBySlug } from '@/lib/public-listing-data';
import { publicPartImageUrl } from '@/lib/public-media';
import {
  absoluteMediaUrl,
  buildPageMetadata,
  defaultOgImage,
  sanitizeDescription,
  sanitizeTitle,
} from '@/lib/seo';
import { siteConfig } from '@/lib/site-config';
import { buildPartIdentity } from '@/lib/part-identity';

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicPartBySlug(slug);

  if (!data) {
    return {
      title: 'Part not found',
      robots: { index: false, follow: false },
    };
  }

  const photos = data.part_photos || [];
  const cover = photos.find((p) => p.is_cover) || photos[0];
  const imageUrl = cover?.storage_path
    ? publicPartImageUrl(cover.storage_path)
    : absoluteMediaUrl(defaultOgImage.url);

  const identity = buildPartIdentity({ ...data, compatibility: data.part_compatibility });
  const title = sanitizeTitle(data.meta_title?.trim() || identity.meta_title);
  const description = sanitizeDescription(
    data.meta_description?.trim() ||
      data.description?.trim() || identity.meta_description ||
      [
        data.name,
        data.part_code ? `(${data.part_code})` : null,
        data.brand ? `— ${data.brand}` : null,
        `from ${siteConfig.name}.`,
      ]
        .filter(Boolean)
        .join(' ')
  );

  return buildPageMetadata({
    title,
    description,
    path: `/parts/${slug}`,
    image: { url: imageUrl, alt: title },
  });
}

export default function PartSlugLayout({ children }: Props) {
  return children;
}

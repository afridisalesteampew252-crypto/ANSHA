import type { Metadata } from 'next';
import { createPublicSupabaseClient, absoluteUrl } from '@/lib/supabase/public';
import { publicPartImageUrl } from '@/lib/public-media';
import { defaultOgImage } from '@/lib/seo';
import { siteConfig } from '@/lib/site-config';

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from('parts')
    .select('name, description, part_code, brand, part_photos(storage_path, is_cover, sort_order)')
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('stock_status', 'available')
    .maybeSingle();

  if (!data) {
    return {
      title: 'Part not found',
      robots: { index: false, follow: false },
    };
  }

  const photos = [...(data.part_photos || [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const cover = photos.find((p) => p.is_cover) || photos[0];
  const imageUrl = cover?.storage_path
    ? publicPartImageUrl(cover.storage_path)
    : absoluteUrl(defaultOgImage.url);

  const title = data.name;
  const description =
    data.description?.trim() ||
    `${data.name}${data.part_code ? ` (${data.part_code})` : ''}${data.brand ? ` — ${data.brand}` : ''} from ${siteConfig.name}.`;

  return {
    title,
    description,
    alternates: { canonical: `/parts/${slug}` },
    openGraph: {
      title: `${title} | ${siteConfig.name}`,
      description,
      url: absoluteUrl(`/parts/${slug}`),
      type: 'website',
      images: [{ url: imageUrl, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function PartSlugLayout({ children }: Props) {
  return children;
}

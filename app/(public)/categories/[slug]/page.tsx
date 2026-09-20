import type { Metadata } from 'next';
import { CategoryDetailClient } from '@/components/public/category-detail-client';
import { createPublicSupabaseClient, absoluteUrl } from '@/lib/supabase/public';
import { siteConfig } from '@/lib/site-config';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from('categories')
    .select('name, description, meta_title, meta_description')
    .eq('slug', slug)
    .maybeSingle();
  const title = data?.meta_title || data?.name || 'Category';
  const description =
    data?.meta_description ||
    data?.description ||
    `${data?.name || 'Category'} parts from ${siteConfig.name} — published inventory for export.`;
  return {
    title,
    description,
    alternates: { canonical: `/categories/${slug}` },
    openGraph: {
      title: `${title} | ${siteConfig.name}`,
      description,
      url: absoluteUrl(`/categories/${slug}`),
      images: [{ url: '/images/og-default.jpg', alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${siteConfig.name}`,
      description,
      images: ['/images/og-default.jpg'],
    },
  };
}

export default async function CategoryDetailPage(props: Props) {
  const params = await props.params;
  return <CategoryDetailClient slug={params.slug} />;
}

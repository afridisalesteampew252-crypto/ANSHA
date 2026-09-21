import type { Metadata } from 'next';
import { BlogPostClient } from '@/components/public/blog-post-client';
import { JsonLd } from '@/components/seo/json-ld';
import { blogImageUrl } from '@/lib/blog-image';
import { createPublicSupabaseClient, absoluteUrl } from '@/lib/supabase/public';
import { buildArticleJsonLd, buildBreadcrumbListJsonLd } from '@/lib/seo-schema';
import { siteConfig } from '@/lib/site-config';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from('blog_posts')
    .select('title, excerpt, meta_title, meta_description, featured_image, published_at, updated_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (!data) {
    return {
      title: 'Article not found',
      robots: { index: false, follow: false },
    };
  }

  const title = data.meta_title || data.title;
  const description =
    data.meta_description ||
    data.excerpt ||
    `${data.title} — insights from ${siteConfig.name}.`;
  const canonical = `/blog/${slug}`;
  const imageUrl = blogImageUrl(data.featured_image, { absolute: true }) || absoluteUrl('/images/og-default.jpg');

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${siteConfig.name}`,
      description,
      url: absoluteUrl(canonical),
      type: 'article',
      publishedTime: data.published_at || undefined,
      modifiedTime: data.updated_at || undefined,
      images: [{ url: imageUrl, alt: data.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function BlogPostPage(props: Props) {
  const { slug } = await props.params;
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from('blog_posts')
    .select('title, excerpt, slug, published_at, updated_at, featured_image, meta_description, blog_categories(name, slug)')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  const cover = data ? blogImageUrl(data.featured_image, { absolute: true }) : null;
  const rawCategory = data?.blog_categories as
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null
    | undefined;
  const category = Array.isArray(rawCategory) ? rawCategory[0] : rawCategory;
  const articleUrl = data ? absoluteUrl(`/blog/${data.slug}`) : null;

  const articleJsonLd = data && articleUrl
    ? buildArticleJsonLd({
        headline: data.title,
        description: data.meta_description || data.excerpt,
        url: articleUrl,
        datePublished: data.published_at,
        dateModified: data.updated_at,
        image: cover,
      })
    : null;

  const breadcrumbJsonLd = data
    ? buildBreadcrumbListJsonLd([
        { name: 'Home', href: '/' },
        { name: 'Insights', href: '/blog' },
        ...(category ? [{ name: category.name, href: `/blog?category=${category.slug}` }] : []),
        { name: data.title },
      ])
    : null;

  return (
    <>
      {articleJsonLd ? <JsonLd data={articleJsonLd} /> : null}
      {breadcrumbJsonLd ? <JsonLd data={breadcrumbJsonLd} /> : null}
      <BlogPostClient slug={slug} />
    </>
  );
}

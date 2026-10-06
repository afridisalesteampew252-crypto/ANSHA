import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { BlogPostClient } from '@/components/public/blog-post-client';
import { JsonLd } from '@/components/seo/json-ld';
import { blogImageUrl } from '@/lib/blog-image';
import { createPublicSupabaseClient, absoluteUrl } from '@/lib/supabase/public';
import { buildArticleJsonLd, buildBreadcrumbListJsonLd } from '@/lib/seo-schema';
import { stripTrailingBrand } from '@/lib/seo';
import { siteConfig } from '@/lib/site-config';
import type { BlogPostWithCategory } from '@/lib/types';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublishedPost(slug);

  if (!data) {
    return {
      title: 'Article not found',
      robots: { index: false, follow: false },
    };
  }

  const title = stripTrailingBrand(data.meta_title || data.title);
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

/** ISR: cached at the edge, refreshed every 10 minutes. */
export const revalidate = 600;

export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

const getPublishedPost = cache(async (slug: string) => {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*, blog_categories(*)')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw new Error(`Blog post lookup failed: ${error.message}`);
  return (data as unknown as BlogPostWithCategory | null) || null;
});

async function getRelatedPosts(post: BlogPostWithCategory): Promise<BlogPostWithCategory[]> {
  const supabase = createPublicSupabaseClient();
  const latest = () =>
    supabase
      .from('blog_posts')
      .select('*, blog_categories(*)')
      .eq('status', 'published')
      .neq('id', post.id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(3);
  if (post.category_id) {
    const { data } = await supabase
      .from('blog_posts')
      .select('*, blog_categories(*)')
      .eq('status', 'published')
      .eq('category_id', post.category_id)
      .neq('id', post.id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(3);
    if (data && data.length > 0) return data as unknown as BlogPostWithCategory[];
  }
  const { data } = await latest();
  return (data || []) as unknown as BlogPostWithCategory[];
}

export default async function BlogPostPage(props: Props) {
  const { slug } = await props.params;
  const data = await getPublishedPost(slug);
  if (!data) notFound();
  const related = await getRelatedPosts(data);

  const cover = blogImageUrl(data.featured_image, { absolute: true });
  const category = data.blog_categories as { name: string; slug: string } | null;
  const articleUrl = absoluteUrl(`/blog/${data.slug}`);

  const articleJsonLd = buildArticleJsonLd({
    headline: data.title,
    description: data.meta_description || data.excerpt,
    url: articleUrl,
    datePublished: data.published_at,
    dateModified: data.updated_at,
    image: cover,
  });

  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: 'Home', href: '/' },
    { name: 'Insights', href: '/blog' },
    ...(category ? [{ name: category.name, href: `/blog?category=${category.slug}` }] : []),
    { name: data.title },
  ]);

  return (
    <>
      {articleJsonLd ? <JsonLd data={articleJsonLd} /> : null}
      {breadcrumbJsonLd ? <JsonLd data={breadcrumbJsonLd} /> : null}
      <BlogPostClient post={data} related={related} />
    </>
  );
}

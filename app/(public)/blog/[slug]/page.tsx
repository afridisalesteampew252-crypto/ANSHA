import type { Metadata } from 'next';
import { BlogPostClient } from '@/components/public/blog-post-client';
import { createPublicSupabaseClient, absoluteUrl } from '@/lib/supabase/public';
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
  const imageUrl = data.featured_image
    ? data.featured_image.startsWith('http')
      ? data.featured_image
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/blog-images/${data.featured_image}`
    : absoluteUrl('/images/ansha-logo-transparent.webp');

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
    .select('title, excerpt, slug, published_at, updated_at, featured_image, meta_description')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  const jsonLd = data
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: data.title,
        description: data.meta_description || data.excerpt || undefined,
        datePublished: data.published_at || undefined,
        dateModified: data.updated_at || undefined,
        author: { '@type': 'Organization', name: siteConfig.name },
        publisher: {
          '@type': 'Organization',
          name: siteConfig.name,
          url: siteConfig.url,
        },
        mainEntityOfPage: absoluteUrl(`/blog/${data.slug}`),
      }
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <BlogPostClient slug={slug} />
    </>
  );
}

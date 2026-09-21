import { BlogIndexClient } from '@/components/public/blog-index-client';
import { JsonLd } from '@/components/seo/json-ld';
import { blogImageUrl } from '@/lib/blog-image';
import { absoluteUrl } from '@/lib/seo';
import { buildItemListJsonLd } from '@/lib/seo-schema';
import { createPublicSupabaseClient } from '@/lib/supabase/public';

export default async function BlogPage() {
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from('blog_posts')
    .select('title, slug, featured_image')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(12);

  const posts = data || [];
  const itemListJsonLd = posts.length
    ? buildItemListJsonLd({
        name: 'ANSHA insights & buying guides',
        url: '/blog',
        items: posts.map((post) => ({
          name: post.title,
          url: absoluteUrl(`/blog/${post.slug}`),
          image: blogImageUrl(post.featured_image, { absolute: true }),
        })),
      })
    : null;

  return (
    <>
      {itemListJsonLd ? <JsonLd data={itemListJsonLd} /> : null}
      <BlogIndexClient />
    </>
  );
}

import { BlogIndexClient } from '@/components/public/blog-index-client';
import { JsonLd } from '@/components/seo/json-ld';
import { blogImageUrl } from '@/lib/blog-image';
import {
  PUBLIC_BLOG_CARD_SELECT,
  type PublicBlogCard,
  type PublicCategoryCard,
} from '@/lib/public-card-data';
import { absoluteUrl } from '@/lib/seo';
import { buildItemListJsonLd } from '@/lib/seo-schema';
import { createPublicSupabaseClient } from '@/lib/supabase/public';

const INITIAL_POSTS = 9;

export default async function BlogPage() {
  const supabase = createPublicSupabaseClient();
  const [postsResult, categoriesResult, featuredResult] = await Promise.all([
    supabase
      .from('blog_posts')
      .select(PUBLIC_BLOG_CARD_SELECT)
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(INITIAL_POSTS + 1),
    supabase.from('blog_categories').select('id,name,slug').order('name'),
    supabase
      .from('blog_posts')
      .select(PUBLIC_BLOG_CARD_SELECT)
      .eq('status', 'published')
      .eq('is_featured', true)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const allPosts = (postsResult.data || []) as unknown as PublicBlogCard[];
  const posts = allPosts.slice(0, INITIAL_POSTS);
  const categories = (categoriesResult.data || []) as unknown as PublicCategoryCard[];
  const featured = (featuredResult.data || null) as unknown as PublicBlogCard | null;
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
      <BlogIndexClient
        initialPosts={posts}
        initialCategories={categories}
        initialFeatured={featured}
        initialHasMore={allPosts.length > INITIAL_POSTS}
      />
    </>
  );
}

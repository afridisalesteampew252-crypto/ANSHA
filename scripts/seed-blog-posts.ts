/**
 * Seeds blog categories + posts into Supabase (idempotent on slug).
 * Usage from ANSHA/: npx tsx --env-file=.env.local scripts/seed-blog-posts.ts
 */
import { createClient } from '@supabase/supabase-js';
import { blogSeedCategories, blogSeedPosts } from '../lib/content/blog-seed-posts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  for (const cat of blogSeedCategories) {
    const { error } = await supabase.from('blog_categories').upsert(
      {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
      },
      { onConflict: 'slug' }
    );
    if (error) throw error;
    console.log('category', cat.slug);
  }

  const { data: cats, error: catErr } = await supabase.from('blog_categories').select('id, slug');
  if (catErr) throw catErr;
  const idBySlug = Object.fromEntries((cats || []).map((c) => [c.slug, c.id]));

  for (const post of blogSeedPosts) {
    const category_id = idBySlug[post.category_slug] || null;
    const { error } = await supabase.from('blog_posts').upsert(
      {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        category_id,
        status: 'published',
        is_featured: Boolean(post.is_featured),
        meta_title: post.meta_title,
        meta_description: post.meta_description,
        published_at: post.published_at,
      },
      { onConflict: 'slug' }
    );
    if (error) throw error;
    console.log('post', post.slug);
  }

  await supabase
    .from('blog_posts')
    .update({
      meta_description:
        'ANSHA TRADING supplies Japanese used cars, auto parts, OEM remotes, and machinery for export from Dubai. Browse stock or ask for a quote.',
      excerpt:
        'ANSHA TRADING sources Japanese used cars, automotive parts, and machinery for export buyers — from Dubai, with ask-for-quote support.',
    })
    .eq('slug', 'japanese-auto-parts-supplier');

  await supabase
    .from('blog_posts')
    .update({ is_featured: false })
    .neq('slug', 'buying-used-cars-japan-auction-sheets');
  await supabase
    .from('blog_posts')
    .update({ is_featured: true })
    .eq('slug', 'buying-used-cars-japan-auction-sheets');

  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

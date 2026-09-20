import { writeFileSync } from 'fs';
import { blogSeedCategories, blogSeedPosts } from '../lib/content/blog-seed-posts';

function esc(s: string) {
  return s.replace(/'/g, "''");
}

const lines: string[] = [];
lines.push('-- Seed ANSHA blog categories and SEO posts');

for (const c of blogSeedCategories) {
  lines.push(`INSERT INTO blog_categories (name, slug, description)
VALUES ('${esc(c.name)}', '${esc(c.slug)}', '${esc(c.description)}')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;`);
}

for (const p of blogSeedPosts) {
  const tag = `html_${p.slug.replace(/-/g, '_')}`;
  lines.push(`INSERT INTO blog_posts (title, slug, excerpt, content, category_id, status, is_featured, meta_title, meta_description, published_at)
VALUES (
  '${esc(p.title)}',
  '${esc(p.slug)}',
  '${esc(p.excerpt)}',
  $${tag}$${p.content}$${tag}$,
  (SELECT id FROM blog_categories WHERE slug = '${esc(p.category_slug)}'),
  'published',
  ${p.is_featured ? 'true' : 'false'},
  '${esc(p.meta_title)}',
  '${esc(p.meta_description)}',
  '${p.published_at}'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  content = EXCLUDED.content,
  category_id = EXCLUDED.category_id,
  status = 'published',
  is_featured = EXCLUDED.is_featured,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  published_at = EXCLUDED.published_at,
  updated_at = now();`);
}

lines.push(`UPDATE blog_posts SET
  meta_description = 'ANSHA TRADING supplies Japanese used cars, auto parts, OEM remotes, and machinery for export from Dubai. Browse stock or ask for a quote.',
  excerpt = 'ANSHA TRADING sources Japanese used cars, automotive parts, and machinery for export buyers — from Dubai, with ask-for-quote support.'
WHERE slug = 'japanese-auto-parts-supplier';`);

lines.push(`UPDATE blog_posts SET is_featured = false WHERE slug <> 'buying-used-cars-japan-auction-sheets';`);
lines.push(`UPDATE blog_posts SET is_featured = true WHERE slug = 'buying-used-cars-japan-auction-sheets';`);

lines.push(`UPDATE blog_posts SET featured_image = '/images/blog/' || slug || '.svg'
WHERE slug IN (
  'buying-used-cars-japan-auction-sheets',
  'oem-vs-aftermarket-auto-parts',
  'shipping-used-vehicles-dubai-export-guide',
  'keyless-entry-smart-keys-buyers-guide',
  'sourcing-heavy-machinery-trucks',
  'make-model-year-color-stock-search'
)
AND (featured_image IS NULL OR featured_image = '' OR featured_image LIKE '/images/blog/%');`);

writeFileSync(new URL('./seed-blog-posts.sql', import.meta.url), lines.join('\n\n'));
console.log('wrote scripts/seed-blog-posts.sql');

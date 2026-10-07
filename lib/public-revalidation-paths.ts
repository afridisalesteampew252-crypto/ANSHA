export type PublicListingKind = 'vehicle' | 'part' | 'offer';
export type PublicRevalidationPath = { path: string; type?: 'page' };
const SLUG_RE = /^[A-Za-z0-9._~-]{1,200}$/;
const MAX_SLUGS = 10;

export function sanitizeListingSlugs(slugs: unknown): string[] {
  if (!Array.isArray(slugs)) return [];
  return Array.from(new Set(slugs.filter((slug): slug is string => typeof slug === 'string' && SLUG_RE.test(slug)))).slice(0, MAX_SLUGS);
}

/** No slugs means a bulk change: invalidate the route pattern, including every detail page. */
export function publicRevalidationPaths(kind: PublicListingKind, slugs: unknown): PublicRevalidationPath[] {
  const clean = sanitizeListingSlugs(slugs);
  const bulk = clean.length === 0 || (Array.isArray(slugs) && slugs.length > MAX_SLUGS);
  const paths: PublicRevalidationPath[] = ['/', '/offers', '/search', '/mobile'].map((path) => ({ path }));
  if (kind === 'vehicle' || kind === 'offer') {
    paths.push({ path: '/vehicles' }, { path: '/machinery' }, { path: '/markets/[code]', type: 'page' });
    paths.push(...(bulk || kind === 'offer' ? [{ path: '/vehicles/[slug]', type: 'page' as const }] : clean.map((slug) => ({ path: `/vehicles/${slug}` }))));
  }
  if (kind === 'part' || kind === 'offer') {
    paths.push({ path: '/parts' }, { path: '/categories/[slug]', type: 'page' });
    paths.push(...(bulk || kind === 'offer' ? [{ path: '/parts/[slug]', type: 'page' as const }] : clean.map((slug) => ({ path: `/parts/${slug}` }))));
  }
  return paths;
}

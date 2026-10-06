import { revalidatePath } from 'next/cache';

/** Kinds of public listing that have ISR pages. */
export type PublicListingKind = 'vehicle' | 'part' | 'offer';

const SLUG_RE = /^[A-Za-z0-9._~-]{1,200}$/;
const MAX_SLUGS = 10;

/** Keep only safe, unique slugs (at most 10) so callers cannot purge arbitrary routes. */
export function sanitizeListingSlugs(slugs: unknown): string[] {
  if (!Array.isArray(slugs)) return [];
  return Array.from(
    new Set(slugs.filter((s): s is string => typeof s === 'string' && SLUG_RE.test(s)))
  ).slice(0, MAX_SLUGS);
}

/**
 * Server-side on-demand ISR revalidation for public listing pages after a staff edit.
 * Paths are built from a fixed kind + validated slugs. Callers must already have
 * verified the staff session (see app/api/revalidate and app/api/admin-assistant).
 */
export function revalidatePublicListing(kind: PublicListingKind, slugs: unknown): string[] {
  if (kind === 'offer') {
    // Deals appear on /offers and on any linked detail page.
    revalidatePath('/');
    revalidatePath('/offers');
    revalidatePath('/vehicles/[slug]', 'page');
    revalidatePath('/parts/[slug]', 'page');
    return ['/', '/offers', '/vehicles/[slug]', '/parts/[slug]'];
  }

  const clean = sanitizeListingSlugs(slugs);
  const paths =
    kind === 'vehicle'
      ? ['/', '/vehicles', '/machinery', '/offers', ...clean.map((s) => `/vehicles/${s}`)]
      : ['/', '/parts', '/offers', ...clean.map((s) => `/parts/${s}`)];
  for (const path of paths) revalidatePath(path);
  return paths;
}

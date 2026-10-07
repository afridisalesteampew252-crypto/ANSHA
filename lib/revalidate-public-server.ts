import { revalidatePath } from 'next/cache';
import { publicRevalidationPaths, type PublicListingKind } from '@/lib/public-revalidation-paths';
export { sanitizeListingSlugs, type PublicListingKind } from '@/lib/public-revalidation-paths';

/**
 * Server-side on-demand ISR revalidation for public listing pages after a staff edit.
 * Paths are built from a fixed kind + validated slugs. Callers must already have
 * verified the staff session (see app/api/revalidate and app/api/admin-assistant).
 */
export function revalidatePublicListing(kind: PublicListingKind, slugs: unknown): string[] {
  const paths = publicRevalidationPaths(kind, slugs);
  for (const { path, type } of paths) revalidatePath(path, type);
  return paths.map(({ path }) => path);
}

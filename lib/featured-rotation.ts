/**
 * Home featured inventory rotation (display-only).
 *
 * Strategy: time-bucketed deterministic selection on read (no DB writes).
 * Admin `is_featured` still controls card badges / market sort and boosts
 * membership in the candidate pool (queries order featured first).
 *
 * Window: 10 minutes. Slot counts match the home UI.
 */

export const FEATURED_ROTATION_WINDOW_MS = 10 * 60 * 1000;

/** Home "Featured parts" grid slots */
export const HOME_FEATURED_PARTS_LIMIT = 8;
/** Home vehicle showroom slots */
export const HOME_FEATURED_VEHICLES_LIMIT = 4;

/** Candidate pool sizes — larger than slots so rotation has variety */
export const HOME_FEATURED_PARTS_POOL = 48;
export const HOME_FEATURED_VEHICLES_POOL = 24;

export type FeaturedRotationCandidate = {
  id: string;
  is_featured?: boolean | null;
};

/** UTC 10-minute bucket index (stable across clients for the same clock window). */
export function getFeaturedRotationBucket(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / FEATURED_ROTATION_WINDOW_MS);
}

/** Milliseconds until the next rotation boundary (at least 1ms). */
export function msUntilNextFeaturedRotation(nowMs: number = Date.now()): number {
  const nextBoundary = (getFeaturedRotationBucket(nowMs) + 1) * FEATURED_ROTATION_WINDOW_MS;
  return Math.max(1, nextBoundary - nowMs);
}

/**
 * Pick a rotating subset from a candidate pool.
 * Order is deterministic for a given bucket so all visitors see the same set.
 * Advances by `limit` items each 10-minute window (wraps).
 */
export function selectRotatingFeatured<T extends FeaturedRotationCandidate>(
  candidates: T[],
  limit: number,
  nowMs: number = Date.now(),
): T[] {
  if (!candidates.length || limit <= 0) return [];

  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of candidates) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }

  if (!unique.length) return [];
  if (unique.length <= limit) return unique;

  // Stable order by id so pool fetch order alone cannot scramble the window.
  const ordered = [...unique].sort((a, b) => a.id.localeCompare(b.id));
  const bucket = getFeaturedRotationBucket(nowMs);
  const start = (bucket * limit) % ordered.length;

  const picked: T[] = [];
  for (let i = 0; i < limit; i += 1) {
    picked.push(ordered[(start + i) % ordered.length]);
  }
  return picked;
}

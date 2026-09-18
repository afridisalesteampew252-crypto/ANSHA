/** Local optimized category card images (WebP). Prefer these over remote Pexels URLs. */
const LOCAL_CATEGORY_IMAGES: Record<string, string> = {
  headlights: '/images/categories/headlights.webp',
  taillights: '/images/categories/taillights.webp',
  engines: '/images/categories/engines.webp',
  transmissions: '/images/categories/transmissions.webp',
  brakes: '/images/categories/brakes.webp',
  suspension: '/images/categories/suspension.webp',
  'body-parts': '/images/categories/body-parts.webp',
  electrical: '/images/categories/electrical.webp',
  interior: '/images/categories/interior.webp',
  'cooling-system': '/images/categories/cooling-system.webp',
  exhaust: '/images/categories/exhaust.webp',
  filters: '/images/categories/filters.webp',
};

export function resolveCategoryImage(slug: string, imageUrl?: string | null) {
  return LOCAL_CATEGORY_IMAGES[slug] || imageUrl || null;
}

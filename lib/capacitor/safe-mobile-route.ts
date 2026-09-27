const MOBILE_FALLBACK = '/mobile';

/**
 * Keep native notification taps inside the mobile experience.
 * Only same-origin mobile pages and the signed-in support inbox are accepted.
 */
export function safeMobileRoute(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return MOBILE_FALLBACK;
  try {
    const parsed = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'https://www.anshatradingco.com');
    if (parsed.origin !== (typeof window !== 'undefined' ? window.location.origin : 'https://www.anshatradingco.com')) return MOBILE_FALLBACK;
    if (!(parsed.pathname === '/mobile' || parsed.pathname.startsWith('/mobile/') || parsed.pathname === '/portal/support')) return MOBILE_FALLBACK;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return MOBILE_FALLBACK;
  }
}

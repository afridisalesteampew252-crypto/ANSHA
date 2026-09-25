const ADMIN_FALLBACK = '/admin/dashboard';

/** Keep admin APK notification taps on same-origin, role-protected admin routes. */
export function safeAdminRoute(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return ADMIN_FALLBACK;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.anshatradingco.com';
    const parsed = new URL(raw, origin);
    if (parsed.origin !== origin) return ADMIN_FALLBACK;
    if (parsed.pathname !== '/admin' && !parsed.pathname.startsWith('/admin/')) return ADMIN_FALLBACK;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return ADMIN_FALLBACK;
  }
}

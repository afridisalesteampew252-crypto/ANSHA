'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Fires GA4 page_view on App Router client navigations (and the first paint).
 * Initial gtag config uses send_page_view: false to avoid double-counting.
 * Retries briefly until gtag.js has defined window.gtag.
 */
export function GoogleAnalyticsPageViews({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!gaId) return;

    const qs = searchParams?.toString();
    const pagePath = qs ? `${pathname}?${qs}` : pathname;

    const send = () => {
      if (typeof window.gtag !== 'function') return false;
      window.gtag('event', 'page_view', {
        page_path: pagePath,
        page_location: window.location.href,
        page_title: document.title,
        send_to: gaId,
      });
      return true;
    };

    if (send()) return;

    const interval = window.setInterval(() => {
      if (send()) window.clearInterval(interval);
    }, 100);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 5000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [gaId, pathname, searchParams]);

  return null;
}

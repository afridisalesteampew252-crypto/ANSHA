'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { useCookieConsent } from '@/components/privacy/cookie-consent';
import { siteConfig } from '@/lib/site-config';

/**
 * Keep Consent Mode available immediately, but defer the network-heavy Google tag until
 * the visitor has explicitly enabled analytics and the page has finished loading.
 */
export function GoogleAnalytics() {
  const { choices } = useCookieConsent();
  const analyticsAllowed = choices?.analytics === true;

  useEffect(() => {
    if (!choices) return;
    const analyticsWindow = window as Window & {
      gtag?: (...args: unknown[]) => void;
    };
    analyticsWindow.gtag?.('consent', 'update', {
      analytics_storage: analyticsAllowed ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }, [analyticsAllowed, choices]);

  if (!analyticsAllowed) return null;

  return (
    <Script
      id="google-analytics-loader"
      src={`https://www.googletagmanager.com/gtag/js?id=${siteConfig.googleAnalyticsId}`}
      strategy="lazyOnload"
    />
  );
}

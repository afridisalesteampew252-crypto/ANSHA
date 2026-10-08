'use client';

import Script from 'next/script';
import { siteConfig } from '@/lib/site-config';
import { useCookieConsent } from '@/components/privacy/cookie-consent';

export function GoogleAnalytics() {
  const { choices } = useCookieConsent();
  if (!choices?.analytics) return null;

  const measurementId = siteConfig.googleAnalyticsId;
  return (
    <>
      <Script id="google-analytics-config" strategy="afterInteractive">{`
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
window.gtag('js', new Date());
window.gtag('config', ${JSON.stringify(measurementId)});
`}</Script>
      <Script
        id="google-analytics-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
    </>
  );
}

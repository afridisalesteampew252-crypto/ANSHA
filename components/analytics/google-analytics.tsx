import { Suspense } from 'react';
import Script from 'next/script';
import { siteConfig } from '@/lib/site-config';
import { GoogleAnalyticsPageViews } from '@/components/analytics/google-analytics-pageviews';

/**
 * Google tag (gtag.js) / GA4 for the public site.
 * Uses NEXT_PUBLIC_GA_MEASUREMENT_ID when set; otherwise siteConfig.googleAnalyticsId.
 * Set the env var to blank on Preview/staging to disable. See docs/Deployment.md.
 * No cookie-consent banner yet; disclosed on /cookie-policy.
 * Mounted from app/(public)/layout and app/portal/layout (not /admin).
 * SPA page_view on App Router client navigations via GoogleAnalyticsPageViews.
 */
export function GoogleAnalytics() {
  const gaId = (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? siteConfig.googleAnalyticsId).trim();
  if (!gaId) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">{`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}', { send_page_view: false });
`}</Script>
      <Suspense fallback={null}>
        <GoogleAnalyticsPageViews gaId={gaId} />
      </Suspense>
    </>
  );
}

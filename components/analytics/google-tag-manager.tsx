import Script from 'next/script';
import { siteConfig } from '@/lib/site-config';

/**
 * Google Tag Manager container for the public site + portal.
 * Uses NEXT_PUBLIC_GTM_ID when set; otherwise siteConfig.gtmId.
 * Set the env var to blank on Preview/staging to disable. See docs/Deployment.md.
 * GA4 and other tags fire from the GTM container — do not also load gtag.js here.
 * No cookie-consent banner yet; disclosed on /cookie-policy.
 * Mounted from app/(public)/layout and app/portal/layout (not /admin).
 *
 * Head snippet uses next/script afterInteractive (Next App Router pattern for tag
 * managers). beforeInteractive is root-layout-only and would also load on /admin.
 */
export function GoogleTagManager() {
  const gtmId = (process.env.NEXT_PUBLIC_GTM_ID ?? siteConfig.gtmId).trim();
  if (!gtmId) return null;

  return (
    <>
      <Script id="google-tag-manager" strategy="afterInteractive">{`
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');
`}</Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
          height={0}
          width={0}
          style={{ display: 'none', visibility: 'hidden' }}
          title="Google Tag Manager"
        />
      </noscript>
    </>
  );
}

import Script from 'next/script';
import { siteConfig } from '@/lib/site-config';

/**
 * Google Tag Manager via Google tag gateway (first-party path).
 * Uses NEXT_PUBLIC_GTM_ID when set; otherwise siteConfig.gtmId.
 * Loads from NEXT_PUBLIC_GTM_GATEWAY_PATH (default `/metrics`) instead of
 * www.googletagmanager.com — proxied to gtm-*.fps.goog via next.config beforeFiles
 * + vercel.json. Script URL is `/{path}?id=` (no trailing slash) so Next does not
 * 308 `/metrics/` → `/metrics` into a 404. Strategy: lazyOnload (after LCP/TBT).
 * Set NEXT_PUBLIC_GTM_ID blank on Preview/staging to disable. See docs/Deployment.md.
 * GA4 and other tags fire from the GTM container — do not also load gtag.js here.
 * Noscript still uses googletagmanager.com (gateway does not support first-party ns).
 * Mounted from app/(public)/layout and app/portal/layout (not /admin).
 */
function normalizeGatewayPath(raw: string | undefined): string {
  const trimmed = (raw ?? '/metrics').trim() || '/metrics';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, '') || '/metrics';
}

export function GoogleTagManager() {
  const gtmId = (process.env.NEXT_PUBLIC_GTM_ID ?? siteConfig.gtmId).trim();
  if (!gtmId) return null;

  // Prefer `/{path}?id=` (no trailing slash). Next's default trailingSlash:false
  // 308s `/metrics/?id=` → `/metrics?id=`, which previously 404'd as HTML and
  // blocked the gateway script. beforeFiles rewrite in next.config.js handles bare `/metrics`.
  const gatewayPath = normalizeGatewayPath(process.env.NEXT_PUBLIC_GTM_GATEWAY_PATH);

  return (
    <>
      <Script id="google-tag-manager" strategy="lazyOnload">{`
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'${gatewayPath}?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');
`}</Script>
      {/* Gateway does not support first-party noscript — keep standard ns.html. */}
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

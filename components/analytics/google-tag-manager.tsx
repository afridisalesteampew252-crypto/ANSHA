'use client';

import Script from 'next/script';
import { siteConfig } from '@/lib/site-config';
import { useCookieConsent } from '@/components/privacy/cookie-consent';

/**
 * Google Tag Manager via the first-party gateway. The container can load
 * optional third-party tags, so it is withheld until analytics consent is saved.
 */
function normalizeGatewayPath(raw: string | undefined): string {
  const trimmed = (raw ?? '/metrics').trim() || '/metrics';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, '') || '/metrics';
}

export function GoogleTagManager() {
  const { choices } = useCookieConsent();
  const gtmId = (process.env.NEXT_PUBLIC_GTM_ID ?? siteConfig.gtmId).trim();
  if (!gtmId || !choices?.analytics) return null;
  const gatewayPath = normalizeGatewayPath(process.env.NEXT_PUBLIC_GTM_GATEWAY_PATH);

  return (
    <Script id="google-tag-manager" strategy="lazyOnload">{`
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'${gatewayPath}?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');
`}</Script>
  );
}

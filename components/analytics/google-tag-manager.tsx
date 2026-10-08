'use client';

import Script from 'next/script';
import { siteConfig } from '@/lib/site-config';
import { useCookieConsent } from '@/components/privacy/cookie-consent';

/** Load the current container only after analytics consent. */
export function GoogleTagManager() {
  const { choices } = useCookieConsent();
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID === '' ? '' : siteConfig.gtmId;
  if (!gtmId || !choices?.analytics) return null;

  return (
    <Script id="google-tag-manager" strategy="lazyOnload">{`
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');
`}</Script>
  );
}

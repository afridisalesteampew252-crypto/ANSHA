'use client';

import Script from 'next/script';
import { useCookieConsent } from '@/components/privacy/cookie-consent';

/** Tawk.to live chat. It is loaded only after the visitor accepts functional technologies. */
export function TawkToChat() {
  const { choices } = useCookieConsent();
  const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID?.trim();
  const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID?.trim();

  if (!choices?.functional || !propertyId || !widgetId) return null;

  return (
    <Script id="tawk-to" strategy="lazyOnload">{`
var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
(function(){
var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
s1.async=true;
s1.src='https://embed.tawk.to/${propertyId}/${widgetId}';
s1.charset='UTF-8';
s1.setAttribute('crossorigin','*');
s0.parentNode.insertBefore(s1,s0);
})();
`}</Script>
  );
}

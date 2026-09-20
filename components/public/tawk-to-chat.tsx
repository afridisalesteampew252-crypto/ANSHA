import Script from 'next/script';

/**
 * Tawk.to live chat for public pages.
 * No-ops when NEXT_PUBLIC_TAWK_PROPERTY_ID or NEXT_PUBLIC_TAWK_WIDGET_ID is unset.
 * IDs: https://dashboard.tawk.to → Administration → Chat Widget → Direct Chat Link / Widget Code
 */
export function TawkToChat() {
  const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID?.trim();
  const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID?.trim();

  if (!propertyId || !widgetId) return null;

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

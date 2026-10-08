import { siteConfig } from '@/lib/site-config';

/** Initialize Consent Mode before the Google tag can execute. */
export function googleAnalyticsBootstrap() {
  return `(function(){
if (/^\\/(admin|portal|auth|mobile|api)(\\/|$)/.test(window.location.pathname)) return;
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
var allowed = false;
try { allowed = JSON.parse(localStorage.getItem('ansha-cookie-consent-v1') || '{}').analytics === true; } catch (_) {}
window.gtag('consent', 'default', {
  analytics_storage: allowed ? 'granted' : 'denied',
  ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  wait_for_update: 500
});
window.gtag('js', new Date());
window.gtag('config', ${JSON.stringify(siteConfig.googleAnalyticsId)});
var script = document.createElement('script');
script.id = 'google-analytics-loader';
script.async = true;
script.src = 'https://www.googletagmanager.com/gtag/js?id=${siteConfig.googleAnalyticsId}';
document.head.appendChild(script);
})();`;
}

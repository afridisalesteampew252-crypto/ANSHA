import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';
import { CookieSettingsButton } from '@/components/privacy/cookie-consent';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: `How ${siteConfig.name} uses cookies and similar technologies on ${siteConfig.url.replace('https://', '')}.`,
};

const updated = '28 September 2026';

export default function CookiePolicyPage() {
  return (
    <div>
      <section className="border-b border-border bg-secondary/40">
        <div className="container-page py-14">
          <div className="mx-auto max-w-3xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Legal</p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Cookie Policy</h1>
            <p className="mt-3 text-sm text-muted-foreground">Last updated: {updated}</p>
          </div>
        </div>
      </section>
      <div className="container-page py-14">
        <article className="mx-auto max-w-3xl space-y-8 text-sm leading-relaxed text-muted-foreground sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Who we are</h2>
            <p>This policy explains how {siteConfig.name} (“we”, “us”) uses cookies and similar technologies on <Link href="/" className="text-accent underline">{siteConfig.url}</Link>. Contact us at <a href={`mailto:${siteConfig.email}`} className="text-accent underline">{siteConfig.email}</a>.</p>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Technologies and purposes</h2>
            <p>The site uses browser storage and similar tools for sign-in, security, app features, and optional analytics or support chat. The exact storage used can depend on your browser, account, and settings.</p>
            <ul className="list-disc space-y-2 pl-5">
              <li><strong className="text-foreground">Essential operation:</strong> Supabase authentication and browser storage needed for customer or staff sign-in, security, and core site functions.</li>
              <li><strong className="text-foreground">App and notification features:</strong> service-worker/browser storage when the app is installed and a push subscription if you choose to allow notifications.</li>
              <li><strong className="text-foreground">Optional analytics:</strong> Google Analytics, Google Tag Manager (including any tags configured in that container), and Vercel Analytics/Speed Insights. Google Analytics loads with Consent Mode and analytics storage denied until you allow analytics; it may send limited cookieless signals before consent. Tag Manager and Vercel analytics load only after you allow analytics. Advertising storage and personalization remain denied.</li>
              <li><strong className="text-foreground">Optional support chat:</strong> Tawk.to is loaded only if you allow support-chat technologies; the provider may use its own storage to operate the conversation.</li>
            </ul>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Your choices</h2>
            <p>On your first visit, choose “Accept all”, “Essential only”, or manage analytics and support-chat choices. Analytics cookies, Tag Manager, Vercel analytics, and chat remain off unless you allow them. Google Analytics may send limited cookieless signals while analytics storage is denied. Use <CookieSettingsButton className="text-accent underline" /> at the bottom of the site to change your choice. A change takes effect after the page reloads.</p>
            <p>You can also clear this site’s browser storage and control notifications in your browser or device settings. Blocking essential storage may prevent sign-in or core features from working.</p>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Third parties and duration</h2>
            <p>Supabase, Vercel, Google, and Tawk.to may provide services described above. Their processing and storage details may vary by service configuration and their own policies. We do not claim one fixed cookie name or lifetime for optional provider technologies because these depend on the tags and settings active at the time.</p>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Contact and updates</h2>
            <p>We may update this policy when the technologies we use change. {siteConfig.name}<br />{siteConfig.address}<br />Email: <a href={`mailto:${siteConfig.email}`} className="text-accent underline">{siteConfig.email}</a><br />Phone: <a href={siteConfig.telHref} className="text-accent underline">{siteConfig.phone}</a></p>
            <p>See our <Link href="/privacy" className="text-accent underline">Privacy Notice</Link> and <Link href="/terms" className="text-accent underline">Terms of Use</Link>.</p>
          </section>
        </article>
      </div>
    </div>
  );
}

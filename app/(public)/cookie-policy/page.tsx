import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: `How ${siteConfig.name} uses cookies and similar technologies on ${siteConfig.url.replace('https://', '')}.`,
};

const lastUpdated = '22 September 2026';

export default function CookiePolicyPage() {
  return (
    <div>
      <section className="border-b border-border bg-secondary/40">
        <div className="container-page py-14">
          <div className="mx-auto max-w-3xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Legal</p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Cookie Policy</h1>
            <p className="mt-3 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
          </div>
        </div>
      </section>

      <div className="container-page py-14">
        <article className="mx-auto max-w-3xl space-y-8 text-sm leading-relaxed text-muted-foreground sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Who we are</h2>
            <p>
              This Cookie Policy explains how <strong className="text-foreground">{siteConfig.name}</strong> (“we”, “us”, “our”)
              uses cookies and similar technologies on <Link href="/" className="text-accent underline-offset-2 hover:underline">{siteConfig.url}</Link> and related pages
              (the “Site”). We are based at {siteConfig.address}.
            </p>
            <p>
              Questions about cookies: <a href={`mailto:${siteConfig.email}`} className="text-accent underline-offset-2 hover:underline">{siteConfig.email}</a>
              {' '}or {siteConfig.phone}.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. What are cookies?</h2>
            <p>
              Cookies are small text files stored on your device when you visit a website. Similar technologies include
              local storage, session storage, pixels, and service-worker caches. They help the Site work, remember
              preferences, measure traffic, and improve performance.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. How we use cookies</h2>
            <p>We use cookies and similar technologies for:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li><strong className="text-foreground">Essential operation</strong> — security, sign-in sessions (staff and customer portal), and core browsing.</li>
              <li><strong className="text-foreground">Preferences</strong> — remembering theme or display choices where applicable.</li>
              <li><strong className="text-foreground">Analytics and performance</strong> — understanding how visitors use the Site so we can improve it.</li>
              <li><strong className="text-foreground">Optional notifications</strong> — if you opt in to install our app or receive browser push for deals and insights.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">4. Cookies and technologies we use</h2>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                <thead className="bg-secondary/60 text-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Category</th>
                    <th className="px-3 py-2.5 font-semibold">Provider / name</th>
                    <th className="px-3 py-2.5 font-semibold">Purpose</th>
                    <th className="px-3 py-2.5 font-semibold">Typical duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-3 py-2.5 align-top text-foreground">Essential</td>
                    <td className="px-3 py-2.5 align-top">Supabase Auth session cookies</td>
                    <td className="px-3 py-2.5 align-top">Keep you signed in to the staff workspace or customer portal and protect sessions.</td>
                    <td className="px-3 py-2.5 align-top">Session / up to several months (refresh)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 align-top text-foreground">Essential</td>
                    <td className="px-3 py-2.5 align-top">Security / CSRF-related cookies</td>
                    <td className="px-3 py-2.5 align-top">Help prevent unauthorized requests while you use authenticated areas.</td>
                    <td className="px-3 py-2.5 align-top">Session</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 align-top text-foreground">Preferences</td>
                    <td className="px-3 py-2.5 align-top">Theme / UI preference storage</td>
                    <td className="px-3 py-2.5 align-top">Remember light or dark mode and similar display choices.</td>
                    <td className="px-3 py-2.5 align-top">Local storage / persistent</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 align-top text-foreground">Analytics</td>
                    <td className="px-3 py-2.5 align-top">Google Tag Manager ({siteConfig.gtmId}) / Google Analytics (via GTM)</td>
                    <td className="px-3 py-2.5 align-top">Load marketing and analytics tags (including Google Analytics) through Google Tag Manager to measure visits, pages viewed, and traffic sources. May set cookies such as <code className="text-xs text-foreground">_ga</code>, <code className="text-xs text-foreground">_ga_*</code>, and GTM-related cookies.</td>
                    <td className="px-3 py-2.5 align-top">Up to 2 years</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 align-top text-foreground">Analytics</td>
                    <td className="px-3 py-2.5 align-top">Vercel Analytics &amp; Speed Insights</td>
                    <td className="px-3 py-2.5 align-top">Privacy-oriented performance and usage metrics for our hosting platform.</td>
                    <td className="px-3 py-2.5 align-top">As set by Vercel</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 align-top text-foreground">Functional (opt-in)</td>
                    <td className="px-3 py-2.5 align-top">PWA / service worker &amp; push subscription</td>
                    <td className="px-3 py-2.5 align-top">If you install the Site or allow notifications, browsers store subscription data so we can send deal or insight alerts you requested.</td>
                    <td className="px-3 py-2.5 align-top">Until cleared or unsubscribed</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Exact cookie names and lifetimes can change when providers update their services. Google’s descriptions of Tag Manager and Analytics cookies are available in Google’s documentation.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Legal basis and your choices</h2>
            <p>
              Essential cookies are required for the Site and authenticated areas to function. Analytics and optional
              notification technologies help us operate and improve the Site. You can control non-essential cookies
              through your browser settings (block, delete, or limit cookies). Blocking essential cookies may prevent
              sign-in or other features from working.
            </p>
            <p>
              To opt out of Google Analytics measurement across websites, you may use Google’s browser opt-out tools
              or your browser’s tracking-protection settings where available.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Third parties</h2>
            <p>
              Some cookies are set by third parties that process data on our behalf or according to their own policies,
              including Google (Tag Manager / Analytics) and Vercel (hosting, Analytics, Speed Insights). We do not control those
              providers’ independent privacy practices. Review their published policies for details.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. How to manage cookies</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Use your browser settings to delete existing cookies and choose which cookies to allow.</li>
              <li>Use private / incognito browsing if you prefer temporary sessions.</li>
              <li>For push notifications, revoke permission in the browser or device settings, or use any unsubscribe options we provide on the Site.</li>
              <li>Clear site data for {siteConfig.url.replace('https://', '')} if you want to remove local storage and service-worker caches.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Updates</h2>
            <p>
              We may update this Cookie Policy when our practices or the technologies we use change. The “Last updated”
              date at the top of this page will be revised when we do. Continued use of the Site after changes means
              you are aware of the updated policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">9. Contact</h2>
            <p>
              {siteConfig.name}<br />
              {siteConfig.address}<br />
              Email: <a href={`mailto:${siteConfig.email}`} className="text-accent underline-offset-2 hover:underline">{siteConfig.email}</a><br />
              Phone: <a href={`tel:${siteConfig.phone}`} className="text-accent underline-offset-2 hover:underline">{siteConfig.phone}</a>
            </p>
            <p>
              Related pages: <Link href="/contact" className="text-accent underline-offset-2 hover:underline">Contact</Link>
              {' · '}
              <Link href="/about" className="text-accent underline-offset-2 hover:underline">About us</Link>
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}

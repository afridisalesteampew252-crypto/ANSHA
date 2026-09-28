import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Privacy Notice',
  description: `How ${siteConfig.name} collects and uses personal information.`,
};

const updated = '28 September 2026';

export default function PrivacyPage() {
  return (
    <div>
      <section className="border-b border-border bg-secondary/40">
        <div className="container-page py-14">
          <div className="mx-auto max-w-3xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Legal</p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Privacy Notice</h1>
            <p className="mt-3 text-sm text-muted-foreground">Last updated: {updated}</p>
          </div>
        </div>
      </section>
      <div className="container-page py-14">
        <article className="mx-auto max-w-3xl space-y-8 text-sm leading-relaxed text-muted-foreground sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Who is responsible</h2>
            <p><strong className="text-foreground">{siteConfig.name}</strong> (“ANSHA”, “we”, “us”) operates this website and customer portal. Our contact details are {siteConfig.address}, <a className="text-accent underline" href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>, and {siteConfig.phone}.</p>
            <p>This notice explains how we handle personal information when you browse our website, contact us, use the customer portal, or interact with our services.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Information we handle</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Contact details and messages you send us, such as your name, email address, phone number, and inquiry.</li>
              <li>Customer account and business profile information, login identifiers, and account security records.</li>
              <li>Sales and service records used in the portal, including reservations, invoices, statements, support requests, and related communications.</li>
              <li>Payment matching information you choose to submit, including transfer amount, currency, date, bank reference, sender bank, notes, and a TT/payment proof file. These files are private and access is restricted to your account and authorized staff for matching and review.</li>
              <li>Technical and usage information such as pages or features used, device/browser details, security events, and analytics measurements when you allow optional analytics.</li>
              <li>Push notification subscription information if you choose to enable browser or app notifications, and chat information if you choose to use the support chat.</li>
            </ul>
            <p>Please do not submit information that is unrelated to your inquiry or payment. Only upload documents you are authorized to share.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Why we use it</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>To respond to inquiries, provide customer support, and communicate about requests or transactions.</li>
              <li>To create and secure accounts, provide portal features, and maintain account and audit records.</li>
              <li>To manage reservations, invoices, payment matching, statements, and related business records.</li>
              <li>To protect the website, prevent misuse, troubleshoot errors, and keep the service reliable.</li>
              <li>To provide optional analytics, performance measurement, support chat, and push notifications only as described in our choices and the relevant browser/device settings.</li>
              <li>To meet applicable legal, accounting, tax, and regulatory obligations and to establish or defend legal claims.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. When we share information</h2>
            <p>We use service providers to operate the website and business systems. Based on the features you use, these may include Supabase (authentication, database, and file storage), Vercel (website hosting and performance services), Resend (email delivery), Google Tag Manager and tags configured within it (after analytics consent), and Tawk.to (after you enable or use support chat). Providers process information to provide their services under their own terms and privacy materials.</p>
            <p>We may also share information with professional advisers, business partners involved in a requested transaction, or authorities when required by law or necessary to protect people, rights, or the service. We do not make customer payment proof files public.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. International processing and retention</h2>
            <p>Our business is based in the UAE, while our service providers and their infrastructure may process information in other countries. Where applicable, we use the transfer mechanisms required by the laws that apply to the processing.</p>
            <p>We keep information for as long as needed for the purposes above, including to provide the service, maintain business and accounting records, resolve disputes, and meet legal obligations. Retention can vary by record type. Contact us to ask about a specific record or deletion request.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Your choices and requests</h2>
            <p>You can manage optional analytics and support chat technologies through <Link href="/cookie-policy" className="text-accent underline">Cookie settings</Link>. You can control push notifications in your browser or device settings. You may ask us to access, correct, or delete information, or raise a privacy concern, by emailing <a className="text-accent underline" href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>. We will handle requests under the laws that apply. We may need to verify your identity and retain records we are legally required to keep.</p>
            <p>Customer account deletion requests can be made through our <Link href="/account-deletion" className="text-accent underline">account deletion page</Link>. Deleting an account does not automatically erase records we must retain or information needed for an active transaction or dispute.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Children and changes</h2>
            <p>Our website and services are for business and general audiences and are not directed to children. We do not knowingly seek personal information from children.</p>
            <p>We may update this notice as our practices change. The date above shows when it was last revised.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Contact</h2>
            <p>{siteConfig.name}<br />{siteConfig.address}<br />Email: <a className="text-accent underline" href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a><br />Phone: {siteConfig.phone}</p>
            <p>See also: <Link href="/terms" className="text-accent underline">Terms of Use</Link> and <Link href="/cookie-policy" className="text-accent underline">Cookie Policy</Link>.</p>
          </section>
        </article>
      </div>
    </div>
  );
}

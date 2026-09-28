import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: `Terms for using the ${siteConfig.name} website and customer portal.`,
};

const updated = '28 September 2026';

export default function TermsPage() {
  return (
    <div>
      <section className="border-b border-border bg-secondary/40">
        <div className="container-page py-14">
          <div className="mx-auto max-w-3xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Legal</p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Terms of Use</h1>
            <p className="mt-3 text-sm text-muted-foreground">Last updated: {updated}</p>
          </div>
        </div>
      </section>
      <div className="container-page py-14">
        <article className="mx-auto max-w-3xl space-y-8 text-sm leading-relaxed text-muted-foreground sm:text-base">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. About these terms</h2>
            <p>These terms apply to your use of the {siteConfig.name} website, customer portal, and related online features (“services”). By using the services, you agree to these terms. Separate written quotations, invoices, and signed or otherwise accepted sales documents govern a specific transaction if they contain different terms.</p>
            <p>These website terms describe use of the services; they are not a complete vehicle, parts, machinery, shipping, warranty, or consumer-sale contract.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Accounts and acceptable use</h2>
            <p>Provide information that is accurate and keep your sign-in credentials secure. You are responsible for activity through your account and should contact us promptly if you suspect unauthorized access. We may suspend access where reasonably needed to protect the service, users, or our legal rights.</p>
            <p>Do not use the services unlawfully, interfere with their operation, attempt unauthorized access, send harmful code or spam, or misuse another person’s information or intellectual property.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Listings, inquiries, and transactions</h2>
            <p>Catalog information, images, specifications, prices, availability, and delivery estimates are provided for general information and may change. Contact us to confirm current details. A listing or inquiry by itself does not complete a sale or guarantee stock availability.</p>
            <p>Any purchase, reservation, payment, inspection, export, shipping, title, warranty, return, or cancellation terms for a particular transaction will be set out in the applicable written quotation, invoice, order confirmation, or other transaction document. Review those documents before paying or confirming an order.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Information and files you submit</h2>
            <p>Submit only information that is relevant and that you have the right to provide. If you upload a payment proof or other file, you confirm that it is genuine, accurate to the best of your knowledge, and that sharing it for the requested service does not violate another person’s rights or the law. Do not upload another person’s financial or identity information without authority.</p>
            <p>We use submitted information and files to respond to your request, support transactions, and meet legal obligations as described in our <Link href="/privacy" className="text-accent underline">Privacy Notice</Link>. Payment proof files in the portal are private and available only to the submitting customer account and authorized staff.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Intellectual property</h2>
            <p>The website’s design, software, text, and materials are owned by or licensed to ANSHA or their respective rights holders. You may view and use them for ordinary browsing and business inquiries. Do not reproduce, republish, or commercially exploit them without permission, except as allowed by law.</p>
            <p>If you believe material on the site infringes your rights, contact us with the page or material, the right you own or represent, and how we can reach you. We will review the notice and take appropriate action. Contact: <a className="text-accent underline" href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Third-party services and availability</h2>
            <p>Some features rely on external providers or links. Their services are subject to their terms and availability. We work to keep our services available and secure, but maintenance, outages, or events outside our control can affect access.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Responsibility and legal rights</h2>
            <p>Nothing in these terms excludes or limits a right or liability that cannot lawfully be excluded or limited. To the extent permitted by applicable law, each party remains responsible for its own breach of these terms and other obligations. Any additional limits or remedies for a specific sale are governed by its transaction documents and applicable law.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Changes and contact</h2>
            <p>We may revise these terms when our services or legal requirements change. The revised date will appear above. Contact us with questions at <a className="text-accent underline" href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.</p>
            <p>{siteConfig.name}<br />{siteConfig.address}<br />{siteConfig.phone}</p>
            <p>See also: <Link href="/privacy" className="text-accent underline">Privacy Notice</Link> and <Link href="/cookie-policy" className="text-accent underline">Cookie Policy</Link>.</p>
          </section>
        </article>
      </div>
    </div>
  );
}

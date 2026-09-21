import type { Metadata } from 'next';
import { Search, ShieldCheck, Truck, Headphones, Award } from 'lucide-react';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { siteConfig } from '@/lib/site-config';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'About Us',
  description: `${siteConfig.name} is a Dubai-based exporter of vehicles, automotive parts, and heavy machinery for global buyers.`,
  path: '/about',
});

export default function AboutPage() {
  return (
    <div>
      <section className="page-band">
        <div className="container-page py-12 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow text-accent mb-2">About Us</p>
            <h1 className="font-display text-3xl font-black tracking-tight md:text-4xl">
              Dubai export partner for<br />vehicles, parts &amp; machinery
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
              Published inventory, OEM fitment support, and worldwide shipping coordination for importers and workshops.
            </p>
          </div>
        </div>
      </section>

      <div className="surface-mist">
        <div className="container-page py-12 sm:py-14">
          <div className="mx-auto max-w-3xl">
            <p className="text-lg leading-relaxed text-foreground/80">
              {siteConfig.name} exports vehicles, automotive parts, and heavy machinery from Dubai.
              We help importers, workshops, and fleet buyers source published stock by make, model,
              OEM number, and chassis details.
            </p>

            <div className="mt-12 grid gap-5 sm:grid-cols-2">
              {[
                { icon: Search, title: 'Easy Part Finding', desc: 'Search by part name, OEM number, part number, or vehicle compatibility to find exactly what you need.' },
                { icon: ShieldCheck, title: 'Quality Assured', desc: 'Every part is inspected and accurately described. We provide condition details and clear photos.' },
                { icon: Truck, title: 'Fast Dispatch', desc: 'We process and dispatch orders quickly to minimize your vehicle downtime.' },
                { icon: Headphones, title: 'Expert Support', desc: 'Our team is available on WhatsApp to help you find the right part and answer any questions.' },
              ].map((item) => (
                <div key={item.title} className="catalog-panel p-6 transition-shadow hover:border-accent/35 hover:shadow-md">
                  <div className="mb-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                    <item.icon className="h-5 w-5 text-accent" />
                  </div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 rounded-[28px] bg-[#101114] p-10 text-center text-white">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                <Award className="h-6 w-6 text-white" />
              </div>
              <h2 className="mt-5 text-xl font-bold">Our Commitment</h2>
              <p className="mx-auto mt-2 max-w-2xl text-white/60">
                We are committed to providing accurate information, fair pricing, and reliable service.
                If a part isn&apos;t listed in our catalog, send us an inquiry and we&apos;ll help source it for you.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <WhatsAppButton size="lg" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

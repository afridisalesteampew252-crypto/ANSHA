import { Search, ShieldCheck, Truck, Headphones, Award, Package } from 'lucide-react';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { siteConfig } from '@/lib/site-config';

export const metadata = {
  title: 'About Us',
  description: `Learn about ${siteConfig.name} - your trusted automotive spare parts supplier.`,
};

export default function AboutPage() {
  return (
    <div>
      {/* Hero header */}
      <section className="border-b border-border bg-secondary/40">
        <div className="container-page py-14">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">About Us</p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Your Trusted Partner in<br />Automotive Spare Parts
            </h1>
          </div>
        </div>
      </section>

      <div className="container-page py-14">
        <div className="mx-auto max-w-3xl">
          <p className="text-lg text-muted-foreground leading-relaxed">
            {siteConfig.name} is a dedicated automotive spare parts supplier, providing quality parts
            for a wide range of vehicle makes and models. We help mechanics, workshops, and individual
            vehicle owners find the right parts quickly and reliably.
          </p>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {[
              { icon: Search, title: 'Easy Part Finding', desc: 'Search by part name, OEM number, part number, or vehicle compatibility to find exactly what you need.' },
              { icon: ShieldCheck, title: 'Quality Assured', desc: 'Every part is inspected and accurately described. We provide condition details and clear photos.' },
              { icon: Truck, title: 'Fast Dispatch', desc: 'We process and dispatch orders quickly to minimize your vehicle downtime.' },
              { icon: Headphones, title: 'Expert Support', desc: 'Our team is available on WhatsApp to help you find the right part and answer any questions.' },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border p-6 transition-shadow hover:shadow-md">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/50 mb-4">
                  <item.icon className="h-5 w-5 text-foreground" />
                </div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-xl bg-foreground p-10 text-center text-background">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-background/20">
              <Award className="h-6 w-6 text-background" />
            </div>
            <h2 className="mt-5 text-xl font-bold">Our Commitment</h2>
            <p className="mt-2 text-background/60 max-w-2xl mx-auto">
              We are committed to providing accurate information, fair pricing, and reliable service.
              If a part isn't listed in our catalog, send us an inquiry and we'll help source it for you.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <WhatsAppButton size="lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

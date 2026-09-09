import { Wrench, ShieldCheck, Truck, Headphones, Search, Award } from 'lucide-react';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { siteConfig } from '@/lib/site-config';

export const metadata = {
  title: 'About Us',
  description: `Learn about ${siteConfig.name} - your trusted automotive spare parts supplier.`,
};

export default function AboutPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">About {siteConfig.name}</h1>
        <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
          {siteConfig.name} is a dedicated automotive spare parts supplier, providing quality parts
          for a wide range of vehicle makes and models. We help mechanics, workshops, and individual
          vehicle owners find the right parts quickly and reliably.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {[
            { icon: Search, title: 'Easy Part Finding', desc: 'Search by part name, OEM number, part number, or vehicle compatibility to find exactly what you need.' },
            { icon: ShieldCheck, title: 'Quality Assured', desc: 'Every part is inspected and accurately described. We provide condition details and clear photos.' },
            { icon: Truck, title: 'Fast Dispatch', desc: 'We process and dispatch orders quickly to minimize your vehicle downtime.' },
            { icon: Headphones, title: 'Expert Support', desc: 'Our team is available on WhatsApp to help you find the right part and answer any questions.' },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-4 rounded-lg border border-border p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-lg bg-secondary/50 p-8 text-center">
          <Award className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-xl font-bold">Our Commitment</h2>
          <p className="mt-2 text-muted-foreground max-w-2xl mx-auto">
            We are committed to providing accurate information, fair pricing, and reliable service.
            If a part isn't listed in our catalog, send us an inquiry and we'll help source it for you.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <WhatsAppButton size="lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

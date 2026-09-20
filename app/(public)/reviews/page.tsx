import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { TestimonialsSection } from '@/components/public/testimonials-section';
import { testimonials } from '@/lib/content/testimonials';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/lib/site-config';
import { WhatsAppButton } from '@/components/public/whatsapp-button';

export const metadata: Metadata = {
  title: 'Customer Testimonials',
  description:
    'What importers, workshops, and fleet buyers say about sourcing used Japanese cars, auto parts, and machinery with ANSHA TRADING in Dubai.',
  alternates: { canonical: '/reviews' },
  openGraph: {
    title: `Customer Testimonials | ${siteConfig.name}`,
    description:
      'Real-feeling customer voices from UAE, Africa, and regional buyers who work with ANSHA.',
    url: `${siteConfig.url}/reviews`,
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ReviewsPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Customer Testimonials',
    description:
      'Testimonials from buyers who source vehicles, auto parts, and machinery with ANSHA TRADING.',
    url: `${siteConfig.url}/reviews`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: testimonials.map((t, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Review',
          author: {
            '@type': 'Person',
            name: t.name,
          },
          reviewBody: t.quote,
          reviewRating: {
            '@type': 'Rating',
            ratingValue: t.rating,
            bestRating: 5,
            worstRating: 1,
          },
          itemReviewed: {
            '@type': 'Organization',
            name: siteConfig.name,
            url: siteConfig.url,
          },
        },
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="page-band">
        <div className="container-page py-10 sm:py-14">
          <p className="eyebrow text-accent mb-1.5">Testimonials</p>
          <h1 className="font-display text-2xl font-black tracking-tight md:text-4xl">
            Customer reviews
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
            Voices from importers, workshops, and fleet buyers who source Japanese vehicles,
            auto parts, and heavy machinery through ANSHA in Dubai. These are curated testimonials
            for the site — not a live third-party review widget.
          </p>
        </div>
      </section>

      <TestimonialsSection
        showLink={false}
        eyebrow="Trusted in trade"
        heading="Practical feedback from people who buy and ship"
        subheading="Short quotes about stock clarity, OEM fitment, and export coordination."
      />

      <section className="border-t border-accent/20 bg-[#101114] py-10 text-white">
        <div className="container-page flex flex-col items-center justify-between gap-5 text-center md:flex-row md:text-left">
          <div>
            <h2 className="font-display text-xl font-extrabold">Ready to source with ANSHA?</h2>
            <p className="mt-1 text-sm text-white/60">
              Share make, model, year, and destination — we respond with availability.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <WhatsAppButton message="Hello ANSHA TRADING, I saw your testimonials and want to source stock." />
            <Button asChild variant="outline" className="h-11 border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link href="/contact">
                Contact team <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

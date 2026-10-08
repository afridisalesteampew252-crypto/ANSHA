import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { TestimonialsSection } from '@/components/public/testimonials-section';
import { getPublishedReviews } from '@/lib/reviews';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/lib/site-config';
import { buildPageMetadata } from '@/lib/seo';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = buildPageMetadata({
  title: 'Customer Testimonials',
  description: `Published customer testimonials about sourcing vehicles, auto parts, and machinery with ${siteConfig.name} in Dubai.`,
  path: '/reviews',
});

export default async function ReviewsPage() {
  const reviews = await getPublishedReviews();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Customer Testimonials',
    description:
      'Testimonials from buyers who source vehicles, auto parts, and machinery with ANSHA TRADING.',
    url: `${siteConfig.url}/reviews`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: reviews.map((t, index) => ({
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
      <JsonLd data={jsonLd} />

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
        reviews={reviews}
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

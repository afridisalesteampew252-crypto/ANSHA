import Link from 'next/link';
import { ArrowRight, Quote, Star } from 'lucide-react';
import type { Review } from '@/lib/types';

function Stars({ rating }: { rating: number }) {
  const safe = Math.min(5, Math.max(1, Math.round(rating)));
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${safe} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < safe ? 'fill-accent text-accent' : 'text-border'}`}
        />
      ))}
    </div>
  );
}

export function TestimonialsSection({
  reviews,
  limit,
  showLink = true,
  eyebrow = 'Customer voices',
  heading = 'What buyers say about working with ANSHA',
  subheading = 'Importers, workshops, and fleet buyers who source Japanese vehicles, auto parts, and machinery through Dubai.',
}: {
  reviews: Review[];
  limit?: number;
  showLink?: boolean;
  eyebrow?: string;
  heading?: string;
  subheading?: string;
}) {
  const items = typeof limit === 'number' ? reviews.slice(0, limit) : reviews;
  const featured = items[0];
  const rest = items.slice(1);

  if (!featured) {
    return (
      <section className="surface-cool border-y border-accent/10 py-14 sm:py-20">
        <div className="container-page min-w-0 text-center">
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">{heading}</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            Customer reviews will appear here once published from the admin panel.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-cool border-y border-accent/10 py-14 sm:py-20">
      <div className="container-page min-w-0">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{heading}</h2>
            <p>{subheading}</p>
          </div>
          {showLink && (
            <Link href="/reviews" className="section-link">
              All testimonials <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        <figure className="mt-8 border-l-4 border-accent pl-5 sm:pl-7">
          <Quote className="mb-3 h-7 w-7 text-accent/70" aria-hidden />
          <blockquote className="font-display text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl sm:leading-snug">
            &ldquo;{featured.quote}&rdquo;
          </blockquote>
          <figcaption className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <Stars rating={featured.rating} />
            <span className="font-semibold text-foreground">{featured.name}</span>
            <span className="text-muted-foreground">
              {[featured.role, featured.location].filter(Boolean).join(' · ')}
            </span>
          </figcaption>
        </figure>

        {rest.length > 0 && (
          <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((item) => (
              <li key={item.id} className="min-w-0">
                <Stars rating={item.rating} />
                <p className="mt-3 text-sm leading-6 text-foreground/90">&ldquo;{item.quote}&rdquo;</p>
                <p className="mt-4 text-sm font-semibold text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[item.role, item.location].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

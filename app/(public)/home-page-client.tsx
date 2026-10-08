'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  CarFront,
  ChevronRight,
  CircleHelp,
  Globe2,
  Headphones,
  PackageSearch,
  Search,
  Send,
  ShieldCheck,
  Ship,
  Truck,
  Wrench,
} from 'lucide-react';
import { CatalogImage } from '@/components/public/catalog-image';
import { resolveCategoryImage } from '@/lib/category-images';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PartCard } from '@/components/public/part-card';
import { VehicleCard } from '@/components/public/vehicle-card';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { useInventoryDeals } from '@/hooks/use-inventory-deals';
import type { HomeFeaturedData } from '@/lib/home-featured';
import { HOME_FEATURED_PARTS_LIMIT } from '@/lib/featured-rotation';
import {
  type PublicBlogCard,
  type PublicCategoryCard,
  type PublicPartCard,
  type PublicVehicleCard,
} from '@/lib/public-card-data';
import type { Review } from '@/lib/types';

const ExportMarketsStrip = dynamic(
  () => import('@/components/public/export-markets-strip').then((mod) => mod.ExportMarketsStrip),
  { ssr: true }
);
const PartRequestForm = dynamic(
  () => import('@/components/public/part-request-form').then((mod) => mod.PartRequestForm),
  {
    ssr: true,
    loading: () => <div className="min-h-[22rem] animate-pulse rounded-2xl bg-muted" aria-hidden />,
  }
);
const TestimonialsSection = dynamic(
  () => import('@/components/public/testimonials-section').then((mod) => mod.TestimonialsSection),
  { ssr: true }
);
const BlogCard = dynamic(
  () => import('@/components/public/blog-card').then((mod) => mod.BlogCard),
  { ssr: true }
);

const HERO_DEPARTMENTS = [
  { href: '/vehicles', icon: CarFront, label: 'Vehicle stock', copy: 'Available export units' },
  { href: '/machinery', icon: Truck, label: 'Heavy equipment', copy: 'Machinery & trucks' },
] as const;

export default function HomePageClient({
  initialReviews = [],
  initialFeatured,
}: {
  initialReviews?: Review[];
  initialFeatured?: HomeFeaturedData;
}) {
  const router = useRouter();
  const { dealForVehicle, dealForPart } = useInventoryDeals();
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'parts' | 'vehicles' | 'machinery'>('all');
  const categories = initialFeatured?.categories ?? [];
  const featuredParts = initialFeatured?.featuredParts ?? [];
  const latestParts = initialFeatured?.latestParts ?? [];
  const featuredVehicles = initialFeatured?.featuredVehicles ?? [];
  const featuredMachinery = initialFeatured?.featuredMachinery ?? [];
  const latestPosts = initialFeatured?.latestPosts ?? [];
  const loading = false;

  const goToCatalog = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    const destination = searchType === 'all' ? '/search' : `/${searchType}`;
    router.push(`${destination}${params.size ? `?${params.toString()}` : ''}`);
  };

  const featured = featuredParts.length ? featuredParts : latestParts;

  return (
    <>
      <section className="relative max-w-full overflow-hidden bg-[#0d0f12] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_82%_5%,rgba(210,30,30,0.30),transparent_38%),radial-gradient(ellipse_at_10%_110%,rgba(255,255,255,0.06),transparent_44%),linear-gradient(135deg,#090a0c_0%,#15171b_58%,#0d0f12_100%)]"
        />
        <div
          aria-hidden
          className="bg-grid-dark pointer-events-none absolute inset-y-0 right-0 w-[58%] opacity-40 [mask-image:linear-gradient(to_left,black,transparent)]"
        />
        <div className="container-page relative grid gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(25rem,.92fr)] lg:items-center lg:gap-12 lg:py-20">
          <div className="max-w-2xl">
            <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/75 backdrop-blur sm:text-xs">
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(210,30,30,.15)]" />
              Dubai export desk · Worldwide supply
            </div>
            <h1 className="animate-fade-up-delay-1 mt-5 max-w-2xl font-display text-[2rem] font-black leading-[1.03] tracking-[-0.045em] sm:text-5xl lg:text-[3.55rem]">
              The smarter way to source <span className="text-accent">vehicles &amp; parts</span> from Dubai.
            </h1>
            <p className="animate-fade-up-delay-2 mt-4 max-w-xl text-[14px] leading-6 text-white/70 sm:text-base sm:leading-7">
              Verified public stock, OEM and chassis matching, heavy equipment, and coordinated worldwide export support from one experienced team.
            </p>
            <div className="animate-fade-up-delay-2 mt-7 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
              <Button asChild variant="accent" size="lg" className="col-span-2 h-12 w-full rounded-xl px-6 text-sm font-extrabold shadow-[0_12px_32px_rgba(210,30,30,.28)] sm:w-auto sm:px-7">
                <Link href="/vehicles">Browse vehicle stock <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 text-xs font-bold text-white hover:bg-white/10 sm:w-auto sm:px-6 sm:text-sm">
                <Link href="/parts"><Wrench className="h-4 w-4 text-red-300" />Find parts</Link>
              </Button>
              <Button asChild size="lg" className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 text-xs font-bold text-white hover:bg-white/10 sm:w-auto sm:px-6 sm:text-sm">
                <Link href="/machinery"><Truck className="h-4 w-4 text-red-300" />Machinery</Link>
              </Button>
            </div>
            <div className="animate-fade-up-delay-2 mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-white/50 sm:text-sm">
              <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-accent" />Verified listings</span>
              <span className="inline-flex items-center gap-1.5"><Ship className="h-4 w-4 text-accent" />Global shipping support</span>
              <span className="inline-flex items-center gap-1.5"><Headphones className="h-4 w-4 text-accent" />Direct human service</span>
            </div>
          </div>

          <div className="animate-fade-up-delay-2 relative grid grid-cols-2 gap-3 lg:gap-4">
            <Link href="/parts" className="group col-span-2 flex min-h-36 items-end justify-between overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.10),rgba(255,255,255,.03))] p-5 backdrop-blur transition hover:border-accent/60 hover:bg-white/[0.09] sm:min-h-44 sm:p-6">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-red-300">Parts catalog</span>
                <h2 className="mt-2 max-w-xs text-xl font-black leading-tight text-white sm:text-2xl">Search by OEM, chassis, brand or category.</h2>
                <span className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-white/65">Explore catalog <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
              </div>
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-accent text-white shadow-[0_18px_40px_rgba(210,30,30,.25)] sm:h-20 sm:w-20">
                <PackageSearch className="h-8 w-8 sm:h-10 sm:w-10" />
              </span>
            </Link>
            {HERO_DEPARTMENTS.map((item) => (
              <Link key={item.href} href={item.href} className="group min-h-32 rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:-translate-y-0.5 hover:border-accent/55 hover:bg-black/35 sm:min-h-36 sm:p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-red-300 transition group-hover:bg-accent group-hover:text-white"><item.icon className="h-5 w-5" /></span>
                <strong className="mt-5 block text-sm font-extrabold text-white sm:text-base">{item.label}</strong>
                <span className="mt-1 block text-[11px] text-white/50 sm:text-xs">{item.copy}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-featured border-b border-accent/15 py-8 sm:py-10">
        <div className="container-page min-w-0">
          <form
            onSubmit={goToCatalog}
            className="grid gap-3 rounded-2xl border border-accent/20 bg-[#101114] p-4 text-white shadow-[0_18px_50px_rgba(16,17,20,0.22)] sm:p-6 lg:grid-cols-[1.5fr_.75fr_auto] lg:items-end"
          >
            <div className="lg:col-span-3">
              <span className="eyebrow text-[#ff8a8a]">Search all stock</span>
              <h2 className="mt-1.5 text-lg font-extrabold tracking-tight text-white sm:text-xl">Find vehicles and parts from one place</h2>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-white/55">Make, model, OEM, chassis or part</span>
              <span className="relative block">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. Toyota, NHP10, 81110-52J30"
                  className="h-12 rounded-xl border-white/15 bg-white/10 pl-10 text-white placeholder:text-white/40"
                />
              </span>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold text-white/55">Search in</span>
              <select
                value={searchType}
                onChange={(event) => setSearchType(event.target.value as typeof searchType)}
                className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white"
              >
                <option value="all" className="text-foreground">Everything</option>
                <option value="vehicles" className="text-foreground">Vehicles</option>
                <option value="parts" className="text-foreground">Parts</option>
                <option value="machinery" className="text-foreground">Machinery</option>
              </select>
            </label>
            <Button type="submit" variant="accent" className="h-12 rounded-xl text-sm font-bold">
              <PackageSearch className="h-4 w-4" /> Search
            </Button>
            <p className="flex items-center gap-2 text-[11px] text-white/50 lg:col-span-3">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" />
              Published ANSHA inventory only.
            </p>
          </form>
        </div>
      </section>

      <section className="surface-warm py-10 sm:py-14">
        <div className="container-page min-w-0">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Catalog departments</span>
              <h2>Shop by category</h2>
              <p>Move directly into the part family you need.</p>
            </div>
            <Link href="/categories" className="section-link">All categories <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {categories.map((category) => {
                const imageSrc = resolveCategoryImage(category.slug, category.image_url);
                return (
                  <Link
                    key={category.id}
                    href={`/categories/${category.slug}`}
                    className="group relative block aspect-[4/3] min-h-[9rem] overflow-hidden rounded-2xl border border-border bg-secondary"
                  >
                    {imageSrc ? (
                      <CatalogImage
                        src={imageSrc}
                        alt={category.name}
                        fill
                        sizes="(max-width: 768px) 50vw, 16vw"
                        className="transition duration-500 group-hover:scale-105"
                        objectFit="cover"
                      />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center">
                        <Wrench className="h-10 w-10 text-muted-foreground/15" />
                      </span>
                    )}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                    <span className="absolute inset-x-0 bottom-0 p-4 text-white">
                      <strong className="block text-sm">{category.name}</strong>
                      <span className="mt-1 block text-[11px] text-white/65">Browse parts</span>
                    </span>
                    <ChevronRight className="absolute right-3 top-3 h-7 w-7 rounded-full bg-white/90 p-1.5 text-black opacity-0 transition group-hover:opacity-100" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <ExportMarketsStrip />

      <section className="surface-featured border-y border-accent/15 py-10 sm:py-14">
        <div className="container-page min-w-0">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Ready to ship</span>
              <h2>Featured parts</h2>
              <p>Published stock that rotates every 10 minutes — team-featured items stay prioritized in the pool.</p>
            </div>
            <Link href="/parts" className="section-link">View catalog <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="min-h-[18rem] animate-pulse rounded-2xl bg-muted sm:min-h-[22rem]" />
              ))}
            </div>
          ) : featured.length ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-5 lg:grid-cols-4">
              {featured.slice(0, HOME_FEATURED_PARTS_LIMIT).map((part, index) => (
                <PartCard key={part.id} part={part} priority={index < 4} deal={dealForPart(part.id)} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
              <Boxes className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <h3 className="mt-4 font-bold">Inventory is being prepared</h3>
              <p className="mt-1 text-sm text-muted-foreground">Send your requirements and the team will source the right part.</p>
            </div>
          )}
        </div>
      </section>

      <section className="surface-ink max-w-full overflow-hidden py-14 text-white sm:py-20">
        <div className="container-page grid min-w-0 items-center gap-10 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <span className="eyebrow">Export showroom</span>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Vehicles sourced for your destination market.
            </h2>
            <p className="mt-4 max-w-xl leading-7 text-white/60">
              Browse published stock or send the make, model, year, and destination you need. ANSHA can coordinate inspection and export support from Dubai.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild variant="accent" className="h-11 rounded-full px-5">
                <Link href="/vehicles">View vehicle stock <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild className="h-11 rounded-full border border-white/20 bg-white/5 px-5 text-white hover:bg-white/10">
                <Link href="/contact">Request sourcing</Link>
              </Button>
            </div>
          </div>
          {featuredVehicles.length ? (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              {featuredVehicles.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} deal={dealForVehicle(vehicle.id)} />
              ))}
            </div>
          ) : (
            <div className="relative min-h-72 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
              <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
              <CarFront className="h-14 w-14 text-accent" />
              <h3 className="mt-8 text-2xl font-extrabold">Looking for a specific vehicle?</h3>
              <p className="mt-3 max-w-md text-sm leading-6 text-white/55">
                Tell us the exact specification. We will respond with current availability instead of showing outdated or invented stock.
              </p>
              <Link href="/contact" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-white">
                Send requirements <ArrowRight className="h-4 w-4 text-accent" />
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="surface-cool border-y border-accent/10 py-14 sm:py-20">
        <div className="container-page min-w-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="eyebrow">Construction &amp; commercial</span>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                Heavy machinery &amp; trucks
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Excavators, loaders, dump trucks, and commercial equipment — inspected stock ready for export coordination.
              </p>
            </div>
            <Button asChild variant="outline" className="h-11 w-full rounded-full sm:w-auto">
              <Link href="/machinery">View all machinery <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>

          {featuredMachinery.length ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featuredMachinery.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} deal={dealForVehicle(vehicle.id)} />
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-[28px] border border-dashed border-border bg-card/60 px-6 py-12 text-center">
              <Truck className="mx-auto h-10 w-10 text-accent" />
              <h3 className="mt-4 font-display text-xl font-extrabold">Need a specific machine?</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                Tell us the type, hours, and destination. We will check availability across our stock network.
              </p>
              <Button asChild variant="accent" className="mt-5 h-11 rounded-full">
                <Link href="/contact">Request machinery</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="surface-warm py-14 sm:py-20">
        <div className="container-page grid min-w-0 gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-[28px] bg-accent p-7 text-white sm:p-10">
            <CircleHelp className="h-11 w-11" />
            <h2 className="mt-6 font-display text-3xl font-extrabold tracking-tight">Can&apos;t find the exact part?</h2>
            <p className="mt-4 leading-7 text-white/95">
              Share the part name, OEM number, vehicle model or chassis code. Our sourcing team will review your request.
            </p>
            <ul className="mt-7 space-y-3 text-sm font-semibold">
              {['OEM and chassis matching', 'All major vehicle brands', 'Direct export support'].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-8">
            <PartRequestForm />
          </div>
        </div>
      </section>

      {latestPosts.length > 0 ? (
        <section className="surface-mist border-t border-accent/10 py-14 sm:py-20">
          <div className="container-page min-w-0">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Export insights</span>
                <h2>Latest from ANSHA</h2>
                <p>Guides and updates for automotive buyers.</p>
              </div>
              <Link href="/blog" className="section-link">All insights <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {latestPosts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="surface-mist border-t border-accent/10 py-10 sm:py-12">
          <div className="container-page flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <span className="eyebrow">Export insights</span>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight">Buying guides &amp; market notes</h2>
              <p className="mt-1 text-sm text-muted-foreground">Practical export reading from the ANSHA team.</p>
            </div>
            <Link href="/blog" className="section-link">
              Visit insights <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}

      <TestimonialsSection reviews={initialReviews} limit={4} />

      <section className="border-t border-accent/20 bg-[#101114] py-8 text-white sm:py-10">
        <div className="container-page flex min-w-0 flex-col items-center justify-between gap-4 text-center md:flex-row md:gap-5 md:text-left">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-white">
              <Globe2 className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-white">Ready to source or export?</h2>
              <p className="text-sm text-white/60">Speak directly with the ANSHA team in Dubai.</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
            <WhatsAppButton message="Hello ANSHA TRADING, I would like help sourcing a vehicle or automotive part." />
            <Button asChild variant="outline" className="h-11 border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link href="/contact"><Send className="h-4 w-4" />Contact team</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  CarFront,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Globe2,
  Headphones,
  PackageSearch,
  Search,
  Send,
  ShieldCheck,
  Ship,
  Tag,
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
import {
  HOME_FEATURED_MACHINERY_LIMIT,
  HOME_FEATURED_MACHINERY_POOL,
  HOME_FEATURED_PARTS_LIMIT,
  HOME_FEATURED_PARTS_POOL,
  HOME_FEATURED_VEHICLES_LIMIT,
  HOME_FEATURED_VEHICLES_POOL,
  msUntilNextFeaturedRotation,
  selectRotatingFeatured,
} from '@/lib/featured-rotation';
import type { HomeFeaturedData } from '@/lib/home-featured';
import { supabase } from '@/lib/supabase/client';
import { getManufacturerLogo, SUPPORTED_MANUFACTURERS } from '@/lib/manufacturer-logos';
import { isMachineryClass, MACHINERY_VEHICLE_CLASSES } from '@/lib/vehicle-class';
import type { BlogPostWithCategory, Category, PartWithRelations, Review, VehicleWithPhotos } from '@/lib/types';

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

interface MakeStat {
  make: string;
  count: number;
}

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
  const [finderBrand, setFinderBrand] = useState('all');
  const [finderCategory, setFinderCategory] = useState('all');
  const [categories, setCategories] = useState<Category[]>(initialFeatured?.categories ?? []);
  const [featuredParts, setFeaturedParts] = useState<PartWithRelations[]>(initialFeatured?.featuredParts ?? []);
  const [latestParts, setLatestParts] = useState<PartWithRelations[]>(initialFeatured?.latestParts ?? []);
  const [featuredVehicles, setFeaturedVehicles] = useState<VehicleWithPhotos[]>(
    initialFeatured?.featuredVehicles ?? []
  );
  const [featuredMachinery, setFeaturedMachinery] = useState<VehicleWithPhotos[]>(
    initialFeatured?.featuredMachinery ?? []
  );
  const [latestPosts, setLatestPosts] = useState<BlogPostWithCategory[]>(initialFeatured?.latestPosts ?? []);
  const [loading, setLoading] = useState(!initialFeatured);

  useEffect(() => {
    let active = true;
    let rotationTimer: ReturnType<typeof setTimeout> | undefined;

    const loadHome = async (isInitial: boolean) => {
      if (isInitial && !initialFeatured) setLoading(true);

      const [catRes, partsPoolRes, vehiclesPoolRes, machineryPoolRes, postsRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order').limit(12),
        supabase
          .from('parts')
          .select('*, categories(*), part_photos(*), part_compatibility(*)')
          .eq('is_published', true)
          .eq('stock_status', 'available')
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(HOME_FEATURED_PARTS_POOL),
        supabase
          .from('vehicles')
          .select('*, vehicle_photos(*)')
          .eq('is_published', true)
          .eq('stock_status', 'available')
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(HOME_FEATURED_VEHICLES_POOL),
        supabase
          .from('vehicles')
          .select('*, vehicle_photos(*)')
          .eq('is_published', true)
          .eq('stock_status', 'available')
          .in('vehicle_class', [...MACHINERY_VEHICLE_CLASSES])
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(HOME_FEATURED_MACHINERY_POOL),
        supabase
          .from('blog_posts')
          .select('*, blog_categories(*)')
          .eq('status', 'published')
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(3),
      ]);
      if (!active) return;

      const nowMs = Date.now();
      const partsPool = (partsPoolRes.data || []) as unknown as PartWithRelations[];
      const vehiclesPool = ((vehiclesPoolRes.data || []) as unknown as VehicleWithPhotos[]).filter(
        (vehicle) => !isMachineryClass(vehicle.vehicle_class || 'passenger')
      );
      const machineryPool = (machineryPoolRes.data || []) as unknown as VehicleWithPhotos[];

      setCategories((catRes.data || []) as Category[]);
      setFeaturedParts(selectRotatingFeatured(partsPool, HOME_FEATURED_PARTS_LIMIT, nowMs));
      setLatestParts(partsPool.slice(0, HOME_FEATURED_PARTS_LIMIT));
      setFeaturedVehicles(selectRotatingFeatured(vehiclesPool, HOME_FEATURED_VEHICLES_LIMIT, nowMs));
      setFeaturedMachinery(selectRotatingFeatured(machineryPool, HOME_FEATURED_MACHINERY_LIMIT, nowMs));
      setLatestPosts((postsRes.data || []) as unknown as BlogPostWithCategory[]);
      setLoading(false);

      // Refresh at the next 10-minute boundary so open tabs advance without a full reload.
      if (rotationTimer) clearTimeout(rotationTimer);
      const delay = msUntilNextFeaturedRotation(nowMs) + 250;
      rotationTimer = setTimeout(() => {
        void loadHome(false);
      }, delay);
    };

    if (initialFeatured) {
      // SSR data already painted — only soft-refresh at the next rotation boundary.
      const delay = msUntilNextFeaturedRotation() + 250;
      rotationTimer = setTimeout(() => {
        void loadHome(false);
      }, delay);
    } else {
      void loadHome(true);
    }

    return () => {
      active = false;
      if (rotationTimer) clearTimeout(rotationTimer);
    };
  }, []);

  const displayMakes = useMemo<MakeStat[]>(() => SUPPORTED_MANUFACTURERS.slice(0, 12).map((make) => ({
    make,
    count: 0,
  })), []);

  const goToParts = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (finderBrand !== 'all') params.set('brand', finderBrand);
    if (finderCategory !== 'all') params.set('category', finderCategory);
    router.push(`/parts${params.size ? `?${params.toString()}` : ''}`);
  };

  const featured = featuredParts.length ? featuredParts : latestParts;

  return (
    <>
      <section className="relative max-w-full overflow-hidden bg-[#101114] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_88%_-10%,rgba(210,30,30,0.38),transparent_42%),radial-gradient(ellipse_at_12%_110%,rgba(255,255,255,0.06),transparent_46%),linear-gradient(165deg,#0b0c0f_0%,#14161b_55%,#101114_100%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.03))]"
        />
        <div className="container-page relative py-10 sm:py-14 lg:py-16">
          <div className="max-w-2xl">
            <p className="animate-fade-up text-xs font-black uppercase tracking-[0.22em] text-accent sm:text-sm">
              ANSHA Trading Co.
            </p>
            <h1 className="animate-fade-up-delay-1 mt-3 max-w-xl font-display text-[1.85rem] font-extrabold leading-[1.08] tracking-[-0.04em] sm:mt-4 sm:text-4xl lg:text-5xl">
              Export-ready vehicles, parts &amp; machinery from Dubai.
            </h1>
            <p className="animate-fade-up-delay-2 mt-3 max-w-lg text-[14px] leading-6 text-white/70 sm:mt-4 sm:text-base sm:leading-7">
              Published stock, OEM fitment support, and worldwide shipping coordination — one export team.
            </p>
            <div className="animate-fade-up-delay-2 mt-6 flex flex-col gap-2.5 sm:mt-7 sm:flex-row sm:flex-wrap sm:gap-3">
              <Button asChild variant="accent" size="lg" className="h-11 w-full rounded-full px-6 text-sm font-bold sm:h-12 sm:w-auto sm:px-7">
                <Link href="/vehicles">Browse vehicles <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" className="h-11 w-full rounded-full border border-white/25 bg-white/10 px-6 text-sm font-bold text-white hover:bg-white/15 sm:h-12 sm:w-auto sm:px-7">
                <Link href="/machinery">Machinery &amp; trucks</Link>
              </Button>
              <Button asChild size="lg" className="h-11 w-full rounded-full border border-white/25 bg-white/10 px-6 text-sm font-bold text-white hover:bg-white/15 sm:h-12 sm:w-auto sm:px-7">
                <Link href="/parts">Explore parts</Link>
              </Button>
            </div>
            <p className="animate-fade-up-delay-2 mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/55">
              <Link href="/#export-markets" className="hover:text-white hover:underline">
                Export markets
              </Link>
              <Link href="/blog" className="hover:text-white hover:underline">
                Insights &amp; guides
              </Link>
              <Link href="/categories" className="hover:text-white hover:underline">
                Parts categories
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-accent/20 bg-accent text-white">
        <div className="container-page flex min-w-0 flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center sm:py-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15">
              <Tag className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white">Featured</p>
              <h2 className="text-base font-extrabold tracking-tight sm:text-lg">Current deals &amp; export offers</h2>
              <p className="mt-0.5 text-sm text-white/95">Published promotions from ANSHA — always linked here.</p>
            </div>
          </div>
          <Button asChild className="h-11 w-full shrink-0 rounded-full bg-white px-5 text-sm font-bold text-accent hover:bg-white/90 sm:w-auto">
            <Link href="/offers">View deals <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      <section className="surface-featured border-b border-accent/15 py-8 sm:py-10">
        <div className="container-page min-w-0">
          <form
            onSubmit={goToParts}
            className="grid gap-3 rounded-[22px] border border-accent/20 bg-[#101114] p-4 text-white shadow-[0_16px_48px_rgba(16,17,20,0.28)] sm:p-5 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end"
          >
            <div className="lg:col-span-4">
              <span className="eyebrow text-[#ff8a8a]">Catalog finder</span>
              <h2 className="mt-1.5 text-lg font-extrabold tracking-tight text-white sm:text-xl">Find the right part faster</h2>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-white/55">Part, OEM or chassis</span>
              <span className="relative block">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. 81110-52J30, NHP10, headlight"
                  className="h-12 rounded-xl border-white/15 bg-white/10 pl-10 text-white placeholder:text-white/40"
                />
              </span>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold text-white/55">Manufacturer</span>
              <select
                value={finderBrand}
                onChange={(event) => setFinderBrand(event.target.value)}
                className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white"
              >
                <option value="all" className="text-foreground">All manufacturers</option>
                {SUPPORTED_MANUFACTURERS.map((brand) => (
                  <option key={brand} value={brand} className="text-foreground">{brand}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold text-white/55">Category</span>
              <select
                value={finderCategory}
                onChange={(event) => setFinderCategory(event.target.value)}
                className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white"
              >
                <option value="all" className="text-foreground">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug} className="text-foreground">{category.name}</option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="accent" className="h-12 rounded-xl text-sm font-bold">
              <PackageSearch className="h-4 w-4" /> Search
            </Button>
            <p className="flex items-center gap-2 text-[11px] text-white/50 lg:col-span-4">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" />
              Published ANSHA inventory only.
            </p>
          </form>
        </div>
      </section>

      <section className="surface-cool max-w-full overflow-x-clip border-b border-border">
        <div className="container-page grid min-w-0 grid-cols-2 divide-x divide-y divide-border/80 py-1 lg:grid-cols-4 lg:divide-y-0">
          {[
            { icon: BadgeCheck, title: 'Verified Stock', text: 'Accurate listings and condition' },
            { icon: Ship, title: 'Global Export', text: 'Shipping coordination worldwide' },
            { icon: ClipboardCheck, title: 'Fitment Support', text: 'OEM and chassis matching' },
            { icon: Headphones, title: 'Human Service', text: 'Direct help on WhatsApp' },
          ].map((item) => (
            <div key={item.title} className="flex min-h-[4.75rem] items-center gap-3 px-3 py-3.5 sm:min-h-24 sm:px-5 sm:py-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent sm:h-11 sm:w-11">
                <item.icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <div>
                <h3 className="text-[13px] font-extrabold leading-tight sm:text-sm">{item.title}</h3>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground sm:mt-1 sm:text-xs">{item.text}</p>
              </div>
            </div>
          ))}
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
              {featured.slice(0, 8).map((part, index) => (
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

      <section className="surface-cool py-14 sm:py-20">
        <div className="container-page min-w-0">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Manufacturer directory</span>
              <h2>Popular brands we supply</h2>
              <p>Open a marque to browse published parts.</p>
            </div>
            <Link href="/parts" className="section-link">All brands <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {displayMakes.map(({ make, count }) => (
              <Link
                key={make}
                href={`/parts?brand=${encodeURIComponent(make)}`}
                className="group flex min-h-[5.5rem] flex-col items-center justify-center rounded-xl border border-border bg-card p-2 text-center transition hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-md sm:min-h-24"
              >
                <Image
                  src={getManufacturerLogo(make)}
                  alt={`${make} logo`}
                  width={52}
                  height={52}
                  loading="lazy"
                  className="h-9 w-12 object-contain transition group-hover:scale-105"
                />
                <strong className="mt-2 line-clamp-1 text-[10px] sm:text-[11px]">{make}</strong>
                {count > 0 && <span className="mt-0.5 text-[9px] font-semibold text-accent">{count} in stock</span>}
              </Link>
            ))}
          </div>
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

'use client';

import { useEffect, useState } from 'react';
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
  Search,
  Send,
  ShieldCheck,
  Tag,
  Truck,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CatalogImage } from '@/components/public/catalog-image';
import { PartCard } from '@/components/public/part-card';
import { VehicleCard } from '@/components/public/vehicle-card';
import { FeaturedVehicleRow } from '@/components/public/featured-vehicle-row';
import { BlogCard } from '@/components/public/blog-card';
import { ExportMarketsStrip } from '@/components/public/export-markets-strip';
import { PartRequestForm } from '@/components/public/part-request-form';
import { TestimonialsSection } from '@/components/public/testimonials-section';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { siteConfig } from '@/lib/site-config';
import { resolveCategoryImage } from '@/lib/category-images';
import { publicVehicleImageUrl } from '@/lib/public-media';
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
import { isMachineryClass, MACHINERY_VEHICLE_CLASSES } from '@/lib/vehicle-class';
import type { BlogPostWithCategory, Category, PartWithRelations, Review, VehicleWithPhotos } from '@/lib/types';

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


  const goToParts = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    router.push(`/parts${params.size ? `?${params.toString()}` : ''}`);
  };

  const featured = featuredParts.length ? featuredParts : latestParts;
  const heroCover = featuredVehicles[0]
    ? (() => {
        const photos = featuredVehicles[0].vehicle_photos || [];
        const cover = photos.find((p) => p.is_cover) || photos[0];
        return cover ? publicVehicleImageUrl(cover.storage_path) : null;
      })()
    : null;

  return (
    <>
      {/* Brand-first full-bleed hero — one composition below light header */}
      <section className="surface-ink relative flex min-h-[min(85vh,720px)] w-full max-w-full items-center overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[#0b0c0f]" />
          <div
            className="absolute inset-0 opacity-40 mix-blend-overlay"
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 50%, rgba(210,30,30,0.18) 0%, transparent 60%)',
            }}
          />
          {heroCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroCover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-[#171415] via-[#171415]/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#171415] via-[#171415]/65 to-transparent" />
        </div>

        <div className="container-page relative z-10 w-full py-16 sm:py-20">
          <div className="max-w-4xl">
            <p className="animate-fade-up font-display text-[12vw] font-black uppercase leading-[0.85] tracking-[-0.05em] text-white sm:text-[5.5rem] lg:text-[7.5rem]">
              ANSHA
            </p>
            <h1 className="animate-fade-up-delay-1 mt-5 max-w-3xl font-display text-3xl font-bold leading-[1.1] tracking-[-0.03em] text-white sm:mt-6 sm:text-4xl lg:text-5xl">
              Export-ready vehicles &amp; parts
              <br className="hidden sm:block" />
              {' '}direct from Dubai.
            </h1>
            <p className="animate-fade-up-delay-2 mt-5 max-w-xl text-base font-medium leading-relaxed text-white/70 sm:mt-6 sm:text-lg">
              Published inventory, reliable inspection, and worldwide export shipping coordinated by a single dedicated team.
            </p>
            <div className="animate-fade-up-delay-3 mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:gap-4">
              <Button
                asChild
                className="h-12 w-full rounded-full bg-[#d21e1e] px-8 text-sm font-bold uppercase tracking-widest text-white hover:bg-[#c35252] sm:h-14 sm:w-auto"
              >
                <Link href="/vehicles">
                  Browse stock <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                className="glass-overlay-light h-12 w-full rounded-full px-8 text-sm font-bold uppercase tracking-widest text-white hover:bg-white/20 sm:h-14 sm:w-auto"
              >
                <a
                  href={`https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent('Hello ANSHA TRADING, I would like help sourcing a vehicle or automotive part.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp inquiry
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="signal-band border-y border-[#cdbfc1]/40">
        <div className="container-page flex min-w-0 flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#d21e1e] text-white">
              <Tag className="h-3 w-3" />
            </span>
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-widest text-[#171415]">
                Current export offers
              </span>
              <span className="mt-0.5 block text-sm font-medium text-[#171415]/80 sm:ml-2 sm:mt-0 sm:inline">
                Published promotions from ANSHA inventory
              </span>
            </div>
          </div>
          <Link
            href="/offers"
            className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-[#d21e1e] hover:text-[#c35252]"
          >
            View deals <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <section className="surface-canvas-deep border-b border-[#cdbfc1]/40 py-12 sm:py-16">
        <div className="container-page min-w-0">
          <div className="mx-auto mb-8 max-w-4xl text-center sm:mb-10">
            <h2 className="font-display text-3xl font-bold text-[#171415] sm:text-4xl">
              Find vehicles &amp; parts
            </h2>
            <p className="mt-3 font-medium text-[#5c6366]">
              Search by make, model, OEM, or chassis number across published stock.
            </p>
          </div>
          <form
            onSubmit={goToParts}
            className="glass-panel mx-auto max-w-4xl rounded-2xl p-4 sm:p-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row">
              <label className="relative block flex-1">
                <span className="sr-only">Part, OEM or chassis</span>
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#828789]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Enter OEM, chassis (e.g. NHP10), or model"
                  className="h-14 rounded-xl border-white/50 bg-white/55 pl-12 text-[15px] font-medium backdrop-blur-sm focus:border-[#d21e1e] focus:bg-white/85"
                />
              </label>
              <Button
                type="submit"
                className="h-14 shrink-0 rounded-xl bg-[#171415] px-8 text-sm font-bold uppercase tracking-wider text-white hover:bg-[#2a2224]"
              >
                Search stock
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              <span className="py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#828789]">
                Quick filters:
              </span>
              {['Toyota', 'Nissan', 'Honda', 'Heavy Machinery'].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    if (chip === 'Heavy Machinery') {
                      router.push('/machinery');
                      return;
                    }
                    router.push(`/parts?brand=${encodeURIComponent(chip)}`);
                  }}
                  className="glass-pill rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#171415] transition hover:border-[#d21e1e] hover:bg-[#d21e1e] hover:text-white"
                >
                  {chip}
                </button>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-[11px] text-[#828789]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#d21e1e]" />
              Published ANSHA inventory only.
            </p>
          </form>
        </div>
      </section>

      <section className="py-14 sm:py-20">
        <div className="container-page min-w-0">
          <div className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
            <div>
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-[#d21e1e]">
                Verified inventory
              </span>
              <h2 className="font-display text-3xl font-bold text-[#171415] sm:text-4xl">
                Featured vehicles
              </h2>
            </div>
            <Link
              href="/vehicles"
              className="hidden items-center gap-1 text-sm font-bold uppercase tracking-wider text-[#171415] transition hover:text-[#d21e1e] sm:inline-flex"
            >
              View catalog <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="min-h-[240px] animate-pulse rounded-[20px] bg-[#c8d0db]/60" />
              ))}
            </div>
          ) : featuredVehicles.length ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {featuredVehicles.slice(0, 4).map((vehicle, index) => (
                <FeaturedVehicleRow
                  key={vehicle.id}
                  vehicle={vehicle}
                  priority={index < 2}
                  deal={dealForVehicle(vehicle.id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-[#cdbfc1] bg-white/60 px-6 py-12 text-center">
              <CarFront className="mx-auto h-10 w-10 text-[#d21e1e]" />
              <h3 className="mt-4 font-display text-xl font-bold text-[#171415]">Looking for a specific vehicle?</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#5c6366]">
                Tell us the exact specification. We will respond with current availability.
              </p>
              <Button asChild className="mt-5 h-11 rounded-full bg-[#d21e1e] hover:bg-[#c35252]">
                <Link href="/contact">Request sourcing</Link>
              </Button>
            </div>
          )}
          <div className="mt-8 text-center sm:hidden">
            <Link
              href="/vehicles"
              className="inline-flex w-full items-center justify-center rounded-full border-2 border-[#171415] px-6 py-3 text-xs font-bold uppercase tracking-widest text-[#171415]"
            >
              View full catalog
            </Link>
          </div>
        </div>
      </section>

      <section className="surface-cool border-y border-accent/10 py-14 sm:py-20">
        <div className="container-page min-w-0">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Catalog departments</span>
              <h2>Shop by category</h2>
              <p>Move directly into the part family you need.</p>
            </div>
            <Link href="/categories" className="section-link">
              All categories <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {loading && categories.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : categories.length > 0 ? (
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
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
              <Boxes className="mx-auto h-9 w-9 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                Browse the full parts catalog while categories load.
              </p>
              <Button asChild variant="outline" className="mt-4 h-10 rounded-full">
                <Link href="/parts">View parts</Link>
              </Button>
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
              {featured.slice(0, 8).map((part) => (
                <PartCard key={part.id} part={part} deal={dealForPart(part.id)} />
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
          <div className="rounded-[28px] bg-[#d21e1e] p-7 text-white sm:p-10">
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
          <div className="glass-panel rounded-[28px] p-5 sm:p-8">
            <PartRequestForm />
          </div>
        </div>
      </section>

      <section id="insights" className="surface-mist border-t border-accent/10 py-14 sm:py-20">
        <div className="container-page min-w-0">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Insights</span>
              <h2>Latest from ANSHA</h2>
              <p>Guides and updates for automotive buyers and exporters.</p>
            </div>
            <Link href="/blog" className="section-link">
              All insights <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {latestPosts.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-3">
              {latestPosts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-border bg-card/70 px-6 py-12 text-center">
              <h3 className="font-display text-xl font-bold text-[#171415]">Buying guides &amp; market notes</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Practical export reading from the ANSHA team will appear here as posts are published.
              </p>
              <Button asChild variant="outline" className="mt-5 h-11 rounded-full">
                <Link href="/blog">Visit insights</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      <section id="reviews">
        <TestimonialsSection
          reviews={initialReviews}
          limit={4}
          eyebrow="Reviews"
          heading="What buyers say about working with ANSHA"
          subheading="Importers, workshops, and fleet buyers who source Japanese vehicles, auto parts, and machinery through Dubai."
        />
      </section>

      <section className="section-ink-band border-t border-white/10 py-10 sm:py-12">
        <div className="container-page flex min-w-0 flex-col items-center justify-between gap-4 text-center md:flex-row md:gap-5 md:text-left">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#d21e1e] text-white">
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

'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PartCard } from '@/components/public/part-card';
import { VehicleCard } from '@/components/public/vehicle-card';
import { BlogCard } from '@/components/public/blog-card';
import { PartRequestForm } from '@/components/public/part-request-form';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { supabase } from '@/lib/supabase/client';
import { getManufacturerLogo, SUPPORTED_MANUFACTURERS } from '@/lib/manufacturer-logos';
import type { BlogPostWithCategory, Category, PartWithRelations, VehicleWithPhotos } from '@/lib/types';

interface MakeStat {
  make: string;
  count: number;
}

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [finderBrand, setFinderBrand] = useState('all');
  const [finderCategory, setFinderCategory] = useState('all');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [featuredParts, setFeaturedParts] = useState<PartWithRelations[]>([]);
  const [latestParts, setLatestParts] = useState<PartWithRelations[]>([]);
  const [featuredVehicles, setFeaturedVehicles] = useState<VehicleWithPhotos[]>([]);
  const [latestPosts, setLatestPosts] = useState<BlogPostWithCategory[]>([]);
  const [brandCounts, setBrandCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [catRes, featuredRes, latestRes, vehiclesRes, postsRes, catalogRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order').limit(12),
        supabase.from('parts').select('*, categories(*), part_photos(*), part_compatibility(*)').eq('is_published', true).eq('is_featured', true).order('created_at', { ascending: false }).limit(8),
        supabase.from('parts').select('*, categories(*), part_photos(*), part_compatibility(*)').eq('is_published', true).order('created_at', { ascending: false }).limit(8),
        supabase.from('vehicles').select('*, vehicle_photos(*)').eq('is_published', true).eq('is_featured', true).order('created_at', { ascending: false }).limit(4),
        supabase.from('blog_posts').select('*, blog_categories(*)').eq('status', 'published').order('published_at', { ascending: false, nullsFirst: false }).limit(3),
        supabase.from('parts').select('brand, category_id').eq('is_published', true),
      ]);
      if (!active) return;

      setCategories((catRes.data || []) as Category[]);
      setFeaturedParts((featuredRes.data || []) as unknown as PartWithRelations[]);
      setLatestParts((latestRes.data || []) as unknown as PartWithRelations[]);
      setFeaturedVehicles((vehiclesRes.data || []) as unknown as VehicleWithPhotos[]);
      setLatestPosts((postsRes.data || []) as unknown as BlogPostWithCategory[]);

      const nextBrandCounts: Record<string, number> = {};
      const nextCategoryCounts: Record<string, number> = {};
      for (const row of catalogRes.data || []) {
        if (row.brand) nextBrandCounts[row.brand.toLowerCase()] = (nextBrandCounts[row.brand.toLowerCase()] || 0) + 1;
        if (row.category_id) nextCategoryCounts[row.category_id] = (nextCategoryCounts[row.category_id] || 0) + 1;
      }
      setBrandCounts(nextBrandCounts);
      setCategoryCounts(nextCategoryCounts);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const displayMakes = useMemo<MakeStat[]>(() => SUPPORTED_MANUFACTURERS.map((make) => ({
    make,
    count: brandCounts[make.toLowerCase()] || 0,
  })), [brandCounts]);

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
      <section className="relative overflow-hidden bg-[#101114] text-white">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_78%_20%,rgba(220,38,38,.35),transparent_28%),linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:auto,44px_44px,44px_44px]" />
        <div className="absolute -right-24 top-10 hidden h-[430px] w-[620px] rotate-[-8deg] rounded-[50%] border border-white/10 bg-gradient-to-br from-white/10 to-transparent blur-sm lg:block" />
        <div className="container-page relative grid min-h-[590px] items-center gap-10 py-14 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
          <div className="max-w-3xl">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/75 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-accent" />Vehicle and parts sourcing from Dubai
            </span>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.04] tracking-[-0.045em] sm:text-5xl lg:text-6xl xl:text-7xl">
              The right automotive stock, <span className="text-accent">ready to export.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/65 sm:text-lg">
              Search verified parts by OEM number, chassis, make or model. Source inspected vehicles and export worldwide with one experienced team.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="accent" size="lg" className="h-12 rounded-full px-6"><Link href="/parts">Explore parts <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild size="lg" className="h-12 rounded-full border border-white/20 bg-white/5 px-6 text-white hover:bg-white/10"><Link href="/vehicles">Browse vehicles</Link></Button>
            </div>
            <div className="mt-9 grid max-w-xl grid-cols-3 gap-3 border-t border-white/10 pt-6">
              {[
                ['55+', 'Supported brands'],
                ['Worldwide', 'Export service'],
                ['Dubai', 'Operations base'],
              ].map(([value, label]) => (
                <div key={label}>
                  <strong className="block text-lg font-extrabold sm:text-xl">{value}</strong>
                  <span className="text-[10px] uppercase tracking-wider text-white/45 sm:text-xs">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative lg:pl-6">
            <div className="rounded-[28px] border border-white/15 bg-white/[0.07] p-3 shadow-2xl backdrop-blur-xl sm:p-5">
              <form onSubmit={goToParts} className="rounded-2xl bg-background p-5 text-foreground sm:p-7">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Smart catalog finder</span>
                    <h2 className="mt-1 text-xl font-extrabold sm:text-2xl">Find the right part faster</h2>
                  </div>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-white"><PackageSearch className="h-5 w-5" /></span>
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold">Part, OEM or chassis number</span>
                  <span className="relative block">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. 81110-52J30, NHP10, headlight" className="h-12 rounded-xl bg-secondary/50 pl-10" />
                  </span>
                </label>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-2 block text-xs font-bold">Manufacturer</span>
                    <select value={finderBrand} onChange={(event) => setFinderBrand(event.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm">
                      <option value="all">All manufacturers</option>
                      {SUPPORTED_MANUFACTURERS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-2 block text-xs font-bold">Category</span>
                    <select value={finderCategory} onChange={(event) => setFinderCategory(event.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm">
                      <option value="all">All categories</option>
                      {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
                    </select>
                  </label>
                </div>
                <Button type="submit" variant="accent" className="mt-5 h-12 w-full rounded-xl text-sm font-bold">Search available inventory <ArrowRight className="h-4 w-4" /></Button>
                <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />Searches only published ANSHA inventory.</p>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-card">
        <div className="container-page grid grid-cols-2 divide-x divide-y divide-border py-2 lg:grid-cols-4 lg:divide-y-0">
          {[
            { icon: BadgeCheck, title: 'Verified Stock', text: 'Accurate listings and condition' },
            { icon: Ship, title: 'Global Export', text: 'Shipping coordination worldwide' },
            { icon: ClipboardCheck, title: 'Fitment Support', text: 'OEM and chassis matching' },
            { icon: Headphones, title: 'Human Service', text: 'Direct help on WhatsApp' },
          ].map((item) => (
            <div key={item.title} className="flex min-h-24 items-center gap-3 px-3 py-4 sm:px-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><item.icon className="h-5 w-5" /></span>
              <div><h3 className="text-xs font-extrabold sm:text-sm">{item.title}</h3><p className="mt-1 text-[10px] leading-4 text-muted-foreground sm:text-xs">{item.text}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-14 sm:py-20">
        <div className="container-page">
          <div className="section-heading">
            <div><span className="eyebrow">Catalog departments</span><h2>Shop by category</h2><p>Move directly into the part family you need.</p></div>
            <Link href="/categories" className="section-link">All categories <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />)}</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {categories.map((category) => (
                <Link key={category.id} href={`/categories/${category.slug}`} className="group relative min-h-44 overflow-hidden rounded-2xl border border-border bg-secondary">
                  {category.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={category.image_url} alt={category.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : <span className="absolute inset-0 grid place-items-center"><Wrench className="h-10 w-10 text-muted-foreground/15" /></span>}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <strong className="block text-sm">{category.name}</strong>
                    <span className="mt-1 block text-[11px] text-white/65">{categoryCounts[category.id] || 0} available</span>
                  </span>
                  <ChevronRight className="absolute right-3 top-3 h-7 w-7 rounded-full bg-white/90 p-1.5 text-black opacity-0 transition group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-secondary/45 py-14 sm:py-20">
        <div className="container-page">
          <div className="section-heading">
            <div><span className="eyebrow">Ready to ship</span><h2>Featured parts</h2><p>Current published inventory selected by the ANSHA team.</p></div>
            <Link href="/parts" className="section-link">View catalog <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="aspect-[.72] animate-pulse rounded-2xl bg-muted" />)}</div>
          ) : featured.length ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{featured.slice(0, 8).map((part) => <PartCard key={part.id} part={part} />)}</div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center"><Boxes className="mx-auto h-10 w-10 text-muted-foreground/30" /><h3 className="mt-4 font-bold">Inventory is being prepared</h3><p className="mt-1 text-sm text-muted-foreground">Send your requirements and the team will source the right part.</p></div>
          )}
        </div>
      </section>

      <section className="py-14 sm:py-20">
        <div className="container-page">
          <div className="section-heading">
            <div><span className="eyebrow">Manufacturer directory</span><h2>Parts for 55 automotive brands</h2><p>Choose a marque to open its filtered catalog.</p></div>
            <Link href="/parts" className="section-link">All inventory <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 xl:grid-cols-11">
            {displayMakes.map(({ make, count }) => (
              <Link key={make} href={`/parts?brand=${encodeURIComponent(make)}`} className="group flex min-h-24 flex-col items-center justify-center rounded-xl border border-border bg-card p-2 text-center transition hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-md">
                <Image src={getManufacturerLogo(make)} alt={`${make} logo`} width={52} height={52} className="h-9 w-12 object-contain transition group-hover:scale-105" />
                <strong className="mt-2 line-clamp-1 text-[10px] sm:text-[11px]">{make}</strong>
                {count > 0 && <span className="mt-0.5 text-[9px] font-semibold text-accent">{count} in stock</span>}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden bg-[#101114] py-14 text-white sm:py-20">
        <div className="container-page grid items-center gap-10 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <span className="eyebrow text-red-400">Export showroom</span>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Vehicles sourced for your destination market.</h2>
            <p className="mt-4 max-w-xl leading-7 text-white/60">Browse published stock or send the make, model, year, and destination you need. ANSHA can coordinate inspection and export support from Dubai.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild variant="accent" className="rounded-full"><Link href="/vehicles">View vehicle stock <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild className="rounded-full border border-white/20 bg-white/5 text-white hover:bg-white/10"><Link href="/contact">Request sourcing</Link></Button>
            </div>
          </div>
          {featuredVehicles.length ? (
            <div className="grid gap-4 sm:grid-cols-2">{featuredVehicles.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} />)}</div>
          ) : (
            <div className="relative min-h-72 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
              <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
              <CarFront className="h-14 w-14 text-accent" />
              <h3 className="mt-8 text-2xl font-extrabold">Looking for a specific vehicle?</h3>
              <p className="mt-3 max-w-md text-sm leading-6 text-white/55">Tell us the exact specification. We will respond with current availability instead of showing outdated or invented stock.</p>
              <Link href="/contact" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-white">Send requirements <ArrowRight className="h-4 w-4 text-accent" /></Link>
            </div>
          )}
        </div>
      </section>

      <section className="py-14 sm:py-20">
        <div className="container-page grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-[28px] bg-accent p-7 text-white sm:p-10">
            <CircleHelp className="h-11 w-11" />
            <h2 className="mt-6 text-3xl font-black tracking-tight">Can’t find the exact part?</h2>
            <p className="mt-4 leading-7 text-white/75">Share the part name, OEM number, vehicle model or chassis code. Our sourcing team will review your request.</p>
            <ul className="mt-7 space-y-3 text-sm font-semibold">
              {['OEM and chassis matching', 'All major vehicle brands', 'Direct export support'].map((item) => <li key={item} className="flex items-center gap-2"><BadgeCheck className="h-4 w-4" />{item}</li>)}
            </ul>
          </div>
          <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-8">
            <PartRequestForm />
          </div>
        </div>
      </section>

      {latestPosts.length > 0 && (
        <section className="border-t border-border bg-secondary/40 py-14 sm:py-20">
          <div className="container-page">
            <div className="section-heading">
              <div><span className="eyebrow">Export insights</span><h2>Latest from ANSHA</h2><p>Guides and updates for automotive buyers.</p></div>
              <Link href="/blog" className="section-link">All insights <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="grid gap-5 md:grid-cols-3">{latestPosts.map((post) => <BlogCard key={post.id} post={post} />)}</div>
          </div>
        </section>
      )}

      <section className="border-t border-border bg-card py-10">
        <div className="container-page flex flex-col items-center justify-between gap-5 text-center md:flex-row md:text-left">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent"><Globe2 className="h-6 w-6" /></span>
            <div><h2 className="text-lg font-extrabold">Ready to source or export?</h2><p className="text-sm text-muted-foreground">Speak directly with the ANSHA team in Dubai.</p></div>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <WhatsAppButton message="Hello ANSHA TRADING, I would like help sourcing a vehicle or automotive part." />
            <Button asChild variant="outline"><Link href="/contact"><Send className="h-4 w-4" />Contact team</Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}

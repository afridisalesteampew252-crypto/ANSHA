import type { Metadata } from 'next';
import Link from 'next/link';
import { CarFront, PackageSearch, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PartCard } from '@/components/public/part-card';
import { VehicleCard } from '@/components/public/vehicle-card';
import {
  fetchPartsCatalogPage,
  fetchVehicleCatalogPage,
  parsePartsCatalogFilters,
  parseVehicleCatalogFilters,
} from '@/lib/catalog-queries';
import { createPublicSupabaseClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'Search Vehicles & Parts | ANSHA TRADING',
  description: 'Search ANSHA vehicle stock and automotive parts from one place.',
  robots: { index: false, follow: true },
};

type Props = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  const params = new URLSearchParams(query ? { q: query } : undefined);
  const client = createPublicSupabaseClient();
  const [parts, vehicles] = query
    ? await Promise.all([
        fetchPartsCatalogPage(client, parsePartsCatalogFilters(params), undefined),
        fetchVehicleCatalogPage(client, parseVehicleCatalogFilters(params)),
      ])
    : [null, null];
  const failed = Boolean(parts?.error || vehicles?.error);

  return (
    <div className="surface-cool min-h-[70vh]">
      <section className="bg-[#101114] py-10 text-white sm:py-14">
        <div className="container-page">
          <span className="eyebrow text-red-300">One search</span>
          <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-5xl">Find vehicles and parts</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
            Search by make, model, chassis, stock number, OEM number, part code, or product name.
          </p>
          <form className="relative mt-6 max-w-3xl" action="/search">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Try Toyota, NHP10, 81110-52J30 or headlight"
              className="h-14 rounded-2xl border-white/15 bg-white pl-12 pr-28 text-base text-foreground shadow-xl"
              autoFocus={!query}
              aria-label="Search vehicles and parts"
            />
            <Button type="submit" variant="accent" className="absolute right-1.5 top-1.5 h-11 rounded-xl px-5">Search</Button>
          </form>
        </div>
      </section>

      <div className="container-page py-10 sm:py-14">
        {!query ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Link href="/vehicles" className="rounded-3xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow-md">
              <CarFront className="h-8 w-8 text-accent" />
              <h2 className="mt-4 text-xl font-extrabold">Browse vehicle stock</h2>
              <p className="mt-2 text-sm text-muted-foreground">Filter available vehicles by make and stock location.</p>
            </Link>
            <Link href="/parts" className="rounded-3xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow-md">
              <PackageSearch className="h-8 w-8 text-accent" />
              <h2 className="mt-4 text-xl font-extrabold">Browse automotive parts</h2>
              <p className="mt-2 text-sm text-muted-foreground">Search parts by OEM number, code, brand, or category.</p>
            </Link>
          </div>
        ) : failed ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
            <h2 className="text-xl font-extrabold">Search is temporarily unavailable</h2>
            <p className="mt-2 text-sm text-muted-foreground">Browse either catalog or contact the team for help.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button asChild variant="outline"><Link href="/vehicles">Vehicle stock</Link></Button>
              <Button asChild variant="outline"><Link href="/parts">Parts catalog</Link></Button>
              <Button asChild variant="accent"><Link href="/contact">Contact ANSHA</Link></Button>
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            <section aria-labelledby="vehicle-results-heading">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <span className="eyebrow">Vehicle stock</span>
                  <h2 id="vehicle-results-heading" className="mt-1 text-2xl font-extrabold">{vehicles?.count ?? 0} vehicle results</h2>
                </div>
                <Link href={`/vehicles?q=${encodeURIComponent(query)}`} className="section-link">View all</Link>
              </div>
              {vehicles?.items.length ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                  {vehicles.items.slice(0, 4).map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} />)}
                </div>
              ) : <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">No vehicles matched “{query}”.</p>}
            </section>

            <section aria-labelledby="part-results-heading">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <span className="eyebrow">Automotive parts</span>
                  <h2 id="part-results-heading" className="mt-1 text-2xl font-extrabold">{parts?.count ?? 0} part results</h2>
                </div>
                <Link href={`/parts?q=${encodeURIComponent(query)}`} className="section-link">View all</Link>
              </div>
              {parts?.items.length ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                  {parts.items.slice(0, 4).map((part) => <PartCard key={part.id} part={part} />)}
                </div>
              ) : <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">No parts matched “{query}”.</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

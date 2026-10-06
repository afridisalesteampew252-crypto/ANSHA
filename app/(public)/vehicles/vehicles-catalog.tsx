'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CarFront, Search, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { VehicleCard } from '@/components/public/vehicle-card';
import { useInventoryDeals } from '@/hooks/use-inventory-deals';
import { SUPPORTED_MANUFACTURERS } from '@/lib/manufacturer-logos';
import {
  VEHICLE_PAGE_SIZE,
  fetchVehicleCatalogPage,
  parseVehicleCatalogFilters,
  type VehicleCatalogFilters,
} from '@/lib/catalog-queries';
import { STOCK_ORIGINS, stockOriginLabel } from '@/lib/stock';
import { getPublicCatalogClient } from '@/lib/supabase/public-catalog';
import type { PublicVehicleCard } from '@/lib/public-card-data';
import type { StockOrigin } from '@/lib/types';

// Public catalog data is read with the anon client, even for signed-in users.
const supabase = getPublicCatalogClient();

function syncVehiclesQuery(input: {
  query: string;
  brand: string;
  stockOrigin: string;
  sort: string;
}) {
  const params = new URLSearchParams();
  if (input.query.trim()) params.set('q', input.query.trim());
  if (input.brand !== 'all') params.set('brand', input.brand);
  if (input.stockOrigin !== 'all') params.set('stock', input.stockOrigin);
  if (input.sort !== 'newest') params.set('sort', input.sort);
  const qs = params.toString();
  return qs ? `/vehicles?${qs}` : '/vehicles';
}

export type VehiclesCatalogInitial = {
  filters: VehicleCatalogFilters;
  items: PublicVehicleCard[];
  count: number;
};

export default function VehiclesCatalog({ initial }: { initial?: VehiclesCatalogInitial }) {
  const router = useRouter();
  const { dealForVehicle } = useInventoryDeals();
  const [vehicles, setVehicles] = useState<PublicVehicleCard[]>(initial?.items ?? []);
  const [vehicleCount, setVehicleCount] = useState(initial?.count ?? 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState(initial?.filters.q ?? '');
  const [submittedQuery, setSubmittedQuery] = useState(initial?.filters.q ?? '');
  const [brand, setBrand] = useState(initial?.filters.brand ?? 'all');
  const [stockOrigin, setStockOrigin] = useState<'all' | StockOrigin>(initial?.filters.stockOrigin ?? 'all');
  const [sort, setSort] = useState(initial?.filters.sort ?? 'newest');
  const [loading, setLoading] = useState(!initial);
  const [hydrated, setHydrated] = useState(false);
  // The server already rendered the first page for the URL filters; skip that fetch once.
  const skipInitialLoadRef = useRef(Boolean(initial));

  useEffect(() => {
    const filters = parseVehicleCatalogFilters(new URLSearchParams(window.location.search));
    setStockOrigin(filters.stockOrigin);
    setBrand(filters.brand);
    setSort(filters.sort);
    setQuery(filters.q);
    setSubmittedQuery(filters.q);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const next = syncVehiclesQuery({ query: submittedQuery, brand, stockOrigin, sort });
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) router.replace(next, { scroll: false });
  }, [brand, hydrated, router, sort, stockOrigin, submittedQuery]);

  const loadVehicles = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setVehicles([]);
    }
    const { items, count } = await fetchVehicleCatalogPage(
      supabase,
      { q: submittedQuery, brand, stockOrigin, sort },
      offset
    );
    setVehicles((current) => append ? [...current, ...items] : items);
    setVehicleCount(count);
    setLoading(false);
    setLoadingMore(false);
  }, [brand, sort, stockOrigin, submittedQuery]);

  useEffect(() => {
    if (skipInitialLoadRef.current) {
      skipInitialLoadRef.current = false;
      return;
    }
    void loadVehicles();
  }, [loadVehicles]);

  return (
    <>
      <section className="relative overflow-hidden bg-[#101114] py-12 text-white sm:py-16">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_82%_15%,rgba(220,38,38,.45),transparent_32%),linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:auto,44px_44px,44px_44px]" />
        <div className="container-page relative max-w-3xl">
          <span className="eyebrow text-accent">Global stock network</span>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
            Vehicles for global markets
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
            Browse verified ANSHA stock across Japan, Dubai, Singapore, China, Thailand, and Taiwan — then inquire for export.
            Looking for excavators or trucks? See{' '}
            <Link href="/machinery" className="font-semibold text-accent underline-offset-2 hover:underline">
              heavy machinery &amp; trucks
            </Link>
            .
          </p>
        </div>
      </section>

      <div className="surface-cool border-t border-accent/10">
      <div className="container-page min-w-0 overflow-x-clip py-8 sm:py-12">
        <nav className="mb-5 min-w-0 max-w-full overflow-x-hidden" aria-label="Vehicle stock locations">
          <div className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain touch-pan-x pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setStockOrigin('all')}
            className={`h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition ${
              stockOrigin === 'all' ? 'border-accent bg-accent text-white' : 'border-border bg-card hover:border-accent/50'
            }`}
          >
            All stock
          </button>
          {STOCK_ORIGINS.map((origin) => (
            <button
              key={origin.value}
              type="button"
              onClick={() => setStockOrigin(origin.value)}
              className={`h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition ${
                stockOrigin === origin.value ? 'border-accent bg-accent text-white' : 'border-border bg-card hover:border-accent/50'
              }`}
            >
              {origin.label}
            </button>
          ))}
          </div>
        </nav>

        <div className="mb-8 grid gap-3 catalog-panel p-3 md:grid-cols-[1fr_180px_180px_auto] md:p-4 lg:grid-cols-[1fr_200px_200px_auto]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (query === submittedQuery) {
                void loadVehicles();
                return;
              }
              setSubmittedQuery(query);
            }}
            className="relative"
          >
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Make, model, chassis or stock number"
              className="h-12 rounded-xl pl-10"
            />
          </form>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="All makes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All makes</SelectItem>
              {SUPPORTED_MANUFACTURERS.map((make) => (
                <SelectItem key={make} value={make}>{make}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest listings</SelectItem>
              <SelectItem value="year-new">Newest model year</SelectItem>
              <SelectItem value="price-low">Price: low to high</SelectItem>
              <SelectItem value="price-high">Price: high to low</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="accent" className="h-12 rounded-xl font-bold" onClick={() => void loadVehicles()}>
            Search stock
          </Button>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="eyebrow">{stockOrigin === 'all' ? 'Published stock' : stockOriginLabel(stockOrigin)}</span>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight">
              {loading ? 'Checking inventory' : `${vehicleCount} vehicle${vehicleCount === 1 ? '' : 's'} available`}
            </h2>
            {!loading ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Showing {vehicles.length} of {vehicleCount} available vehicles
              </p>
            ) : null}
          </div>
          <Button asChild variant="outline" className="h-11 w-full rounded-full sm:w-auto">
            <Link href="/contact"><Send className="h-4 w-4" />Request sourcing</Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="min-h-[22rem] rounded-2xl sm:min-h-[24rem]" />
            ))}
          </div>
        ) : vehicles.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {vehicles.map((vehicle, index) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} priority={index < 4} deal={dealForVehicle(vehicle.id)} />
            ))}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[30px] border border-dashed border-border bg-secondary/35 px-6 py-16 text-center sm:py-24">
            <div className="relative">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-card text-accent shadow-sm">
                <CarFront className="h-8 w-8" />
              </span>
              <h2 className="mt-6 font-display text-2xl font-extrabold">Tell us which vehicle you need</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                There is no matching published vehicle right now. ANSHA can source against your make, model, year, grade, budget, and destination requirements.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild variant="accent" className="h-11 rounded-full">
                  <Link href="/contact">Request a vehicle <Send className="h-4 w-4" /></Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-full"
                  onClick={() => {
                    setQuery('');
                    setBrand('all');
                    setStockOrigin('all');
                    setSort('newest');
                  }}
                >
                  Clear search
                </Button>
              </div>
            </div>
          </div>
        )}
        {!loading && vehicles.length > 0 && vehicles.length < vehicleCount ? (
          <div className="mt-8 flex justify-center">
            <Button
              variant="outline"
              className="h-12 rounded-full px-6"
              disabled={loadingMore}
              onClick={() => void loadVehicles(vehicles.length, true)}
            >
              {loadingMore ? 'Loading vehicles…' : `Show more vehicles (${Math.min(VEHICLE_PAGE_SIZE, vehicleCount - vehicles.length)} more)`}
            </Button>
          </div>
        ) : null}
      </div>
      </div>
    </>
  );
}

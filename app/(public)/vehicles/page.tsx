'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CarFront, Search, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { VehicleCard } from '@/components/public/vehicle-card';
import { SUPPORTED_MANUFACTURERS } from '@/lib/manufacturer-logos';
import { STOCK_ORIGINS, stockOriginLabel } from '@/lib/stock';
import { supabase } from '@/lib/supabase/client';
import type { StockOrigin, VehicleWithPhotos } from '@/lib/types';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleWithPhotos[]>([]);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('all');
  const [stockOrigin, setStockOrigin] = useState<'all' | StockOrigin>('all');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('stock');
    if (STOCK_ORIGINS.some((origin) => origin.value === requested)) setStockOrigin(requested as StockOrigin);
  }, []);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    let request = supabase.from('vehicles').select('*, vehicle_photos(*)').eq('is_published', true).eq('stock_status', 'available');
    const safeQuery = query.trim().replace(/[,%()]/g, ' ');
    if (safeQuery) request = request.or(`title.ilike.%${safeQuery}%,make.ilike.%${safeQuery}%,model.ilike.%${safeQuery}%,chassis_code.ilike.%${safeQuery}%,stock_number.ilike.%${safeQuery}%`);
    if (brand !== 'all') request = request.eq('make', brand);
    if (stockOrigin !== 'all') request = request.eq('stock_origin', stockOrigin);
    if (sort === 'year-new') request = request.order('year', { ascending: false, nullsFirst: false });
    else if (sort === 'price-low') request = request.order('price', { ascending: true, nullsFirst: false });
    else if (sort === 'price-high') request = request.order('price', { ascending: false, nullsFirst: true });
    else request = request.order('created_at', { ascending: false });
    const { data } = await request;
    setVehicles((data || []) as unknown as VehicleWithPhotos[]);
    setLoading(false);
  }, [brand, query, sort, stockOrigin]);

  useEffect(() => { void loadVehicles(); }, [loadVehicles]);

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
          </p>
        </div>
      </section>

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

        <div className="mb-8 grid gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm md:grid-cols-[1fr_200px_200px_auto] md:p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void loadVehicles();
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
              {loading ? 'Checking inventory' : `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} listed`}
            </h2>
          </div>
          <Button asChild variant="outline" className="h-11 w-full rounded-full sm:w-auto">
            <Link href="/contact"><Send className="h-4 w-4" />Request sourcing</Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[.78] rounded-2xl" />
            ))}
          </div>
        ) : vehicles.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
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
      </div>
    </>
  );
}

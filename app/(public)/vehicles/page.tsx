'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CarFront, Globe2, Search, Send, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { VehicleCard } from '@/components/public/vehicle-card';
import { SUPPORTED_MANUFACTURERS } from '@/lib/manufacturer-logos';
import { supabase } from '@/lib/supabase/client';
import type { VehicleWithPhotos } from '@/lib/types';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleWithPhotos[]>([]);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('all');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    let request = supabase.from('vehicles').select('*, vehicle_photos(*)').eq('is_published', true);
    const safeQuery = query.trim().replace(/[,%()]/g, ' ');
    if (safeQuery) request = request.or(`title.ilike.%${safeQuery}%,make.ilike.%${safeQuery}%,model.ilike.%${safeQuery}%,chassis_code.ilike.%${safeQuery}%,stock_number.ilike.%${safeQuery}%`);
    if (brand !== 'all') request = request.eq('make', brand);
    if (sort === 'year-new') request = request.order('year', { ascending: false, nullsFirst: false });
    else if (sort === 'price-low') request = request.order('price', { ascending: true, nullsFirst: false });
    else if (sort === 'price-high') request = request.order('price', { ascending: false, nullsFirst: true });
    else request = request.order('created_at', { ascending: false });
    const { data } = await request;
    setVehicles((data || []) as unknown as VehicleWithPhotos[]);
    setLoading(false);
  }, [brand, query, sort]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  return (
    <>
      <section className="relative overflow-hidden bg-[#101114] py-11 text-white sm:py-16">
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_82%_15%,rgba(220,38,38,.5),transparent_30%),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:auto,42px_42px,42px_42px]" />
        <div className="container-page relative grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-400">Dubai export showroom</span><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Vehicles for global markets</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">Browse current published stock or request a specific make, model, year, and destination specification.</p></div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3"><Ship className="h-4 w-4 text-accent" />Export support</span>
            <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3"><Globe2 className="h-4 w-4 text-accent" />Worldwide</span>
          </div>
        </div>
      </section>

      <div className="container-page py-8 sm:py-12">
        <div className="mb-8 grid gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm md:grid-cols-[1fr_220px_200px_auto]">
          <form onSubmit={(event) => { event.preventDefault(); loadVehicles(); }} className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Make, model, chassis or stock number" className="h-11 rounded-xl pl-10" />
          </form>
          <Select value={brand} onValueChange={setBrand}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="All makes" /></SelectTrigger><SelectContent><SelectItem value="all">All makes</SelectItem>{SUPPORTED_MANUFACTURERS.map((make) => <SelectItem key={make} value={make}>{make}</SelectItem>)}</SelectContent></Select>
          <Select value={sort} onValueChange={setSort}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">Newest listings</SelectItem><SelectItem value="year-new">Newest model year</SelectItem><SelectItem value="price-low">Price: low to high</SelectItem><SelectItem value="price-high">Price: high to low</SelectItem></SelectContent></Select>
          <Button variant="accent" className="h-11 rounded-xl" onClick={loadVehicles}>Search stock</Button>
        </div>

        <div className="mb-6 flex items-end justify-between"><div><span className="eyebrow">Published stock</span><h2 className="mt-2 text-2xl font-black">{loading ? 'Checking inventory' : `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} available`}</h2></div><Button asChild variant="outline" className="hidden rounded-full sm:flex"><Link href="/contact"><Send className="h-4 w-4" />Request sourcing</Link></Button></div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="aspect-[.78] rounded-2xl" />)}</div>
        ) : vehicles.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{vehicles.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} />)}</div>
        ) : (
          <div className="relative overflow-hidden rounded-[30px] border border-dashed border-border bg-secondary/35 px-6 py-16 text-center sm:py-24">
            <div className="absolute inset-0 opacity-50 bg-grid-fine" />
            <div className="relative"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-card text-accent shadow-sm"><CarFront className="h-8 w-8" /></span><h2 className="mt-6 text-2xl font-black">Tell us which vehicle you need</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">There is no matching published vehicle right now. ANSHA can source against your make, model, year, grade, budget, and destination requirements.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Button asChild variant="accent" className="rounded-full"><Link href="/contact">Request a vehicle <Send className="h-4 w-4" /></Link></Button><Button variant="outline" className="rounded-full" onClick={() => { setQuery(''); setBrand('all'); setSort('newest'); }}>Clear search</Button></div></div>
          </div>
        )}
      </div>
    </>
  );
}

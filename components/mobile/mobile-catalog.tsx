'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, CarFront, Loader2, PackageSearch, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { PUBLIC_PART_CARD_SELECT, PUBLIC_VEHICLE_CARD_SELECT, type PublicPartCard, type PublicVehicleCard } from '@/lib/public-card-data';
import { publicPartImageUrl, publicVehicleImageUrl } from '@/lib/public-media';

type CatalogKind = 'vehicles' | 'parts';
const PAGE_SIZE = 24;

type CatalogItem = PublicVehicleCard | PublicPartCard;

function formatPrice(value: number | null, currency: string | null, show: boolean | null) {
  if (!show || value == null) return 'Price on request';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'AED', maximumFractionDigits: 0 }).format(value);
}

function safeSearchTerm(value: string) {
  return value.trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}

export function MobileCatalog({ kind }: { kind: CatalogKind }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  const load = useCallback(async (nextPage: number, term: string, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const cleanTerm = safeSearchTerm(term);
    const result = kind === 'vehicles'
      ? await (() => {
          let request = supabase.from('vehicles').select(PUBLIC_VEHICLE_CARD_SELECT, { count: 'exact' }).eq('is_published', true).eq('stock_status', 'available');
          if (cleanTerm) request = request.or(`title.ilike.%${cleanTerm}%,make.ilike.%${cleanTerm}%,model.ilike.%${cleanTerm}%,chassis_code.ilike.%${cleanTerm}%`);
          return request.order('created_at', { ascending: false }).range(from, to);
        })()
      : await (() => {
          let request = supabase.from('parts').select(PUBLIC_PART_CARD_SELECT, { count: 'exact' }).eq('is_published', true).eq('stock_status', 'available');
          if (cleanTerm) request = request.or(`name.ilike.%${cleanTerm}%,brand.ilike.%${cleanTerm}%,part_code.ilike.%${cleanTerm}%,oem_number.ilike.%${cleanTerm}%`);
          return request.order('created_at', { ascending: false }).range(from, to);
        })();

    if (result.error) {
      setError('Inventory could not be loaded. Check your connection and try again.');
      if (!append) setItems([]);
    } else {
      const nextItems = (result.data || []) as unknown as CatalogItem[];
      setItems((current) => append ? [...current, ...nextItems] : nextItems);
      setTotalCount(result.count || 0);
      setHasMore(from + nextItems.length < (result.count || 0));
      setPage(nextPage);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [kind]);

  useEffect(() => {
    void load(0, '', false);
  }, [load]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const nextTerm = safeSearchTerm(query);
    setSubmittedQuery(nextTerm);
    void load(0, nextTerm, false);
  };

  const retry = () => void load(page, submittedQuery, page > 0 && items.length > 0);

  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-[#d21e1e]">Live ANSHA stock</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">{kind === 'vehicles' ? 'Find your next vehicle' : 'Find the right part'}</h1>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black/55 shadow-sm">{loading ? 'Loading…' : `${totalCount} available`}</span>
      </div>
      <form onSubmit={submitSearch} className="relative mb-5">
        <label htmlFor="mobile-catalog-search" className="sr-only">{kind === 'vehicles' ? 'Search vehicles' : 'Search parts'}</label>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/35" aria-hidden="true" />
        <input id="mobile-catalog-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === 'vehicles' ? 'Search make, model or chassis' : 'Search part, brand or OEM code'} className="h-14 w-full rounded-2xl border border-black/5 bg-white pl-12 pr-24 text-sm font-semibold shadow-sm outline-none ring-[#d21e1e]/20 focus:ring-4" />
        <button type="submit" className="absolute right-1.5 top-1.5 h-11 rounded-xl bg-[#d21e1e] px-3 text-xs font-black text-white">Search</button>
      </form>
      {submittedQuery ? <p className="mb-4 text-xs font-bold text-black/45">Showing results for “{submittedQuery}”</p> : null}
      {loading ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="min-h-64 animate-pulse rounded-3xl bg-white/70" /><div className="hidden min-h-64 animate-pulse rounded-3xl bg-white/70 sm:block" /></div> : error ? (
        <div className="rounded-3xl bg-white px-6 py-16 text-center shadow-sm"><PackageSearch className="mx-auto h-10 w-10 text-black/15" /><p className="mt-3 font-bold">We could not load stock</p><p className="mt-1 text-sm text-black/45">Your data is safe. Try loading the catalog again.</p><button type="button" onClick={retry} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#d21e1e] px-4 py-3 text-sm font-black text-white"><RefreshCw className="h-4 w-4" />Try again</button></div>
      ) : items.length ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((item) => {
              const vehicle = kind === 'vehicles' ? item as PublicVehicleCard : null;
              const part = kind === 'parts' ? item as PublicPartCard : null;
              const photos = vehicle ? vehicle.vehicle_photos : part ? part.part_photos : [];
              const cover = photos?.find((photo) => photo.is_cover) || photos?.[0];
              const image = cover ? (vehicle ? publicVehicleImageUrl(cover.storage_path) : publicPartImageUrl(cover.storage_path)) : null;
              const title = vehicle?.title || part?.name || 'Inventory item';
              const href = vehicle ? `/mobile/stock/${vehicle.slug}` : `/mobile/parts/${part?.slug}`;
              return <Link key={item.id} href={href} className="group overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm transition active:scale-[.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#d21e1e]/20">
                <div className="relative aspect-[1.35] overflow-hidden bg-[#e7eaee]">
                  {image ? <Image src={image} alt={title} fill sizes="(max-width: 640px) 100vw, 280px" className="object-cover transition duration-300 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-black/20">{vehicle ? <CarFront className="h-10 w-10" /> : <PackageSearch className="h-10 w-10" />}</div>}
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-[#d21e1e]">Available</span>
                </div>
                <div className="p-4"><h2 className="line-clamp-2 min-h-10 text-sm font-black leading-5">{title}</h2><p className="mt-1 text-xs text-black/55">{vehicle ? `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year || ''}` : `${part?.brand || 'Genuine'} · ${part?.part_code || 'OEM'}`}</p><div className="mt-3 flex items-center justify-between gap-2"><p className="text-sm font-black text-[#d21e1e]">{formatPrice(vehicle?.price ?? part?.price ?? null, vehicle?.currency || part?.currency || null, vehicle?.show_price ?? part?.show_price ?? false)}</p><span className="text-[10px] font-black uppercase tracking-wide text-black/35">View details</span></div></div>
              </Link>;
            })}
          </div>
          {hasMore ? <button type="button" onClick={() => void load(page + 1, submittedQuery, true)} disabled={loadingMore} className="mx-auto mt-6 flex items-center gap-2 rounded-2xl border border-black/10 bg-white px-5 py-3.5 text-sm font-black shadow-sm disabled:opacity-60">{loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDown className="h-4 w-4" />} {loadingMore ? 'Loading more…' : 'Load more stock'}</button> : <p className="mt-6 text-center text-xs font-bold text-black/35">Showing all {totalCount} available {kind}.</p>}
        </>
      ) : <div className="rounded-3xl bg-white px-6 py-16 text-center shadow-sm"><PackageSearch className="mx-auto h-10 w-10 text-black/15" /><p className="mt-3 font-bold">No matching stock right now.</p><p className="mt-1 text-sm text-black/45">Try another search or contact the ANSHA team.</p></div>}
      <button type="button" onClick={() => void load(0, submittedQuery, false)} className="mx-auto mt-5 flex items-center gap-2 text-xs font-black text-black/45"><RefreshCw className="h-3.5 w-3.5" />Refresh live stock</button>
    </section>
  );
}

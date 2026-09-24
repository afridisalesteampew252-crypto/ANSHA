'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, CarFront, Loader2, PackageSearch, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { PUBLIC_PART_CARD_SELECT, PUBLIC_VEHICLE_CARD_SELECT, type PublicPartCard, type PublicVehicleCard } from '@/lib/public-card-data';
import { publicPartImageUrl, publicVehicleImageUrl } from '@/lib/public-media';

type CatalogKind = 'vehicles' | 'parts';

function formatPrice(value: number | null, currency: string | null, show: boolean | null) {
  if (!show || value == null) return 'Price on request';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'AED', maximumFractionDigits: 0 }).format(value);
}

export function MobileCatalog({ kind }: { kind: CatalogKind }) {
  const [items, setItems] = useState<Array<PublicVehicleCard | PublicPartCard>>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      if (kind === 'vehicles') {
        const { data } = await supabase.from('vehicles').select(PUBLIC_VEHICLE_CARD_SELECT).eq('is_published', true).eq('stock_status', 'available').order('created_at', { ascending: false }).limit(24);
        if (active) setItems((data || []) as unknown as PublicVehicleCard[]);
      } else {
        const { data } = await supabase.from('parts').select(PUBLIC_PART_CARD_SELECT).eq('is_published', true).eq('stock_status', 'available').order('created_at', { ascending: false }).limit(24);
        if (active) setItems((data || []) as unknown as PublicPartCard[]);
      }
      if (active) setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [kind]);

  const filtered = items.filter((item) => {
    const haystack = kind === 'vehicles'
      ? `${(item as PublicVehicleCard).title} ${(item as PublicVehicleCard).make} ${(item as PublicVehicleCard).model}`
      : `${(item as PublicPartCard).name} ${(item as PublicPartCard).brand} ${(item as PublicPartCard).part_code}`;
    return haystack.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-[#d21e1e]">Live ANSHA stock</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">{kind === 'vehicles' ? 'Find your next vehicle' : 'Find the right part'}</h1>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black/55 shadow-sm">{items.length} available</span>
      </div>
      <div className="relative mb-5">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/35" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === 'vehicles' ? 'Search make or model' : 'Search part, brand or code'} className="h-13 w-full rounded-2xl border border-black/5 bg-white pl-12 pr-4 text-sm font-semibold shadow-sm outline-none ring-[#d21e1e]/20 focus:ring-4" />
      </div>
      {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#d21e1e]" /></div> : filtered.length ? (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((item) => {
            const vehicle = kind === 'vehicles' ? item as PublicVehicleCard : null;
            const part = kind === 'parts' ? item as PublicPartCard : null;
            const photos = vehicle ? vehicle.vehicle_photos : part ? part.part_photos : [];
            const cover = photos?.find((photo) => photo.is_cover) || photos?.[0];
            const image = cover ? (vehicle ? publicVehicleImageUrl(cover.storage_path) : publicPartImageUrl(cover.storage_path)) : null;
            const title = vehicle?.title || part?.name || 'Inventory item';
            const href = vehicle ? `/mobile/stock/${vehicle.slug}` : `/mobile/parts/${part?.slug}`;
            return (
              <Link key={item.id} href={href} className="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition active:scale-[.98]">
                <div className="relative aspect-[1.1] overflow-hidden bg-[#e7eaee]">
                  {image ? <Image src={image} alt={title} fill sizes="(max-width: 640px) 50vw, 280px" className="object-cover transition duration-300 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-black/20">{vehicle ? <CarFront className="h-10 w-10" /> : <PackageSearch className="h-10 w-10" />}</div>}
                  <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-[#d21e1e]">Available</span>
                </div>
                <div className="p-3">
                  <h2 className="line-clamp-2 min-h-10 text-sm font-black leading-5">{title}</h2>
                  <p className="mt-1 text-xs text-black/45">{vehicle ? `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year || ''}` : `${part?.brand || 'Genuine'} • ${part?.part_code || 'OEM'}`}</p>
                  <p className="mt-2 text-sm font-black text-[#d21e1e]">{formatPrice(vehicle?.price ?? part?.price ?? null, vehicle?.currency || part?.currency || null, vehicle?.show_price ?? part?.show_price ?? false)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : <div className="rounded-3xl bg-white px-6 py-16 text-center shadow-sm"><PackageSearch className="mx-auto h-10 w-10 text-black/15" /><p className="mt-3 font-bold">No matching stock right now.</p><p className="mt-1 text-sm text-black/45">Try another search or contact the ANSHA team.</p></div>}
      <Link href={kind === 'vehicles' ? '/mobile/stock' : '/mobile/parts'} className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white py-3.5 text-sm font-black">Refresh catalog <ArrowRight className="h-4 w-4" /></Link>
    </section>
  );
}

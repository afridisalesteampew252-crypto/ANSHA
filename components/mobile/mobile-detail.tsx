'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CarFront, Check, ChevronLeft, ChevronRight, PackageSearch, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getPublicCatalogClient } from '@/lib/supabase/public-catalog';
import { publicPartImageUrl, publicVehicleImageUrl } from '@/lib/public-media';
import { MobileInquiryForm } from '@/components/mobile/mobile-inquiry-form';

// Public catalog data is read with the anon client, even for signed-in users.
const supabase = getPublicCatalogClient();

type Kind = 'vehicle' | 'part';
type Photo = { storage_path: string; is_cover?: boolean | null; sort_order?: number | null };
type Item = { id: string; slug: string; title?: string; name?: string; description?: string | null; make?: string | null; model?: string | null; year?: number | null; chassis_code?: string | null; mileage?: number | null; transmission?: string | null; fuel_type?: string | null; vehicle_class?: string | null; part_code?: string | null; part_number?: string | null; oem_number?: string | null; brand?: string | null; quantity?: number | null; price?: number | null; currency?: string | null; show_price?: boolean | null; vehicle_photos?: Photo[]; part_photos?: Photo[] };

function money(item: Item) {
  if (!item.show_price || item.price == null) return 'Price on request';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency || 'AED', maximumFractionDigits: 0 }).format(item.price);
}

export function MobileDetail({ kind }: { kind: Kind }) {
  const params = useParams<{ slug: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = kind === 'vehicle'
        ? (await supabase.from('vehicles').select('id,slug,title,description,make,model,year,chassis_code,mileage,transmission,fuel_type,vehicle_class,price,currency,show_price,vehicle_photos(storage_path,is_cover,sort_order)').eq('slug', params.slug).eq('is_published', true).eq('stock_status', 'available').maybeSingle()).data
        : (await supabase.from('parts').select('id,slug,name,description,part_code,part_number,oem_number,brand,quantity,price,currency,show_price,part_photos(storage_path,is_cover,sort_order)').eq('slug', params.slug).eq('is_published', true).eq('stock_status', 'available').maybeSingle()).data;
      if (active) {
        setItem(data as Item | null);
        setLoading(false);
      }
    };
    if (params.slug) void load();
    return () => { active = false; };
  }, [kind, params.slug]);

  const photos = useMemo(() => ((kind === 'vehicle' ? item?.vehicle_photos : item?.part_photos) || []).slice().sort((a, b) => Number(Boolean(b.is_cover)) - Number(Boolean(a.is_cover)) || (a.sort_order || 0) - (b.sort_order || 0)), [item, kind]);
  const title = item?.title || item?.name || 'ANSHA inventory';
  const image = photos[photoIndex] ? (kind === 'vehicle' ? publicVehicleImageUrl(photos[photoIndex].storage_path) : publicPartImageUrl(photos[photoIndex].storage_path)) : null;
  const back = kind === 'vehicle' ? '/mobile/stock' : '/mobile/parts';

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title, url });
    else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  if (loading) return <div className="flex min-h-80 items-center justify-center text-sm font-bold text-black/45">Loading live inventory…</div>;
  if (!item) return <div className="rounded-3xl bg-white px-6 py-20 text-center shadow-sm"><PackageSearch className="mx-auto h-10 w-10 text-black/15" /><h1 className="mt-4 text-xl font-black">Item unavailable</h1><Link href={back} className="mt-5 inline-flex rounded-xl bg-[#d21e1e] px-4 py-3 text-sm font-black text-white">Back to stock</Link></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><Link href={back} className="inline-flex items-center gap-1 text-sm font-black text-black/55"><ArrowLeft className="h-4 w-4" />Back to stock</Link><button type="button" onClick={() => void share()} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-black shadow-sm"><Share2 className="h-4 w-4 text-[#d21e1e]" />{copied ? 'Copied' : 'Share'}</button></div>
      <section className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
        <div className="relative aspect-[1.08] overflow-hidden bg-[#e7eaee]">
          {image ? <Image src={image} alt={title} fill priority sizes="(max-width: 640px) 100vw, 560px" className="object-cover" /> : <div className="grid h-full place-items-center text-black/15">{kind === 'vehicle' ? <CarFront className="h-16 w-16" /> : <PackageSearch className="h-16 w-16" />}</div>}
          <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#d21e1e]">Available now</span>
          {photos.length > 1 ? <><button type="button" onClick={() => setPhotoIndex((photoIndex - 1 + photos.length) % photos.length)} className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white"><ChevronLeft className="h-5 w-5" /></button><button type="button" onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)} className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white"><ChevronRight className="h-5 w-5" /></button></> : null}
        </div>
        {photos.length > 1 ? <div className="flex gap-2 overflow-x-auto p-3">{photos.map((photo, index) => <button type="button" key={photo.storage_path} onClick={() => setPhotoIndex(index)} className={`relative h-14 w-16 shrink-0 overflow-hidden rounded-lg ${index === photoIndex ? 'ring-2 ring-[#d21e1e]' : ''}`}><Image src={kind === 'vehicle' ? publicVehicleImageUrl(photo.storage_path) : publicPartImageUrl(photo.storage_path)} alt="" fill sizes="64px" className="object-cover" /></button>)}</div> : null}
        <div className="p-5"><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#d21e1e]">{kind === 'vehicle' ? 'Export vehicle' : 'Automotive part'}</p><h1 className="mt-2 text-2xl font-black leading-tight">{title}</h1><p className="mt-2 text-2xl font-black text-[#d21e1e]">{money(item)}</p><p className="mt-4 text-sm leading-6 text-black/55">{item.description || 'Verified ANSHA inventory available for export. Contact our team for availability, shipping, and payment details.'}</p></div>
      </section>
      <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Specifications</h2><div className="mt-3 grid grid-cols-2 gap-2">{(kind === 'vehicle' ? [['Make', item.make], ['Model', item.model], ['Year', item.year], ['Mileage', item.mileage ? `${item.mileage.toLocaleString()} km` : null], ['Transmission', item.transmission], ['Fuel', item.fuel_type], ['Chassis', item.chassis_code]] : [['Brand', item.brand], ['Part code', item.part_code], ['Part number', item.part_number], ['OEM number', item.oem_number], ['Quantity', item.quantity], ['Availability', 'In stock']]).filter(([, value]) => value != null && value !== '').map(([label, value]) => <div key={label} className="rounded-xl bg-[#f4f6f8] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-black/40">{label}</p><p className="mt-1 text-sm font-bold">{String(value)}</p></div>)}</div></section>
      <MobileInquiryForm itemId={item.id} itemType={kind} itemName={title} />
    </div>
  );
}

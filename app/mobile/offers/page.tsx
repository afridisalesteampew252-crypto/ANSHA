'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, BadgePercent, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type Offer = { id: string; title: string; summary: string | null; discount_percent: number | null; sale_price: number | null };

export default function MobileOffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void supabase.from('site_offers').select('id,title,summary,discount_percent,sale_price').eq('is_published', true).order('published_at', { ascending: false }).limit(20).then(({ data }) => { setOffers((data || []) as Offer[]); setLoading(false); }); }, []);
  return <section className="space-y-4"><Link href="/mobile" className="inline-flex items-center gap-1 text-sm font-black text-black/55"><ArrowLeft className="h-4 w-4" />Back home</Link><div className="rounded-[2rem] bg-[#17191d] p-6 text-white"><BadgePercent className="h-8 w-8 text-red-300" /><p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-red-300">Admin published</p><h1 className="mt-2 text-3xl font-black">Current offers</h1><p className="mt-2 text-sm leading-6 text-white/60">Promotions and deal pricing published by your ANSHA team.</p></div>{loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#d21e1e]" /></div> : offers.length ? offers.map((offer) => <article key={offer.id} className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{offer.title}</h2><p className="mt-2 text-sm leading-6 text-black/55">{offer.summary || 'Ask the ANSHA team about this published offer.'}</p></div><ArrowRight className="h-5 w-5 shrink-0 text-[#d21e1e]" /></div>{offer.discount_percent ? <span className="mt-4 inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-black text-[#d21e1e]">Save {offer.discount_percent}%</span> : null}</article>) : <div className="rounded-2xl bg-white p-8 text-center text-sm text-black/45 shadow-sm">No active offers right now.</div>}</section>;
}

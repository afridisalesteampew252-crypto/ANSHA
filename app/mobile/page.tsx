'use client';

import Link from 'next/link';
import { ArrowRight, Bell, CarFront, MessageCircle, PackageSearch, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

 type Offer = { id: string; title: string; summary: string | null; href: string };

export default function MobileHomePage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  useEffect(() => {
    void supabase.from('site_offers').select('id,title,summary,href').eq('is_published', true).order('published_at', { ascending: false }).limit(3).then(({ data }) => setOffers((data || []) as Offer[]));
  }, []);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#17191d] px-5 py-7 text-white shadow-xl shadow-black/10">
        <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-[#d21e1e]/35 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-red-300">ANSHA Trading Co.</p>
          <h1 className="mt-3 max-w-xs text-3xl font-black leading-tight">Parts, vehicles, and export support in your pocket.</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Your live inventory app — controlled by the same ANSHA admin team and Supabase database.</p>
          <div className="mt-5 flex gap-2">
            <Link href="/mobile/stock" className="inline-flex items-center gap-2 rounded-xl bg-[#d21e1e] px-4 py-3 text-sm font-black">Browse stock <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/mobile/account" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-black">Account</Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/mobile/stock" className="rounded-2xl bg-white p-4 shadow-sm transition active:scale-[.98]"><CarFront className="h-6 w-6 text-[#d21e1e]" /><p className="mt-5 text-sm font-black">Vehicles</p><p className="mt-1 text-xs text-black/45">Live export stock</p></Link>
        <Link href="/mobile/parts" className="rounded-2xl bg-white p-4 shadow-sm transition active:scale-[.98]"><PackageSearch className="h-6 w-6 text-[#d21e1e]" /><p className="mt-5 text-sm font-black">Parts</p><p className="mt-1 text-xs text-black/45">Search OEM inventory</p></Link>
        <Link href="/mobile/account" className="rounded-2xl bg-white p-4 shadow-sm transition active:scale-[.98]"><ShieldCheck className="h-6 w-6 text-[#d21e1e]" /><p className="mt-5 text-sm font-black">Customer portal</p><p className="mt-1 text-xs text-black/45">Invoices and reservations</p></Link>
        <Link href="/mobile/support" className="rounded-2xl bg-white p-4 shadow-sm transition active:scale-[.98]"><MessageCircle className="h-6 w-6 text-[#d21e1e]" /><p className="mt-5 text-sm font-black">Support</p><p className="mt-1 text-xs text-black/45">Talk to the team</p></Link>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#d21e1e]">Admin published</p><h2 className="mt-1 text-xl font-black">Latest offers</h2></div><Sparkles className="h-5 w-5 text-[#d21e1e]" /></div>
        <div className="space-y-3">
          {offers.length ? offers.map((offer) => <Link key={offer.id} href="/mobile/offers" className="block rounded-2xl border border-black/5 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h3 className="font-black">{offer.title}</h3><p className="mt-1 text-sm leading-5 text-black/50">{offer.summary || 'Explore the latest ANSHA inventory update.'}</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#d21e1e]" /></div></Link>) : <div className="rounded-2xl bg-white p-5 text-sm text-black/45 shadow-sm">New offers published by the ANSHA admin team will appear here automatically.</div>}
        </div>
      </section>

      <div className="flex items-center gap-3 rounded-2xl border border-[#d21e1e]/10 bg-red-50 p-4 text-sm text-black/60"><Bell className="h-5 w-5 shrink-0 text-[#d21e1e]" /><span>Allow notifications to hear about new stock and offers.</span></div>
    </div>
  );
}

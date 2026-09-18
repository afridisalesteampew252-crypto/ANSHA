'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRight, Tag } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/client';
import type { SiteOffer } from '@/lib/types';

export default function PublicOffersPage() {
  const [rows, setRows] = useState<SiteOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('site_offers')
        .select('*')
        .eq('is_published', true)
        .order('published_at', { ascending: false, nullsFirst: false });
      if (!active) return;
      setRows((data || []) as SiteOffer[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <section className="bg-[#101114] py-11 text-white sm:py-16">
        <div className="container-page">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Deals and offers</span>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Current export offers</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/60 sm:text-base">Published promotions from ANSHA Trading. Enable PWA alerts to hear about new deals first.</p>
        </div>
      </section>
      <div className="container-page py-8 sm:py-12">
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed py-16 text-center">
            <Tag className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <h2 className="mt-4 text-xl font-extrabold">No live offers right now</h2>
            <p className="mt-1 text-sm text-muted-foreground">Check back soon or browse the parts catalog.</p>
            <Link href="/parts" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-accent">Browse parts <ArrowRight className="h-4 w-4" /></Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((row) => (
              <li key={row.id} className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{row.title}</h2>
                    {row.summary ? <p className="mt-2 text-sm text-muted-foreground">{row.summary}</p> : null}
                    {row.published_at ? (
                      <p className="mt-2 text-xs text-muted-foreground">{format(new Date(row.published_at), 'dd MMM yyyy')}</p>
                    ) : null}
                  </div>
                  <Link href={row.href} className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white">
                    View <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

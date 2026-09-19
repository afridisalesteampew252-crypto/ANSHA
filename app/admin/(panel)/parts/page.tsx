'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, Loader2, Pencil, Plus, Search, Trash2, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { STOCK_ORIGINS } from '@/lib/stock';
import { StockOriginBadge } from '@/components/public/stock-origin-badge';
import { conditionLabels } from '@/lib/site-config';
import type { PartWithRelations, StockOrigin, StockStatus } from '@/lib/types';

const statusClass: Record<StockStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  reserved: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sold: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
};

export default function AdminPartsPage() {
  const [parts, setParts] = useState<PartWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState<'all' | StockOrigin>('all');

  const fetchParts = useCallback(async () => {
    setLoading(true);
    let request = supabase.from('parts').select('*, categories(*), part_photos(*), part_compatibility(*)').order('created_at', { ascending: false }).limit(500);
    const term = search.trim().replace(/[,%()]/g, ' ');
    if (term) request = request.or(`name.ilike.%${term}%,part_code.ilike.%${term}%,oem_number.ilike.%${term}%,part_number.ilike.%${term}%`);
    const { data } = await request;
    setParts((data || []) as unknown as PartWithRelations[]);
    setLoading(false);
  }, [search]);

  useEffect(() => { const timer = window.setTimeout(() => void fetchParts(), 250); return () => window.clearTimeout(timer); }, [fetchParts]);

  const filtered = useMemo(() => origin === 'all' ? parts : parts.filter((part) => part.stock_origin === origin), [origin, parts]);

  async function updatePart(id: string, changes: Record<string, unknown>) {
    const { error } = await supabase.from('parts').update(changes).eq('id', id);
    if (error) return window.alert(error.message);
    await fetchParts();
  }

  async function deletePart(part: PartWithRelations) {
    if (!window.confirm(`Delete ${part.name} permanently?`)) return;
    const paths = (part.part_photos || []).map((photo) => photo.storage_path);
    const { error } = await supabase.from('parts').delete().eq('id', part.id);
    if (error) return window.alert(error.message);
    if (paths.length) await supabase.storage.from('part-images').remove(paths);
    await fetchParts();
  }

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Catalog</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Parts inventory</h1>
        <p className="text-sm text-muted-foreground">Manage worldwide stock locations, quantities, publishing, and sold records.</p>
      </div>
      <Button asChild variant="accent"><Link href="/admin/parts/new"><Plus className="h-4 w-4" />Add part</Link></Button>
    </div>
    <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, reference, OEM or part number" className="pl-10" /></div>
    <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Parts stock locations"><button onClick={() => setOrigin('all')} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${origin === 'all' ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'}`}>All stock ({parts.length})</button>{STOCK_ORIGINS.map((item) => <button key={item.value} onClick={() => setOrigin(item.value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${origin === item.value ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'}`}>{item.label} ({parts.filter((part) => part.stock_origin === item.value).length})</button>)}</nav>

    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : filtered.length === 0 ? <Card><CardContent className="py-16 text-center"><Wrench className="mx-auto h-10 w-10 text-muted-foreground/30" /><p className="mt-3 text-sm text-muted-foreground">No parts found.</p></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{filtered.map((part) => {
      const cover = part.part_photos?.find((photo) => photo.is_cover) || part.part_photos?.[0];
      const photoUrl = cover ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/part-images/${cover.storage_path}` : '';
      return <Card key={part.id} className="overflow-hidden"><CardContent className="p-0">
        <div className="flex gap-4 p-4"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary">{photoUrl ? <img src={photoUrl} alt={part.name} className="h-full w-full object-contain p-1" /> : <span className="grid h-full place-items-center"><Wrench className="h-6 w-6 text-muted-foreground/30" /></span>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Badge className={statusClass[part.stock_status || 'available']}>{part.stock_status || 'available'}</Badge>{part.is_published ? <Badge variant="outline">Public</Badge> : <Badge variant="secondary">Draft</Badge>}</div><h2 className="mt-2 truncate font-bold">{part.name}</h2><p className="font-mono text-xs text-muted-foreground">{part.part_code}</p><p className="mt-1 text-xs">{conditionLabels[part.condition]} · Qty {part.quantity} · <span className="inline-flex align-middle"><StockOriginBadge origin={part.stock_origin} compact /></span></p></div></div>
        <div className="grid gap-3 border-t p-4 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">Stock location<select value={part.stock_origin || 'dubai'} onChange={(event) => void updatePart(part.id, { stock_origin: event.target.value })} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground">{STOCK_ORIGINS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="text-xs font-medium text-muted-foreground">Availability<select value={part.stock_status || 'available'} onChange={(event) => void updatePart(part.id, { stock_status: event.target.value })} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option></select></label></div>
        <div className="flex items-center gap-2 border-t p-3"><Button variant="outline" size="sm" onClick={() => void updatePart(part.id, { is_published: !part.is_published })}>{part.is_published ? 'Unpublish' : 'Publish'}</Button><Button asChild variant="ghost" size="icon"><Link href={`/parts/${part.slug}`} target="_blank"><Eye className="h-4 w-4" /></Link></Button><Button asChild variant="ghost" size="icon"><Link href={`/admin/parts/${part.id}`}><Pencil className="h-4 w-4" /></Link></Button><Button variant="ghost" size="icon" className="ml-auto text-destructive" onClick={() => void deletePart(part)}><Trash2 className="h-4 w-4" /></Button></div>
      </CardContent></Card>;
    })}</div>}
  </div>;
}

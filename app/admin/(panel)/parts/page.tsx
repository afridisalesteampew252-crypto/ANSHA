'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Search, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AdminPartCard } from '@/components/admin/admin-part-card';
import { supabase } from '@/lib/supabase/client';
import { isFieldAgentRole } from '@/lib/admin-rbac';
import { STOCK_ORIGINS } from '@/lib/stock';
import type { AdminRole, PartWithRelations, StockOrigin } from '@/lib/types';

export default function AdminPartsPage() {
  const [parts, setParts] = useState<PartWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState<'all' | StockOrigin>('all');
  const [role, setRole] = useState<AdminRole | null>(null);
  const fieldAgent = isFieldAgentRole(role);

  const fetchParts = useCallback(async () => {
    setLoading(true);
    let request = supabase.from('parts').select('*, categories(*), part_photos(*), part_compatibility(*)').order('created_at', { ascending: false }).limit(500);
    const term = search.trim().replace(/[,%()]/g, ' ');
    if (term) request = request.or(`name.ilike.%${term}%,part_code.ilike.%${term}%,oem_number.ilike.%${term}%,part_number.ilike.%${term}%`);
    const { data } = await request;
    setParts((data || []) as unknown as PartWithRelations[]);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
    })();
  }, []);

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
        <h1 className="mt-1 text-2xl font-black tracking-tight">{fieldAgent ? 'Parts stock' : 'Parts inventory'}</h1>
        <p className="text-sm text-muted-foreground">
          {fieldAgent
            ? 'Browse availability and identifiers, then ask the team to hold stock for a customer.'
            : 'Manage worldwide stock locations, quantities, publishing, and sold records.'}
        </p>
      </div>
      {!fieldAgent ? (
        <Button asChild variant="accent"><Link href="/admin/parts/new"><Plus className="h-4 w-4" />Add part</Link></Button>
      ) : null}
    </div>
    <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, reference, OEM or part number" className="pl-10" /></div>
    <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Parts stock locations"><button onClick={() => setOrigin('all')} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${origin === 'all' ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'}`}>All stock ({parts.length})</button>{STOCK_ORIGINS.map((item) => <button key={item.value} onClick={() => setOrigin(item.value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${origin === item.value ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'}`}>{item.label} ({parts.filter((part) => part.stock_origin === item.value).length})</button>)}</nav>

    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : filtered.length === 0 ? <Card><CardContent className="py-16 text-center"><Wrench className="mx-auto h-10 w-10 text-muted-foreground/30" /><p className="mt-3 text-sm text-muted-foreground">No parts found.</p></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{filtered.map((part) => (
      <AdminPartCard
        key={part.id}
        part={part}
        fieldAgent={fieldAgent}
        onUpdate={updatePart}
        onDelete={deletePart}
        stockOriginOptions={STOCK_ORIGINS}
      />
    ))}</div>}
  </div>;
}

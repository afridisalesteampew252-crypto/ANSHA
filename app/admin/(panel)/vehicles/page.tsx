'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Car, CheckCircle2, Edit, Eye, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { matchesQuery } from '@/lib/matches-query';
import { supabase } from '@/lib/supabase/client';
import { STOCK_ORIGINS, stockOriginLabel } from '@/lib/stock';
import { StockOriginBadge } from '@/components/public/stock-origin-badge';
import { LIFECYCLE_STAGES, lifecycleStageLabel, type LifecycleStage } from '@/lib/vehicle-lifecycle';
import { toast } from 'sonner';
import type { StockOrigin, StockStatus, VehicleWithPhotos } from '@/lib/types';

const statusClass: Record<StockStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  reserved: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sold: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
};

const stageClass: Record<LifecycleStage, string> = {
  unassigned: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  auction: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  yard: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  port: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  sold: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
};

export default function AdminVehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<'all' | StockOrigin>('all');
  const [stage, setStage] = useState<'all' | LifecycleStage>('all');

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vehicles').select('*, vehicle_photos(*)').order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setVehicles((data || []) as unknown as VehicleWithPhotos[]);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchVehicles(); }, [fetchVehicles]);

  const filtered = useMemo(
    () => vehicles.filter((vehicle) => {
      const originMatch = origin === 'all' || vehicle.stock_origin === origin;
      const stageMatch = stage === 'all' || (vehicle.lifecycle_stage || 'unassigned') === stage;
      if (!originMatch || !stageMatch) return false;
      return matchesQuery(query, [
        vehicle.title,
        vehicle.make,
        vehicle.model,
        vehicle.variant,
        vehicle.year,
        vehicle.stock_number,
        vehicle.chassis_number,
        vehicle.chassis_code,
        vehicle.engine_code,
        vehicle.transmission,
        vehicle.fuel_type,
        vehicle.color,
        vehicle.location,
        vehicle.slug,
        vehicle.description,
        vehicle.stock_origin,
        stockOriginLabel(vehicle.stock_origin),
        vehicle.stock_status,
        vehicle.lifecycle_stage,
        lifecycleStageLabel(vehicle.lifecycle_stage),
        vehicle.purchase_price,
        vehicle.purchase_currency,
        vehicle.purchase_date,
        vehicle.landed_cost,
        vehicle.currency,
        vehicle.price,
        vehicle.mileage,
        ...(vehicle.search_keywords || []),
        ...(vehicle.destination_markets || []),
        ...(vehicle.shipping_methods || []),
      ]);
    }),
    [origin, query, stage, vehicles]
  );

  async function updateVehicle(id: string, changes: Record<string, unknown>, success: string) {
    const { error } = await supabase.from('vehicles').update(changes).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success(success);
    await fetchVehicles();
  }

  async function setListing(vehicle: VehicleWithPhotos, publish: boolean) {
    const { error } = await supabase.rpc('set_vehicle_public_listing', {
      p_vehicle_id: vehicle.id,
      p_publish: publish,
    });
    if (error) return toast.error(error.message);
    toast.success(publish ? 'Published (available stock only).' : 'Unpublished from website.');
    await fetchVehicles();
  }

  async function removeVehicle(vehicle: VehicleWithPhotos) {
    if (!window.confirm(`Delete "${vehicle.title}" permanently?`)) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', vehicle.id);
    if (error) return toast.error(error.message);
    toast.success('Vehicle deleted.');
    await fetchVehicles();
  }

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><h1 className="text-2xl font-bold tracking-tight">Vehicle inventory</h1><p className="text-sm text-muted-foreground">Manage stock locations, availability, operational lifecycle, and publishing.</p></div>
      <Button asChild><Link href="/admin/vehicles/new"><Plus className="h-4 w-4" />Add vehicle</Link></Button>
    </div>

    <div className="relative max-w-md">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search title, VIN, stock #, make, model, location…"
        className="pl-9"
      />
    </div>

    <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Vehicle stock locations">
      <button onClick={() => setOrigin('all')} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${origin === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}>All stock ({vehicles.length})</button>
      {STOCK_ORIGINS.map((item) => <button key={item.value} onClick={() => setOrigin(item.value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${origin === item.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}>{item.label} ({vehicles.filter((vehicle) => vehicle.stock_origin === item.value).length})</button>)}
    </nav>

    <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Vehicle lifecycle stages">
      <button onClick={() => setStage('all')} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${stage === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}>All stages</button>
      {LIFECYCLE_STAGES.map((item) => <button key={item.value} onClick={() => setStage(item.value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${stage === item.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}>{item.label} ({vehicles.filter((vehicle) => (vehicle.lifecycle_stage || 'unassigned') === item.value).length})</button>)}
    </nav>

    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : filtered.length === 0 ? <div className="rounded-xl border border-dashed py-16 text-center"><Car className="mx-auto h-10 w-10 text-muted-foreground/30" /><p className="mt-3 text-sm text-muted-foreground">{query.trim() ? 'No vehicles match this search.' : 'No vehicles in this stock location.'}</p></div> :
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{filtered.map((vehicle) => {
        const cover = vehicle.vehicle_photos?.find((photo) => photo.is_cover) || vehicle.vehicle_photos?.[0];
        const photoUrl = cover ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-images/${cover.storage_path}` : '';
        return <Card key={vehicle.id} className="overflow-hidden"><CardContent className="p-0">
          <div className="flex gap-4 p-4">
            <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-secondary">{photoUrl ? <img src={photoUrl} alt={vehicle.title} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center"><Car className="h-7 w-7 text-muted-foreground/30" /></span>}</div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Badge className={stageClass[(vehicle.lifecycle_stage || 'unassigned') as LifecycleStage]}>{lifecycleStageLabel(vehicle.lifecycle_stage)}</Badge><Badge className={statusClass[vehicle.stock_status || 'available']}>{(vehicle.stock_status || 'available').replace('_', ' ')}</Badge>{vehicle.is_published ? <Badge variant="outline">Public</Badge> : <Badge variant="secondary">Draft</Badge>}</div><h2 className="mt-2 truncate font-bold">{vehicle.title}</h2><p className="text-xs text-muted-foreground">{vehicle.stock_number || vehicle.chassis_number || vehicle.chassis_code || 'No stock reference'}</p><p className="mt-1"><StockOriginBadge origin={vehicle.stock_origin} compact /></p></div>
          </div>
          <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted-foreground">Stock location<select value={vehicle.stock_origin || 'dubai'} onChange={(event) => void updateVehicle(vehicle.id, { stock_origin: event.target.value }, 'Stock location updated.')} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground">{STOCK_ORIGINS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="text-xs font-medium text-muted-foreground">Availability<select value={vehicle.stock_status || 'available'} onChange={(event) => void updateVehicle(vehicle.id, { stock_status: event.target.value }, event.target.value === 'sold' ? 'Vehicle marked sold.' : 'Availability updated.')} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option></select></label>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t p-3">
            {(vehicle.stock_status || 'available') === 'available' && !vehicle.is_published ? (
              <Button variant="outline" size="sm" onClick={() => void setListing(vehicle, true)}><CheckCircle2 className="h-4 w-4" />Publish when available</Button>
            ) : null}
            {vehicle.is_published ? (
              <Button variant="outline" size="sm" onClick={() => void setListing(vehicle, false)}><CheckCircle2 className="h-4 w-4" />Unpublish</Button>
            ) : null}
            {(vehicle.stock_status === 'reserved' || vehicle.stock_status === 'sold') && vehicle.is_published ? (
              <Button variant="outline" size="sm" onClick={() => void setListing(vehicle, false)}>Unpublish when reserved</Button>
            ) : null}
            <Button asChild variant="ghost" size="sm"><Link href={`/vehicles/${vehicle.slug}`} target="_blank"><Eye className="h-4 w-4" />View</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link href={`/admin/vehicles/${vehicle.id}`}><Edit className="h-4 w-4" />Edit</Link></Button>
            <Button variant="ghost" size="icon" className="ml-auto text-destructive" onClick={() => void removeVehicle(vehicle)} aria-label={`Delete ${vehicle.title}`}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </CardContent></Card>;
      })}</div>}
  </div>;
}

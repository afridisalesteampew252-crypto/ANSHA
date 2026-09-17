'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Car, CheckCircle2, Edit, Eye, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { STOCK_ORIGINS, stockOriginLabel } from '@/lib/stock';
import { toast } from 'sonner';
import type { StockOrigin, StockStatus, VehicleWithPhotos } from '@/lib/types';

const statusClass: Record<StockStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  reserved: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sold: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
};

export default function AdminVehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState<'all' | StockOrigin>('all');

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vehicles').select('*, vehicle_photos(*)').order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setVehicles((data || []) as unknown as VehicleWithPhotos[]);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchVehicles(); }, [fetchVehicles]);

  const filtered = useMemo(() => origin === 'all' ? vehicles : vehicles.filter((vehicle) => vehicle.stock_origin === origin), [origin, vehicles]);

  async function updateVehicle(id: string, changes: Record<string, unknown>, success: string) {
    const { error } = await supabase.from('vehicles').update(changes).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success(success);
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
      <div><h1 className="text-2xl font-bold tracking-tight">Vehicle inventory</h1><p className="text-sm text-muted-foreground">Manage worldwide stock locations, availability, publishing, and sold records.</p></div>
      <Button asChild><Link href="/admin/vehicles/new"><Plus className="h-4 w-4" />Add vehicle</Link></Button>
    </div>

    <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Vehicle stock locations">
      <button onClick={() => setOrigin('all')} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${origin === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}>All stock ({vehicles.length})</button>
      {STOCK_ORIGINS.map((item) => <button key={item.value} onClick={() => setOrigin(item.value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${origin === item.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}>{item.label} ({vehicles.filter((vehicle) => vehicle.stock_origin === item.value).length})</button>)}
    </nav>

    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : filtered.length === 0 ? <div className="rounded-xl border border-dashed py-16 text-center"><Car className="mx-auto h-10 w-10 text-muted-foreground/30" /><p className="mt-3 text-sm text-muted-foreground">No vehicles in this stock location.</p></div> :
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{filtered.map((vehicle) => {
        const cover = vehicle.vehicle_photos?.find((photo) => photo.is_cover) || vehicle.vehicle_photos?.[0];
        const photoUrl = cover ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-images/${cover.storage_path}` : '';
        return <Card key={vehicle.id} className="overflow-hidden"><CardContent className="p-0">
          <div className="flex gap-4 p-4">
            <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-secondary">{photoUrl ? <img src={photoUrl} alt={vehicle.title} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center"><Car className="h-7 w-7 text-muted-foreground/30" /></span>}</div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Badge className={statusClass[vehicle.stock_status || 'available']}>{(vehicle.stock_status || 'available').replace('_', ' ')}</Badge>{vehicle.is_published ? <Badge variant="outline">Public</Badge> : <Badge variant="secondary">Draft</Badge>}</div><h2 className="mt-2 truncate font-bold">{vehicle.title}</h2><p className="text-xs text-muted-foreground">{vehicle.stock_number || vehicle.chassis_number || vehicle.chassis_code || 'No stock reference'}</p><p className="mt-1 text-xs font-medium text-primary">{stockOriginLabel(vehicle.stock_origin)}</p></div>
          </div>
          <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted-foreground">Stock location<select value={vehicle.stock_origin || 'dubai'} onChange={(event) => void updateVehicle(vehicle.id, { stock_origin: event.target.value }, 'Stock location updated.')} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground">{STOCK_ORIGINS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="text-xs font-medium text-muted-foreground">Availability<select value={vehicle.stock_status || 'available'} onChange={(event) => void updateVehicle(vehicle.id, { stock_status: event.target.value }, event.target.value === 'sold' ? 'Vehicle marked sold.' : 'Availability updated.')} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option></select></label>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t p-3">
            <Button variant="outline" size="sm" onClick={() => void updateVehicle(vehicle.id, { is_published: !vehicle.is_published }, vehicle.is_published ? 'Vehicle removed from public stock.' : 'Vehicle published.')}><CheckCircle2 className="h-4 w-4" />{vehicle.is_published ? 'Unpublish' : 'Publish'}</Button>
            <Button asChild variant="ghost" size="sm"><Link href={`/vehicles/${vehicle.slug}`} target="_blank"><Eye className="h-4 w-4" />View</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link href={`/admin/vehicles/${vehicle.id}`}><Edit className="h-4 w-4" />Edit</Link></Button>
            <Button variant="ghost" size="icon" className="ml-auto text-destructive" onClick={() => void removeVehicle(vehicle)} aria-label={`Delete ${vehicle.title}`}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </CardContent></Card>;
      })}</div>}
  </div>;
}

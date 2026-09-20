'use client';
/* eslint-disable @next/next/no-img-element */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Car, Loader2, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminVehicleCard } from '@/components/admin/admin-vehicle-card';
import { matchesQuery } from '@/lib/matches-query';
import { supabase } from '@/lib/supabase/client';
import { isFieldAgentRole } from '@/lib/admin-rbac';
import { STOCK_ORIGINS, stockOriginLabel } from '@/lib/stock';
import {
  isMachineryClass,
  isVehicleClass,
  VEHICLE_CLASSES,
  vehicleClassLabel,
  type VehicleClass,
} from '@/lib/vehicle-class';
import { LIFECYCLE_STAGES, lifecycleStageLabel, type LifecycleStage } from '@/lib/vehicle-lifecycle';
import { toast } from 'sonner';
import type { AdminRole, StockOrigin, VehicleWithPhotos } from '@/lib/types';

type ClassFilter = 'all' | 'machinery' | VehicleClass;

function parseClassFilter(raw: string | null): ClassFilter {
  if (!raw || raw === 'all') return 'all';
  if (raw === 'machinery') return 'machinery';
  if (isVehicleClass(raw)) return raw;
  return 'all';
}

export default function AdminVehiclesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <AdminVehiclesPageInner />
    </Suspense>
  );
}

function AdminVehiclesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vehicles, setVehicles] = useState<VehicleWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<'all' | StockOrigin>('all');
  const [vehicleClass, setVehicleClass] = useState<ClassFilter>(() => parseClassFilter(searchParams.get('class')));
  const [stage, setStage] = useState<'all' | LifecycleStage>('all');
  const [role, setRole] = useState<AdminRole | null>(null);
  const fieldAgent = isFieldAgentRole(role);
  const machineryFocus = vehicleClass === 'machinery';

  useEffect(() => {
    setVehicleClass(parseClassFilter(searchParams.get('class')));
  }, [searchParams]);

  const setClassFilter = (next: ClassFilter) => {
    setVehicleClass(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('class');
    else params.set('class', next);
    const qs = params.toString();
    router.replace(qs ? `/admin/vehicles?${qs}` : '/admin/vehicles', { scroll: false });
  };

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vehicles').select('*, vehicle_photos(*)').order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setVehicles((data || []) as unknown as VehicleWithPhotos[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
    })();
  }, []);

  useEffect(() => { void fetchVehicles(); }, [fetchVehicles]);

  const filtered = useMemo(
    () => vehicles.filter((vehicle) => {
      const originMatch = origin === 'all' || vehicle.stock_origin === origin;
      const stageMatch = stage === 'all' || (vehicle.lifecycle_stage || 'unassigned') === stage;
      const classValue = vehicle.vehicle_class || 'passenger';
      const classMatch =
        vehicleClass === 'all'
          || (vehicleClass === 'machinery' ? isMachineryClass(classValue) : classValue === vehicleClass);
      if (!originMatch || !stageMatch || !classMatch) return false;
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
        vehicle.vehicle_class,
        vehicleClassLabel(vehicle.vehicle_class),
        vehicle.equipment_category,
        vehicle.operating_hours,
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
    [origin, query, stage, vehicleClass, vehicles]
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

  const newHref = machineryFocus
    ? '/admin/vehicles/new?class=heavy_machinery'
    : '/admin/vehicles/new';

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Catalog</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">
          {machineryFocus
            ? (fieldAgent ? 'Machinery & truck stock' : 'Machinery & trucks')
            : (fieldAgent ? 'Vehicle stock' : 'Vehicle inventory')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {machineryFocus
            ? (fieldAgent
              ? 'Browse excavators, loaders, trucks, and heavy equipment — then reserve available units.'
              : 'Manage commercial trucks and heavy machinery stock, availability, lifecycle, and publishing.')
            : (fieldAgent
              ? 'Browse stock status and identifiers, then reserve an available vehicle for a customer.'
              : 'Manage stock locations, availability, operational lifecycle, and publishing.')}
        </p>
      </div>
      {!fieldAgent ? (
        <Button asChild variant="accent"><Link href={newHref}><Plus className="h-4 w-4" />{machineryFocus ? 'Add machinery' : 'Add vehicle'}</Link></Button>
      ) : null}
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

    <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Vehicle class">
      <button type="button" onClick={() => setClassFilter('all')} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${vehicleClass === 'all' ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'}`}>All classes ({vehicles.length})</button>
      <button type="button" onClick={() => setClassFilter('machinery')} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${vehicleClass === 'machinery' ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'}`}>Machinery & trucks ({vehicles.filter((v) => isMachineryClass(v.vehicle_class || 'passenger')).length})</button>
      {VEHICLE_CLASSES.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => setClassFilter(item.value)}
          className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${vehicleClass === item.value ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'}`}
        >
          {item.label} ({vehicles.filter((v) => (v.vehicle_class || 'passenger') === item.value).length})
        </button>
      ))}
    </nav>

    <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Vehicle stock locations">
      <button onClick={() => setOrigin('all')} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${origin === 'all' ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'}`}>All stock ({vehicles.length})</button>
      {STOCK_ORIGINS.map((item) => <button key={item.value} onClick={() => setOrigin(item.value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${origin === item.value ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'}`}>{item.label} ({vehicles.filter((vehicle) => vehicle.stock_origin === item.value).length})</button>)}
    </nav>

    {!fieldAgent ? (
      <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Vehicle lifecycle stages">
        <button onClick={() => setStage('all')} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${stage === 'all' ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'}`}>All stages</button>
        {LIFECYCLE_STAGES.map((item) => <button key={item.value} onClick={() => setStage(item.value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${stage === item.value ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'}`}>{item.label} ({vehicles.filter((vehicle) => (vehicle.lifecycle_stage || 'unassigned') === item.value).length})</button>)}
      </nav>
    ) : null}

    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : filtered.length === 0 ? <div className="rounded-xl border border-dashed py-16 text-center"><Car className="mx-auto h-10 w-10 text-muted-foreground/30" /><p className="mt-3 text-sm text-muted-foreground">{query.trim() ? 'No vehicles match this search.' : 'No vehicles in this filter.'}</p></div> :
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{filtered.map((vehicle) => (
        <AdminVehicleCard
          key={vehicle.id}
          vehicle={vehicle}
          fieldAgent={fieldAgent}
          onUpdate={updateVehicle}
          onSetListing={setListing}
          onDelete={removeVehicle}
          stockOriginOptions={STOCK_ORIGINS}
        />
      ))}</div>}
  </div>;
}

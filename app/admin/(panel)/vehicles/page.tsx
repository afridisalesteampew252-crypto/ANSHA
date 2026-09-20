'use client';
/* eslint-disable @next/next/no-img-element */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Car, ChevronDown, Filter, Loader2, Plus, Search, Ship } from 'lucide-react';
import { toast } from 'sonner';
import { AdminVehicleCard } from '@/components/admin/admin-vehicle-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  deriveVehicleSalesStatus,
  exportShipmentStatusLabel,
  VEHICLE_SALES_STATUSES,
  VEHICLE_SALES_STATUS_LABELS,
  type VehicleSalesStatus,
} from '@/lib/vehicle-sales-status';
import type { AdminRole, StockOrigin, VehicleWithPhotos } from '@/lib/types';
import { cn } from '@/lib/utils';

type ClassFilter = 'all' | 'machinery' | VehicleClass;
type AgentOption = { id: string; label: string };

function parseClassFilter(raw: string | null): ClassFilter {
  if (!raw || raw === 'all') return 'all';
  if (raw === 'machinery') return 'machinery';
  if (isVehicleClass(raw)) return raw;
  return 'all';
}

const CHIP =
  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm sm:px-4 sm:py-2';

export default function AdminVehiclesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AdminVehiclesPageInner />
    </Suspense>
  );
}

function AdminVehiclesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vehicles, setVehicles] = useState<VehicleWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<'all' | StockOrigin>('all');
  const [vehicleClass, setVehicleClass] = useState<ClassFilter>(() =>
    parseClassFilter(searchParams.get('class'))
  );
  const [stage, setStage] = useState<'all' | LifecycleStage>('all');
  const [salesStatus, setSalesStatus] = useState<'all' | VehicleSalesStatus>('all');
  const [stockStatus, setStockStatus] = useState<'all' | 'available' | 'reserved' | 'sold'>('all');
  const [agentFilter, setAgentFilter] = useState<'all' | string>('all');
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [shipmentByVehicle, setShipmentByVehicle] = useState<Record<string, string>>({});
  const [invoiceByVehicle, setInvoiceByVehicle] = useState<Record<string, string>>({});
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
    const { data, error } = await supabase
      .from('vehicles')
      .select('*, vehicle_photos(*)')
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    const list = (data || []) as unknown as VehicleWithPhotos[];
    setVehicles(list);

    const vehicleIds = list.map((v) => v.id);
    const reservedByIds = Array.from(new Set(list.map((v) => v.reserved_by).filter(Boolean))) as string[];

    const [agentRes, linkRes, itemRes] = await Promise.all([
      supabase
        .from('admin_profiles')
        .select('id,full_name,email,role')
        .in('role', ['sales', 'freelancer', 'manager', 'admin', 'staff'])
        .eq('is_active', true)
        .order('full_name')
        .limit(300),
      vehicleIds.length
        ? supabase
            .from('export_shipment_vehicles')
            .select('vehicle_id, export_shipments(status,created_at)')
            .in('vehicle_id', vehicleIds)
        : Promise.resolve({ data: [], error: null }),
      vehicleIds.length
        ? supabase
            .from('invoice_items')
            .select('vehicle_id, invoices(status,created_at,document_type)')
            .in('vehicle_id', vehicleIds)
            .not('vehicle_id', 'is', null)
            .limit(800)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const nameMap: Record<string, string> = {};
    const agentOpts: AgentOption[] = [];
    for (const row of agentRes.data || []) {
      const label = row.full_name || row.email || row.id.slice(0, 8);
      nameMap[row.id] = label;
      if (row.role === 'sales' || row.role === 'freelancer') {
        agentOpts.push({ id: row.id, label });
      }
    }
    for (const id of reservedByIds) {
      if (!nameMap[id]) nameMap[id] = id.slice(0, 8);
    }
    setAgentNames(nameMap);
    setAgents(agentOpts);

    const shipMap: Record<string, { status: string; created: string }> = {};
    for (const row of linkRes.data || []) {
      const ship = Array.isArray(row.export_shipments) ? row.export_shipments[0] : row.export_shipments;
      if (!ship?.status) continue;
      const prev = shipMap[row.vehicle_id];
      if (!prev || String(ship.created_at) > prev.created) {
        shipMap[row.vehicle_id] = { status: ship.status, created: String(ship.created_at || '') };
      }
    }
    setShipmentByVehicle(
      Object.fromEntries(Object.entries(shipMap).map(([id, value]) => [id, value.status]))
    );

    const invMap: Record<string, { status: string; created: string }> = {};
    for (const row of itemRes.data || []) {
      if (!row.vehicle_id) continue;
      const inv = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
      if (!inv?.status) continue;
      const prev = invMap[row.vehicle_id];
      if (!prev || String(inv.created_at) > prev.created) {
        invMap[row.vehicle_id] = { status: inv.status, created: String(inv.created_at || '') };
      }
    }
    setInvoiceByVehicle(
      Object.fromEntries(Object.entries(invMap).map(([id, value]) => [id, value.status]))
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data: prof } = await supabase
        .from('admin_profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      setRole((prof?.role as AdminRole) || null);
    })();
  }, []);

  useEffect(() => {
    void fetchVehicles();
  }, [fetchVehicles]);

  const salesStatusOf = useCallback(
    (vehicle: VehicleWithPhotos): VehicleSalesStatus =>
      deriveVehicleSalesStatus({
        stockStatus: vehicle.stock_status,
        invoiceStatus: invoiceByVehicle[vehicle.id],
        shipmentStatus: shipmentByVehicle[vehicle.id],
      }),
    [invoiceByVehicle, shipmentByVehicle]
  );

  const summary = useMemo(() => {
    const available = vehicles.filter((v) => v.stock_status === 'available').length;
    const reserved = vehicles.filter((v) => v.stock_status === 'reserved').length;
    const sold = vehicles.filter((v) => v.stock_status === 'sold').length;
    const booked = vehicles.filter((v) => {
      const s = shipmentByVehicle[v.id];
      return s === 'booked' || s === 'loaded';
    }).length;
    const shipped = vehicles.filter((v) => shipmentByVehicle[v.id] === 'sailed').length;
    return { available, reserved, sold, booked, shipped, total: vehicles.length };
  }, [shipmentByVehicle, vehicles]);

  const filtered = useMemo(
    () =>
      vehicles.filter((vehicle) => {
        const originMatch = origin === 'all' || vehicle.stock_origin === origin;
        const stageMatch = stage === 'all' || (vehicle.lifecycle_stage || 'unassigned') === stage;
        const classValue = vehicle.vehicle_class || 'passenger';
        const classMatch =
          vehicleClass === 'all' ||
          (vehicleClass === 'machinery'
            ? isMachineryClass(classValue)
            : classValue === vehicleClass);
        const statusMatch = salesStatus === 'all' || salesStatusOf(vehicle) === salesStatus;
        const stockMatch = stockStatus === 'all' || vehicle.stock_status === stockStatus;
        const agentMatch = agentFilter === 'all' || vehicle.reserved_by === agentFilter;
        if (!originMatch || !stageMatch || !classMatch || !statusMatch || !stockMatch || !agentMatch)
          return false;
        const agentLabel = vehicle.reserved_by ? agentNames[vehicle.reserved_by] : '';
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
          vehicle.reservation_requester_name,
          vehicle.reservation_requester_role,
          agentLabel,
          VEHICLE_SALES_STATUS_LABELS[salesStatusOf(vehicle)],
          ...(vehicle.search_keywords || []),
          ...(vehicle.destination_markets || []),
          ...(vehicle.shipping_methods || []),
        ]);
      }),
    [
      agentFilter,
      agentNames,
      origin,
      query,
      salesStatus,
      salesStatusOf,
      stage,
      stockStatus,
      vehicleClass,
      vehicles,
    ]
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

  const newHref = machineryFocus ? '/admin/vehicles/new?class=heavy_machinery' : '/admin/vehicles/new';

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Catalog</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">
            {machineryFocus
              ? fieldAgent
                ? 'Machinery & truck stock'
                : 'Machinery & trucks'
              : fieldAgent
                ? 'Vehicle stock'
                : 'Vehicle inventory'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Dense stock list with dual status, filters, and sales assignment — aligned with stock ops.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!fieldAgent ? (
            <>
              <Button asChild variant="outline">
                <Link href="/admin/stock">
                  <Ship className="h-4 w-4" />
                  Stock ops
                </Link>
              </Button>
              <Button asChild variant="accent">
                <Link href={newHref}>
                  <Plus className="h-4 w-4" />
                  {machineryFocus ? 'Add machinery' : 'Add vehicle'}
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild variant="accent">
              <Link href="/admin/reservations">Reserve</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryChip label="Total" value={summary.total} active={stockStatus === 'all' && salesStatus === 'all'} onClick={() => { setStockStatus('all'); setSalesStatus('all'); }} />
        <SummaryChip label="Available" value={summary.available} tone="orange" active={stockStatus === 'available'} onClick={() => setStockStatus(stockStatus === 'available' ? 'all' : 'available')} />
        <SummaryChip label="Reserved" value={summary.reserved} tone="amber" active={stockStatus === 'reserved'} onClick={() => setStockStatus(stockStatus === 'reserved' ? 'all' : 'reserved')} />
        <SummaryChip label="Sold" value={summary.sold} tone="zinc" active={stockStatus === 'sold'} onClick={() => setStockStatus(stockStatus === 'sold' ? 'all' : 'sold')} />
        <SummaryChip label="Booked" value={summary.booked} tone="blue" active={salesStatus === 'booked'} onClick={() => setSalesStatus(salesStatus === 'booked' ? 'all' : 'booked')} />
        <SummaryChip label="Shipped" value={summary.shipped} tone="green" active={salesStatus === 'shipped'} onClick={() => setSalesStatus(salesStatus === 'shipped' ? 'all' : 'shipped')} />
      </div>

      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4" />
              Search filters
            </CardTitle>
            <CollapsibleTrigger asChild>
              <Button type="button" size="sm" variant="ghost">
                <ChevronDown className={cn('h-4 w-4 transition', filtersOpen && 'rotate-180')} />
                {filtersOpen ? 'Hide' : 'Show'}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div className="space-y-1 sm:col-span-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Title, VIN, stock #, make, model, agent…"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Sales / fulfillment</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={salesStatus}
                  onChange={(e) => setSalesStatus(e.target.value as 'all' | VehicleSalesStatus)}
                >
                  <option value="all">All statuses</option>
                  {VEHICLE_SALES_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {VEHICLE_SALES_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Stock status</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={stockStatus}
                  onChange={(e) => setStockStatus(e.target.value as typeof stockStatus)}
                >
                  <option value="all">All</option>
                  <option value="available">Available</option>
                  <option value="reserved">Reserved</option>
                  <option value="sold">Sold</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Origin</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value as 'all' | StockOrigin)}
                >
                  <option value="all">All origins</option>
                  {STOCK_ORIGINS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Class</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={vehicleClass}
                  onChange={(e) => setClassFilter(parseClassFilter(e.target.value))}
                >
                  <option value="all">All classes</option>
                  <option value="machinery">Machinery & trucks</option>
                  {VEHICLE_CLASSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              {!fieldAgent ? (
                <>
                  <div className="space-y-1">
                    <Label>Sales agent</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={agentFilter}
                      onChange={(e) => setAgentFilter(e.target.value)}
                    >
                      <option value="all">All agents</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Lifecycle</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={stage}
                      onChange={(e) => setStage(e.target.value as 'all' | LifecycleStage)}
                    >
                      <option value="all">All stages</option>
                      {LIFECYCLE_STAGES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : null}
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setQuery('');
                    setOrigin('all');
                    setSalesStatus('all');
                    setStockStatus('all');
                    setAgentFilter('all');
                    setStage('all');
                    setClassFilter('all');
                  }}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1" aria-label="Quick class filters">
        <button
          type="button"
          onClick={() => setClassFilter('all')}
          className={cn(CHIP, vehicleClass === 'all' ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40')}
        >
          All classes
        </button>
        <button
          type="button"
          onClick={() => setClassFilter('machinery')}
          className={cn(CHIP, vehicleClass === 'machinery' ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40')}
        >
          Machinery & trucks
        </button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
          <CardTitle className="text-base">
            Stock list
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {filtered.length} of {vehicles.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-2 sm:p-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <Car className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                {query.trim() ? 'No vehicles match this search.' : 'No vehicles in this filter.'}
              </p>
            </div>
          ) : (
            filtered.map((vehicle) => (
              <AdminVehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                fieldAgent={fieldAgent}
                reservedByLabel={vehicle.reserved_by ? agentNames[vehicle.reserved_by] : null}
                salesStatusLabel={VEHICLE_SALES_STATUS_LABELS[salesStatusOf(vehicle)]}
                shipmentStatusLabel={
                  shipmentByVehicle[vehicle.id]
                    ? exportShipmentStatusLabel(shipmentByVehicle[vehicle.id])
                    : null
                }
                onUpdate={updateVehicle}
                onSetListing={setListing}
                onDelete={removeVehicle}
                stockOriginOptions={STOCK_ORIGINS}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone = 'sky',
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone?: 'sky' | 'orange' | 'amber' | 'zinc' | 'blue' | 'green';
  active?: boolean;
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    sky: 'border-sky-200 bg-sky-50 text-sky-950',
    orange: 'border-orange-200 bg-orange-50 text-orange-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    zinc: 'border-zinc-300 bg-zinc-100 text-zinc-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-950',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-2 text-left transition',
        tones[tone],
        active && 'ring-2 ring-accent ring-offset-1'
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xl font-black tabular-nums">{value}</p>
    </button>
  );
}

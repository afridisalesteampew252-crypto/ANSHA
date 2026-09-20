'use client';
/* eslint-disable @next/next/no-img-element */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Car, ChevronDown, Download, Filter, FileSpreadsheet, Gavel, Loader2, Plus, Search, Ship } from 'lucide-react';
import { toast } from 'sonner';
import { AdminVehicleCard } from '@/components/admin/admin-vehicle-card';
import { BulkReserveDialog } from '@/components/admin/bulk-reserve-dialog';
import { ChangeRequesterDialog } from '@/components/admin/change-requester-dialog';
import { ClaimCommissionDialog } from '@/components/admin/claim-commission-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { downloadRowsAsXlsx } from '@/lib/export-excel';
import { matchesQuery } from '@/lib/matches-query';
import { supabase } from '@/lib/supabase/client';
import { isFieldAgentRole } from '@/lib/admin-rbac';
import { STOCK_ORIGINS, isAuctionStockPool, stockOriginLabel, stockPoolLabel, type StockPool } from '@/lib/stock';
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

export function AdminVehiclesInventoryPage({ stockPool }: { stockPool: StockPool }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AdminVehiclesInventoryInner stockPool={stockPool} />
    </Suspense>
  );
}

function AdminVehiclesInventoryInner({ stockPool }: { stockPool: StockPool }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAuction = isAuctionStockPool(stockPool);
  const listBase = isAuction ? '/admin/auction-stock' : '/admin/vehicles';
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
  const [allowedOrigins, setAllowedOrigins] = useState<string[] | null>(null);
  const [claimTarget, setClaimTarget] = useState<VehicleWithPhotos | null>(null);
  const [requesterTarget, setRequesterTarget] = useState<VehicleWithPhotos | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const fieldAgent = isFieldAgentRole(role);
  const isManager = role === 'manager';
  const machineryFocus = vehicleClass === 'machinery';

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setFiltersOpen(false);
    }
  }, []);

  useEffect(() => {
    setVehicleClass(parseClassFilter(searchParams.get('class')));
  }, [searchParams]);

  const setClassFilter = (next: ClassFilter) => {
    setVehicleClass(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('class');
    else params.set('class', next);
    const qs = params.toString();
    router.replace(qs ? `${listBase}?${qs}` : listBase, { scroll: false });
  };

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vehicles')
      .select('*, vehicle_photos(*)')
      .eq('stock_pool', stockPool)
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
  }, [stockPool]);

  useEffect(() => {
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data: prof } = await supabase
        .from('admin_profiles')
        .select('role,allowed_stock_origins')
        .eq('id', session.user.id)
        .maybeSingle();
      setRole((prof?.role as AdminRole) || null);
      setAllowedOrigins(
        prof?.role === 'manager'
          ? Array.isArray(prof.allowed_stock_origins)
            ? (prof.allowed_stock_origins as string[])
            : []
          : null
      );
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
          vehicle.stock_pool,
          stockPoolLabel(vehicle.stock_pool),
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

  const availableFiltered = useMemo(
    () => filtered.filter((v) => v.stock_status === 'available'),
    [filtered]
  );
  const selectedVehicleIds = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const vehicleLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of vehicles) {
      map[v.id] =
        v.stock_number || v.chassis_number || v.title || v.id.slice(0, 8);
    }
    return map;
  }, [vehicles]);

  function toggleSelected(id: string, next: boolean) {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function selectAllAvailable() {
    setSelectedIds(new Set(availableFiltered.map((v) => v.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function exportFilteredVehicles() {
    if (filtered.length === 0) {
      toast.error('No vehicles match the current filters.');
      return;
    }
    setExporting(true);
    try {
      const customerIds = Array.from(
        new Set(filtered.map((v) => v.reserved_customer_id).filter(Boolean))
      ) as string[];
      const customerNames: Record<string, string> = {};
      if (customerIds.length) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id,full_name,customer_code')
          .in('id', customerIds);
        for (const row of customers || []) {
          customerNames[row.id] = row.full_name || row.customer_code || row.id.slice(0, 8);
        }
      }

      const poolSlug = isAuction ? 'auction-stock' : 'vehicles';
      await downloadRowsAsXlsx({
        filename: `ansha-${poolSlug}`,
        sheetName: isAuction ? 'Auction stock' : 'Vehicles',
        columns: [
          { header: 'Stock number', key: 'stock_number', width: 16 },
          { header: 'Title', key: 'title', width: 36 },
          { header: 'Chassis', key: 'chassis_number', width: 20 },
          { header: 'Chassis code', key: 'chassis_code', width: 14 },
          { header: 'Make', key: 'make', width: 14 },
          { header: 'Model', key: 'model', width: 16 },
          { header: 'Year', key: 'year', width: 8 },
          { header: 'Class', key: 'vehicle_class', width: 16 },
          { header: 'Origin', key: 'origin', width: 16 },
          { header: 'Location', key: 'location', width: 18 },
          { header: 'Stock status', key: 'stock_status', width: 12 },
          { header: 'Sales status', key: 'sales_status', width: 14 },
          { header: 'Shipment status', key: 'shipment_status', width: 14 },
          { header: 'Price', key: 'price', width: 12 },
          { header: 'Price FOB', key: 'price_fob', width: 12 },
          { header: 'Currency', key: 'currency', width: 10 },
          { header: 'Purchase price', key: 'purchase_price', width: 14 },
          { header: 'Purchase currency', key: 'purchase_currency', width: 12 },
          { header: 'Purchase date', key: 'purchase_date', width: 12 },
          { header: 'Reserved customer', key: 'reserved_customer', width: 22 },
          { header: 'Requester name', key: 'requester_name', width: 18 },
          { header: 'Requester role', key: 'requester_role', width: 12 },
          { header: 'Agent', key: 'agent', width: 18 },
          { header: 'Pool', key: 'pool', width: 18 },
          { header: 'Published', key: 'published', width: 10 },
          { header: 'Lifecycle', key: 'lifecycle', width: 16 },
          { header: 'Created', key: 'created_at', width: 12 },
          { header: 'Sold at', key: 'sold_at', width: 12 },
        ],
        rows: filtered.map((vehicle) => {
          const ship = shipmentByVehicle[vehicle.id];
          return {
            stock_number: vehicle.stock_number,
            title: vehicle.title,
            chassis_number: vehicle.chassis_number,
            chassis_code: vehicle.chassis_code,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            vehicle_class: vehicleClassLabel(vehicle.vehicle_class),
            origin: stockOriginLabel(vehicle.stock_origin),
            location: vehicle.location,
            stock_status: vehicle.stock_status,
            sales_status: VEHICLE_SALES_STATUS_LABELS[salesStatusOf(vehicle)],
            shipment_status: ship ? exportShipmentStatusLabel(ship) : null,
            price: vehicle.price,
            price_fob: vehicle.price_fob,
            currency: vehicle.currency,
            purchase_price: vehicle.purchase_price,
            purchase_currency: vehicle.purchase_currency,
            purchase_date: vehicle.purchase_date,
            reserved_customer: vehicle.reserved_customer_id
              ? customerNames[vehicle.reserved_customer_id] || vehicle.reserved_customer_id
              : null,
            requester_name: vehicle.reservation_requester_name,
            requester_role: vehicle.reservation_requester_role,
            agent: vehicle.reserved_by ? agentNames[vehicle.reserved_by] || vehicle.reserved_by : null,
            pool: stockPoolLabel(vehicle.stock_pool),
            published: vehicle.is_published ? 'Yes' : 'No',
            lifecycle: lifecycleStageLabel(vehicle.lifecycle_stage),
            created_at: vehicle.created_at ? vehicle.created_at.slice(0, 10) : null,
            sold_at: vehicle.sold_at ? vehicle.sold_at.slice(0, 10) : null,
          };
        }),
      });
      toast.success(`Exported ${filtered.length} vehicle${filtered.length === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Excel export failed.');
    } finally {
      setExporting(false);
    }
  }

  async function updateVehicle(id: string, changes: Record<string, unknown>, success: string) {
    const { error } = await supabase.from('vehicles').update(changes).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(success);
    await fetchVehicles();
  }

  async function transferStockPool(vehicle: VehicleWithPhotos, nextPool: StockPool) {
    const toOwned = nextPool === 'owned';
    const label = toOwned ? 'owned inventory' : 'auction stock';
    if (
      !window.confirm(
        toOwned
          ? `Transfer "${vehicle.title}" into owned Vehicles inventory?`
          : `Move "${vehicle.title}" to Auction stock (third-party)?`
      )
    ) {
      return;
    }
    const changes: Record<string, unknown> = { stock_pool: nextPool };
    if (toOwned && !vehicle.purchase_date) {
      changes.purchase_date = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase.from('vehicles').update(changes).eq('id', vehicle.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Moved to ${label}.`);
    await fetchVehicles();
  }

  async function setListing(vehicle: VehicleWithPhotos, publish: boolean) {
    const { error } = await supabase.rpc('set_vehicle_public_listing', {
      p_vehicle_id: vehicle.id,
      p_publish: publish,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(publish ? 'Published (available stock only).' : 'Unpublished from website.');
    await fetchVehicles();
  }

  async function removeVehicle(vehicle: VehicleWithPhotos) {
    if (!window.confirm(`Delete "${vehicle.title}" permanently?`)) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', vehicle.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Vehicle deleted.');
    await fetchVehicles();
  }

  async function makeAvailable(vehicle: VehicleWithPhotos) {
    if (
      !window.confirm(
        `Make "${vehicle.title}" available again? This clears the reservation and linked SOA.`
      )
    ) {
      return;
    }
    await updateVehicle(vehicle.id, { stock_status: 'available' }, 'Vehicle marked available.');
  }

  async function submitClaim(payload: { amount: number; currency: string; notes: string }) {
    if (!claimTarget) return;
    setActionBusy(true);
    const { error } = await supabase.rpc('claim_stock_commission', {
      p_amount: payload.amount,
      p_currency: payload.currency,
      p_vehicle_id: claimTarget.id,
      p_part_id: null,
      p_invoice_id: null,
      p_notes: payload.notes || null,
      p_claimant_id: null,
    });
    setActionBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Commission claim submitted.');
    setClaimTarget(null);
  }

  async function submitRequester(payload: {
    name: string;
    role: 'sales' | 'freelancer' | 'manager' | 'admin' | null;
  }) {
    if (!requesterTarget) return;
    setActionBusy(true);
    const { error } = await supabase
      .from('vehicles')
      .update({
        reservation_requester_name: payload.name,
        reservation_requester_role: payload.role,
      })
      .eq('id', requesterTarget.id);
    setActionBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Requester updated.');
    setRequesterTarget(null);
    await fetchVehicles();
  }

  const newHref = isAuction
    ? machineryFocus
      ? '/admin/vehicles/new?pool=auction&class=heavy_machinery'
      : '/admin/vehicles/new?pool=auction'
    : machineryFocus
      ? '/admin/vehicles/new?class=heavy_machinery'
      : '/admin/vehicles/new';

  const heading = isAuction
    ? machineryFocus
      ? 'Auction machinery & trucks'
      : 'Auction stock'
    : machineryFocus
      ? fieldAgent
        ? 'Machinery & truck stock'
        : 'Machinery & trucks'
      : fieldAgent
        ? 'Vehicle stock'
        : 'Vehicle inventory';

  const subtitle = isAuction
    ? 'Third-party auction / yard units — not yet purchased into ANSHA inventory. Transfer to inventory when bought.'
    : 'Owned / purchased units only. Japan auction listings live under Auction stock.';

  const originOptions =
    isManager && allowedOrigins
      ? STOCK_ORIGINS.filter((item) => allowedOrigins.includes(item.value))
      : STOCK_ORIGINS;

  return (
    <div className="space-y-5">
      {isManager ? (
        <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm">
          {allowedOrigins && allowedOrigins.length > 0 ? (
            <p>
              Location scope: {originOptions.map((o) => o.label).join(', ')}. Other stock origins are hidden by RLS.
            </p>
          ) : (
            <p className="text-amber-800 dark:text-amber-200">
              No stock locations assigned. Ask an admin to set Manager stock locations under Users — inventory will stay empty until then.
            </p>
          )}
        </div>
      ) : null}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Catalog</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{heading}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!fieldAgent ? (
            <>
              {isAuction ? (
                <Button asChild variant="outline">
                  <Link href="/admin/vehicles">
                    <Car className="h-4 w-4" />
                    Owned vehicles
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline">
                    <Link href="/admin/auction-stock">
                      <Gavel className="h-4 w-4" />
                      Auction stock
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/admin/stock">
                      <Ship className="h-4 w-4" />
                      Stock ops
                    </Link>
                  </Button>
                </>
              )}
              <Button asChild variant="accent">
                <Link href={newHref}>
                  <Plus className="h-4 w-4" />
                  {isAuction
                    ? machineryFocus
                      ? 'Add auction unit'
                      : 'Add auction stock'
                    : machineryFocus
                      ? 'Add machinery'
                      : 'Add vehicle'}
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
              <Button type="button" size="sm" variant="ghost" className="min-h-10 gap-1.5">
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
                  {originOptions.map((item) => (
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
              <div className="flex flex-wrap items-end gap-2">
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
                <Button
                  type="button"
                  variant="outline"
                  disabled={exporting || filtered.length === 0}
                  onClick={() => void exportFilteredVehicles()}
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  Export Excel
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
        <CardHeader className="flex-row flex-wrap items-center justify-between space-y-0 gap-3 py-3">
          <CardTitle className="text-base">
            Stock list
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {filtered.length} of {vehicles.length}
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {availableFiltered.length > 0 ? (
              <>
                <Button type="button" size="sm" variant="outline" onClick={selectAllAvailable}>
                  Select available ({availableFiltered.length})
                </Button>
                {selectedIds.size > 0 ? (
                  <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                    Clear
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={exporting || filtered.length === 0 || loading}
              onClick={() => void exportFilteredVehicles()}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent className={cn('space-y-2 p-2 sm:p-4', selectedIds.size > 0 && 'pb-24')}>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <Car className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                {query.trim()
                  ? 'No vehicles match this search.'
                  : isAuction
                    ? 'No auction stock in this filter.'
                    : 'No owned vehicles in this filter.'}
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
                selected={selectedIds.has(vehicle.id)}
                onSelectedChange={(next) => toggleSelected(vehicle.id, next)}
                onUpdate={updateVehicle}
                onSetListing={setListing}
                onDelete={isManager ? undefined : removeVehicle}
                onTransferPool={isManager ? undefined : transferStockPool}
                onMakeAvailable={makeAvailable}
                onChangeRequester={fieldAgent ? undefined : setRequesterTarget}
                onClaimCommission={setClaimTarget}
                stockOriginOptions={originOptions}
              />
            ))
          )}
        </CardContent>
      </Card>

      {selectedIds.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {selectedIds.size} vehicle{selectedIds.size === 1 ? '' : 's'} selected
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={clearSelection}>
                Clear
              </Button>
              <Button type="button" variant="accent" onClick={() => setBulkOpen(true)}>
                Bulk reserve
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <BulkReserveDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        vehicleIds={selectedVehicleIds}
        partIds={[]}
        vehicleLabels={vehicleLabels}
        onCompleted={() => {
          clearSelection();
          void fetchVehicles();
        }}
      />

      <ClaimCommissionDialog
        open={!!claimTarget}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setClaimTarget(null);
        }}
        title={claimTarget?.title || ''}
        defaultCurrency={claimTarget?.currency}
        busy={actionBusy}
        onSubmit={submitClaim}
      />
      <ChangeRequesterDialog
        open={!!requesterTarget}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setRequesterTarget(null);
        }}
        title={requesterTarget?.title || ''}
        defaultName={requesterTarget?.reservation_requester_name}
        defaultRole={requesterTarget?.reservation_requester_role}
        busy={actionBusy}
        onSubmit={submitRequester}
      />
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

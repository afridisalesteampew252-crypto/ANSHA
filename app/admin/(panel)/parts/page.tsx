'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Filter, Loader2, Package, Plus, Search, Ship, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPartCard } from '@/components/admin/admin-part-card';
import { BulkReserveDialog } from '@/components/admin/bulk-reserve-dialog';
import { ChangeRequesterDialog } from '@/components/admin/change-requester-dialog';
import { ClaimCommissionDialog } from '@/components/admin/claim-commission-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isFieldAgentRole } from '@/lib/admin-rbac';
import { matchesQuery } from '@/lib/matches-query';
import {
  derivePartSalesStatus,
  PART_SALES_STATUS_LABELS,
  PART_SALES_STATUSES,
  type PartSalesStatus,
} from '@/lib/part-sales-status';
import { STOCK_ORIGINS, stockOriginLabel } from '@/lib/stock';
import { supabase } from '@/lib/supabase/client';
import { exportShipmentStatusLabel } from '@/lib/vehicle-sales-status';
import type { AdminRole, PartWithRelations, StockOrigin } from '@/lib/types';
import { cn } from '@/lib/utils';

type AgentOption = { id: string; label: string };

export default function AdminPartsPage() {
  const [parts, setParts] = useState<PartWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<'all' | StockOrigin>('all');
  const [stockStatus, setStockStatus] = useState<'all' | 'available' | 'reserved' | 'sold'>('all');
  const [salesStatus, setSalesStatus] = useState<'all' | PartSalesStatus>('all');
  const [agentFilter, setAgentFilter] = useState<'all' | string>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setFiltersOpen(false);
    }
  }, []);
  const [shipmentByPart, setShipmentByPart] = useState<Record<string, string>>({});
  const [invoiceByPart, setInvoiceByPart] = useState<Record<string, string>>({});
  const [role, setRole] = useState<AdminRole | null>(null);
  const [allowedOrigins, setAllowedOrigins] = useState<string[] | null>(null);
  const [claimTarget, setClaimTarget] = useState<PartWithRelations | null>(null);
  const [requesterTarget, setRequesterTarget] = useState<PartWithRelations | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const fieldAgent = isFieldAgentRole(role);
  const isManager = role === 'manager';

  const fetchParts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('parts')
      .select('*, categories(*), part_photos(*), part_compatibility(*)')
      .order('created_at', { ascending: false })
      .limit(800);
    if (error) toast.error(error.message);
    const list = (data || []) as unknown as PartWithRelations[];
    setParts(list);

    const partIds = list.map((p) => p.id);
    const reservedByIds = Array.from(new Set(list.map((p) => p.reserved_by).filter(Boolean))) as string[];

    const [agentRes, linkRes, itemRes] = await Promise.all([
      supabase
        .from('admin_profiles')
        .select('id,full_name,email,role')
        .in('role', ['sales', 'freelancer', 'manager', 'admin', 'staff'])
        .eq('is_active', true)
        .order('full_name')
        .limit(300),
      partIds.length
        ? supabase
            .from('export_shipment_parts')
            .select('part_id, export_shipments(status,created_at)')
            .in('part_id', partIds)
        : Promise.resolve({ data: [], error: null }),
      partIds.length
        ? supabase
            .from('invoice_items')
            .select('part_id, invoices(status,created_at,document_type)')
            .in('part_id', partIds)
            .not('part_id', 'is', null)
            .limit(800)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // export_shipment_parts may not exist until migration — ignore missing relation errors
    if (linkRes.error && !/export_shipment_parts|schema cache|does not exist/i.test(linkRes.error.message)) {
      toast.error(linkRes.error.message);
    }

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
      const prev = shipMap[row.part_id];
      if (!prev || String(ship.created_at) > prev.created) {
        shipMap[row.part_id] = { status: ship.status, created: String(ship.created_at || '') };
      }
    }
    setShipmentByPart(Object.fromEntries(Object.entries(shipMap).map(([id, v]) => [id, v.status])));

    const invMap: Record<string, { status: string; created: string }> = {};
    for (const row of itemRes.data || []) {
      if (!row.part_id) continue;
      const inv = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
      if (!inv?.status) continue;
      const prev = invMap[row.part_id];
      if (!prev || String(inv.created_at) > prev.created) {
        invMap[row.part_id] = { status: inv.status, created: String(inv.created_at || '') };
      }
    }
    setInvoiceByPart(Object.fromEntries(Object.entries(invMap).map(([id, v]) => [id, v.status])));
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
    void fetchParts();
  }, [fetchParts]);

  const salesStatusOf = useCallback(
    (part: PartWithRelations): PartSalesStatus =>
      derivePartSalesStatus({
        stockStatus: part.stock_status,
        invoiceStatus: invoiceByPart[part.id],
        shipmentStatus: shipmentByPart[part.id],
      }),
    [invoiceByPart, shipmentByPart]
  );

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const part of parts) {
      const cat = part.categories;
      if (cat?.id && cat?.name) map.set(cat.id, cat.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [parts]);

  const summary = useMemo(() => {
    const available = parts.filter((p) => p.stock_status === 'available').length;
    const reserved = parts.filter((p) => p.stock_status === 'reserved').length;
    const sold = parts.filter((p) => p.stock_status === 'sold').length;
    const booked = parts.filter((p) => {
      const s = shipmentByPart[p.id];
      return s === 'booked' || s === 'loaded';
    }).length;
    const shipped = parts.filter((p) => shipmentByPart[p.id] === 'sailed').length;
    return { available, reserved, sold, booked, shipped, total: parts.length };
  }, [parts, shipmentByPart]);

  const filtered = useMemo(
    () =>
      parts.filter((part) => {
        if (origin !== 'all' && part.stock_origin !== origin) return false;
        if (stockStatus !== 'all' && part.stock_status !== stockStatus) return false;
        if (salesStatus !== 'all' && salesStatusOf(part) !== salesStatus) return false;
        if (agentFilter !== 'all' && part.reserved_by !== agentFilter) return false;
        if (categoryFilter !== 'all' && part.category_id !== categoryFilter) return false;
        const agentLabel = part.reserved_by ? agentNames[part.reserved_by] : '';
        const compat = (part.part_compatibility || [])
          .map((c) => `${c.make} ${c.model}`)
          .join(' ');
        return matchesQuery(query, [
          part.name,
          part.part_code,
          part.oem_number,
          part.part_number,
          part.brand,
          part.location,
          stockOriginLabel(part.stock_origin),
          part.stock_status,
          part.categories?.name,
          agentLabel,
          part.reservation_requester_name,
          compat,
          PART_SALES_STATUS_LABELS[salesStatusOf(part)],
        ]);
      }),
    [
      agentFilter,
      agentNames,
      categoryFilter,
      origin,
      parts,
      query,
      salesStatus,
      salesStatusOf,
      stockStatus,
    ]
  );

  const availableFiltered = useMemo(
    () => filtered.filter((p) => p.stock_status === 'available' && p.quantity > 0),
    [filtered]
  );
  const selectedPartIds = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const partLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.id] = p.part_code || p.name || p.id.slice(0, 8);
    }
    return map;
  }, [parts]);

  function toggleSelected(id: string, next: boolean) {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function selectAllAvailable() {
    setSelectedIds(new Set(availableFiltered.map((p) => p.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function updatePart(id: string, changes: Record<string, unknown>) {
    const { error } = await supabase.from('parts').update(changes).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Part updated.');
    await fetchParts();
  }

  async function deletePart(part: PartWithRelations) {
    if (!window.confirm(`Delete ${part.name} permanently?`)) return;
    const paths = (part.part_photos || []).map((photo) => photo.storage_path);
    const { error } = await supabase.from('parts').delete().eq('id', part.id);
    if (error) return toast.error(error.message);
    if (paths.length) await supabase.storage.from('part-images').remove(paths);
    toast.success('Part deleted.');
    await fetchParts();
  }

  async function makeAvailable(part: PartWithRelations) {
    if (
      !window.confirm(
        `Make "${part.name}" available again? This clears the reservation and linked SOA.`
      )
    ) {
      return;
    }
    await updatePart(part.id, { stock_status: 'available' });
  }

  async function submitClaim(payload: { amount: number; currency: string; notes: string }) {
    if (!claimTarget) return;
    setActionBusy(true);
    const { error } = await supabase.rpc('claim_stock_commission', {
      p_amount: payload.amount,
      p_currency: payload.currency,
      p_vehicle_id: null,
      p_part_id: claimTarget.id,
      p_invoice_id: null,
      p_notes: payload.notes || null,
      p_claimant_id: null,
    });
    setActionBusy(false);
    if (error) return toast.error(error.message);
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
      .from('parts')
      .update({
        reservation_requester_name: payload.name,
        reservation_requester_role: payload.role,
      })
      .eq('id', requesterTarget.id);
    setActionBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Requester updated.');
    setRequesterTarget(null);
    await fetchParts();
  }

  return (
    <div className="space-y-5">
      {isManager ? (
        <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm">
          {allowedOrigins && allowedOrigins.length > 0 ? (
            <p>
              Location scope:{' '}
              {STOCK_ORIGINS.filter((o) => allowedOrigins.includes(o.value))
                .map((o) => o.label)
                .join(', ')}
              . Other stock origins are hidden by RLS.
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
          <h1 className="mt-1 text-2xl font-black tracking-tight">
            {fieldAgent ? 'Parts stock' : 'Parts inventory'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Dense parts list with dual status, origin filters, and reserve flow — aligned with stock ops.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!fieldAgent ? (
            <>
              <Button asChild variant="outline">
                <Link href="/admin/parts/stock">
                  <Package className="h-4 w-4" />
                  Parts stock ops
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin/export-shipments">
                  <Ship className="h-4 w-4" />
                  DHL / exports
                </Link>
              </Button>
              <Button asChild variant="accent">
                <Link href="/admin/parts/new">
                  <Plus className="h-4 w-4" />
                  Add part
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild variant="accent">
              <Link href="/admin/reservations?kind=part">Reserve part</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
                    placeholder="Name, part code, OEM, brand, make/model…"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Sales / fulfillment</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={salesStatus}
                  onChange={(e) => setSalesStatus(e.target.value as 'all' | PartSalesStatus)}
                >
                  <option value="all">All statuses</option>
                  {PART_SALES_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PART_SALES_STATUS_LABELS[s]}
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
                  {(isManager && allowedOrigins
                    ? STOCK_ORIGINS.filter((item) => allowedOrigins.includes(item.value))
                    : STOCK_ORIGINS
                  ).map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {!fieldAgent ? (
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
              ) : null}
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setQuery('');
                    setOrigin('all');
                    setStockStatus('all');
                    setSalesStatus('all');
                    setAgentFilter('all');
                    setCategoryFilter('all');
                  }}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between space-y-0 gap-2 py-3">
          <CardTitle className="text-base">
            Parts list
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {filtered.length} of {parts.length}
            </span>
          </CardTitle>
          {availableFiltered.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={selectAllAvailable}>
                Select available ({availableFiltered.length})
              </Button>
              {selectedIds.size > 0 ? (
                <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                  Clear
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className={cn('space-y-2 p-2 sm:p-4', selectedIds.size > 0 && 'pb-24')}>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <Wrench className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">No parts found.</p>
            </div>
          ) : (
            filtered.map((part) => (
              <AdminPartCard
                key={part.id}
                part={part}
                fieldAgent={fieldAgent}
                reservedByLabel={part.reserved_by ? agentNames[part.reserved_by] : null}
                salesStatusLabel={PART_SALES_STATUS_LABELS[salesStatusOf(part)]}
                shipmentStatusLabel={
                  shipmentByPart[part.id] ? exportShipmentStatusLabel(shipmentByPart[part.id]) : null
                }
                selected={selectedIds.has(part.id)}
                onSelectedChange={(next) => toggleSelected(part.id, next)}
                onUpdate={updatePart}
                onDelete={isManager ? undefined : deletePart}
                onMakeAvailable={makeAvailable}
                onChangeRequester={fieldAgent ? undefined : setRequesterTarget}
                onClaimCommission={setClaimTarget}
                stockOriginOptions={
                  isManager && allowedOrigins
                    ? STOCK_ORIGINS.filter((item) => allowedOrigins.includes(item.value))
                    : STOCK_ORIGINS
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      {selectedIds.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {selectedIds.size} part{selectedIds.size === 1 ? '' : 's'} selected
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
        vehicleIds={[]}
        partIds={selectedPartIds}
        partLabels={partLabels}
        defaultShipment="dhl"
        onCompleted={() => {
          clearSelection();
          void fetchParts();
        }}
      />

      <ClaimCommissionDialog
        open={!!claimTarget}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setClaimTarget(null);
        }}
        title={claimTarget?.name || ''}
        defaultCurrency={claimTarget?.currency}
        busy={actionBusy}
        onSubmit={submitClaim}
      />
      <ChangeRequesterDialog
        open={!!requesterTarget}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setRequesterTarget(null);
        }}
        title={requesterTarget?.name || ''}
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

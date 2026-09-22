'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Eye, Filter, Loader2, Package, Search, Ship } from 'lucide-react';
import { toast } from 'sonner';
import { StockInventorySummary } from '@/components/admin/stock-inventory-summary';
import { publicPartImageUrl } from '@/components/public/catalog-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { matchesQuery } from '@/lib/matches-query';
import { loadPartsStockOpsRows, type PartsStockOpsRow } from '@/lib/parts-stock-ops-data';
import { stockOriginLabel } from '@/lib/stock';
import {
  SHIPMENT_VIEW_STATUS_LABELS,
  SHIPMENT_VIEW_STATUSES,
  STOCK_PAYMENT_STATUS_LABELS,
  STOCK_PAYMENT_STATUSES,
  type ShipmentViewStatus,
  type StockPaymentStatus,
} from '@/lib/stock-ops';
import { SHIPMENT_MODE_LABELS, type ShipmentMode } from '@/lib/trade-terms';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Filters = {
  q: string;
  stockPayment: 'all' | StockPaymentStatus;
  shipmentView: 'all' | ShipmentViewStatus;
  agentId: 'all' | string;
  origin: string;
  category: string;
  shipmentMode: 'all' | string;
  make: string;
  model: string;
};

const emptyFilters = (): Filters => ({
  q: '',
  stockPayment: 'all',
  shipmentView: 'all',
  agentId: 'all',
  origin: '',
  category: '',
  shipmentMode: 'all',
  make: '',
  model: '',
});

function money(amount: number | null, currency: string | null) {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency || ''}`.trim();
  }
}

const paymentBadge: Record<StockPaymentStatus, string> = {
  available: 'bg-orange-100 text-orange-900',
  reserved: 'bg-amber-100 text-amber-900',
  partial_paid: 'bg-yellow-100 text-yellow-900',
  paid: 'bg-emerald-100 text-emerald-900',
  unpaid: 'bg-red-100 text-red-800',
  sold: 'bg-zinc-900 text-white',
};

const shipBadge: Record<ShipmentViewStatus, string> = {
  not_booked: 'bg-slate-100 text-slate-800',
  booked: 'bg-blue-100 text-blue-900',
  shipped: 'bg-emerald-100 text-emerald-900',
  delivered: 'bg-violet-100 text-violet-900',
};

export default function PartsStockOpsPage() {
  const [rows, setRows] = useState<PartsStockOpsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [agents, setAgents] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setFiltersOpen(false);
    }
  }, []);

  const loadPage = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    const [{ rows: data, error, hasMore: more }, agentRes] = await Promise.all([
      loadPartsStockOpsRows(200, offset),
      supabase
        .from('admin_profiles')
        .select('id,full_name,email,role')
        .in('role', ['sales', 'freelancer'])
        .eq('is_active', true)
        .order('full_name')
        .limit(200),
    ]);
    if (error) toast.error(error);
    setRows((current) => (offset === 0 ? data : [...current, ...data]));
    setHasMore(more);
    if (offset === 0) {
      setAgents(
        (agentRes.data || []).map((row) => ({
          id: row.id,
          label: row.full_name || row.email || row.id.slice(0, 8),
        }))
      );
    }
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  const openShipments = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.shipment_view === 'booked' ||
          r.shipment_view === 'shipped' ||
          (r.shipment_view === 'delivered' && r.stock_payment !== 'paid')
      ),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filters.stockPayment !== 'all' && row.stock_payment !== filters.stockPayment) return false;
      if (filters.shipmentView !== 'all' && row.shipment_view !== filters.shipmentView) return false;
      if (filters.agentId !== 'all' && row.reserved_by !== filters.agentId) return false;
      if (filters.shipmentMode !== 'all' && row.shipment_mode !== filters.shipmentMode) return false;
      if (filters.origin && !(row.stock_origin || '').toLowerCase().includes(filters.origin.toLowerCase()))
        return false;
      if (
        filters.category &&
        !(row.category_name || '').toLowerCase().includes(filters.category.toLowerCase())
      )
        return false;
      if (filters.make && !(row.make || '').toLowerCase().includes(filters.make.toLowerCase()))
        return false;
      if (filters.model && !(row.model || '').toLowerCase().includes(filters.model.toLowerCase()))
        return false;
      return matchesQuery(filters.q, [
        row.title,
        row.part_code,
        row.oem_number,
        row.part_number,
        row.brand,
        row.agent_name,
        row.customer_name,
        row.category_name,
        row.compat_label,
        row.shipment_number,
        row.booking_ref,
      ]);
    });
  }, [filters, rows]);

  const patch = (key: keyof Filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));

  const applySummaryFilter = (shipment: 'available' | 'booked' | 'shipped' | 'delivered') => {
    const map: Record<typeof shipment, ShipmentViewStatus> = {
      available: 'not_booked',
      booked: 'booked',
      shipped: 'shipped',
      delivered: 'delivered',
    };
    setFilters((f) => ({ ...f, shipmentView: map[shipment] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Parts operations</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Parts stock management</h1>
          <p className="text-sm text-muted-foreground">
            Dual status parts inventory — payment × shipment — with summary, filters, and open DHL
            shipments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/parts">
              <Package className="h-4 w-4" />
              Catalog
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/export-shipments">
              <Ship className="h-4 w-4" />
              Export / DHL
            </Link>
          </Button>
          <Button asChild variant="accent">
            <Link href="/admin/reservations?kind=part">Reserve part</Link>
          </Button>
        </div>
      </div>

      {openShipments.length > 0 ? (
        <Card className="border-sky-200 bg-sky-50/60">
          <CardHeader className="py-3">
            <CardTitle className="text-base">Open part shipments ({openShipments.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pb-4">
            {openShipments.slice(0, 12).map((row) => (
              <Badge key={row.id} variant="outline" className="font-normal">
                {row.part_code} · {SHIPMENT_VIEW_STATUS_LABELS[row.shipment_view]}
                {row.shipment_number ? ` · ${row.shipment_number}` : ''}
              </Badge>
            ))}
            {openShipments.length > 12 ? (
              <span className="text-xs text-muted-foreground">+{openShipments.length - 12} more</span>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <StockInventorySummary rows={rows} onFilterBucket={applySummaryFilter} />

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
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        value={filters.q}
                        onChange={(e) => patch('q', e.target.value)}
                        placeholder="Part code, name, OEM, agent…"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Stock status</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={filters.stockPayment}
                      onChange={(e) => patch('stockPayment', e.target.value)}
                    >
                      <option value="all">All</option>
                      {STOCK_PAYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STOCK_PAYMENT_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Shipment status</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={filters.shipmentView}
                      onChange={(e) => patch('shipmentView', e.target.value)}
                    >
                      <option value="all">All</option>
                      {SHIPMENT_VIEW_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {SHIPMENT_VIEW_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Sales agent</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={filters.agentId}
                      onChange={(e) => patch('agentId', e.target.value)}
                    >
                      <option value="all">All</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Shipment type</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={filters.shipmentMode}
                      onChange={(e) => patch('shipmentMode', e.target.value)}
                    >
                      <option value="all">All</option>
                      {Object.entries(SHIPMENT_MODE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Origin</Label>
                    <Input value={filters.origin} onChange={(e) => patch('origin', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Input value={filters.category} onChange={(e) => patch('category', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Make (compat)</Label>
                    <Input value={filters.make} onChange={(e) => patch('make', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Model (compat)</Label>
                    <Input value={filters.model} onChange={(e) => patch('model', e.target.value)} />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="outline" onClick={() => setFilters(emptyFilters())}>
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">
                Parts stock list
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {filtered.length} of {rows.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-2 sm:p-4">
              {filtered.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No parts match these filters.
                </p>
              ) : (
                filtered.map((row) => <PartStockRow key={row.id} row={row} />)
              )}
              {hasMore ? (
                <div className="flex flex-col items-center gap-2 border-t pt-4">
                  <Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadPage(rows.length)}>
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Load 200 more
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Loaded {rows.length} parts. Filters and summaries apply to loaded records.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function PartStockRow({ row }: { row: PartsStockOpsRow }) {
  const photo = row.cover_path ? publicPartImageUrl(row.cover_path) : '';
  const modeLabel = row.shipment_mode
    ? SHIPMENT_MODE_LABELS[row.shipment_mode as ShipmentMode] || row.shipment_mode
    : '—';

  return (
    <div className="grid gap-3 rounded-lg border bg-sky-50/40 p-3 dark:bg-sky-950/20 lg:grid-cols-[5.5rem_minmax(12rem,1.2fr)_minmax(8rem,0.8fr)_minmax(9rem,0.9fr)_minmax(10rem,1fr)_7.5rem]">
      <div className="h-16 w-20 overflow-hidden rounded-md bg-secondary">
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-contain p-1" />
        ) : (
          <div className="grid h-full place-items-center text-[10px] text-muted-foreground">No photo</div>
        )}
      </div>
      <div className="min-w-0 space-y-0.5 text-xs">
        <Link href={`/admin/parts/${row.id}`} className="font-bold text-primary hover:underline">
          {row.part_code}
        </Link>
        <p className="truncate font-semibold">{row.title}</p>
        <p className="truncate text-muted-foreground">{row.category_name || '—'}</p>
        {row.compat_label ? <p className="truncate text-muted-foreground">{row.compat_label}</p> : null}
      </div>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>{stockOriginLabel(row.stock_origin)}</p>
        <p>Qty {row.quantity}</p>
        <p className="font-medium text-foreground">FOB {money(row.price_fob ?? row.price, row.currency)}</p>
      </div>
      <div className="space-y-0.5 text-xs">
        {row.reservation_requester_name || row.agent_name ? (
          <Badge className="bg-sky-600 text-white">
            {row.reservation_requester_name || row.agent_name}
          </Badge>
        ) : (
          <p className="text-muted-foreground">No agent</p>
        )}
        <p className="font-semibold">{row.customer_name || '—'}</p>
        <p>Sold {money(row.invoice_total, row.invoice_currency || row.currency)}</p>
      </div>
      <div className="space-y-0.5 text-xs">
        <p className="font-bold uppercase">{row.destination_country || row.customer_country || '—'}</p>
        {row.shipment_number ? <p className="font-mono text-[10px]">{row.shipment_number}</p> : null}
        {row.has_waybill ? <Badge variant="outline" className="text-[10px]">Waybill</Badge> : null}
      </div>
      <div className="space-y-1 text-xs">
        <Badge className={paymentBadge[row.stock_payment]}>
          {STOCK_PAYMENT_STATUS_LABELS[row.stock_payment].toUpperCase()}
        </Badge>
        <Badge className={shipBadge[row.shipment_view]}>
          {SHIPMENT_VIEW_STATUS_LABELS[row.shipment_view].toUpperCase()}
        </Badge>
        <p className="text-muted-foreground">{modeLabel}</p>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/admin/parts/${row.id}`}>
            <Eye className="h-3.5 w-3.5" />
            Open
          </Link>
        </Button>
      </div>
    </div>
  );
}

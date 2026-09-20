'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Eye, Filter, Loader2, Search, Ship } from 'lucide-react';
import { toast } from 'sonner';
import { StockInventorySummary } from '@/components/admin/stock-inventory-summary';
import { publicVehicleImageUrl } from '@/components/public/catalog-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { matchesQuery } from '@/lib/matches-query';
import { stockOriginLabel } from '@/lib/stock';
import { loadStockOpsRows } from '@/lib/stock-ops-data';
import {
  SHIPMENT_VIEW_STATUS_LABELS,
  SHIPMENT_VIEW_STATUSES,
  STOCK_PAYMENT_STATUS_LABELS,
  STOCK_PAYMENT_STATUSES,
  type ShipmentViewStatus,
  type StockOpsRow,
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
  destinationCountry: string;
  destinationPort: string;
  loadingPort: string;
  blNumber: string;
  bookingRef: string;
  shipmentMode: 'all' | string;
  blUploaded: 'all' | 'yes' | 'no';
  exportCert: 'all' | 'yes' | 'no';
  inspection: 'all' | 'yes' | 'no';
  make: string;
  model: string;
  yard: string;
  etdFrom: string;
  etdTo: string;
  etaFrom: string;
  etaTo: string;
  buyFrom: string;
  buyTo: string;
};

const emptyFilters = (): Filters => ({
  q: '',
  stockPayment: 'all',
  shipmentView: 'all',
  agentId: 'all',
  destinationCountry: '',
  destinationPort: '',
  loadingPort: '',
  blNumber: '',
  bookingRef: '',
  shipmentMode: 'all',
  blUploaded: 'all',
  exportCert: 'all',
  inspection: 'all',
  make: '',
  model: '',
  yard: '',
  etdFrom: '',
  etdTo: '',
  etaFrom: '',
  etaTo: '',
  buyFrom: '',
  buyTo: '',
});

function inDateRange(value: string | null, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

function money(amount: number | null, currency: string | null) {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(amount);
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

export default function StockOpsPage() {
  const [rows, setRows] = useState<StockOpsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [agents, setAgents] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setFiltersOpen(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ rows: data, error }, agentRes] = await Promise.all([
      loadStockOpsRows(1000),
      supabase
        .from('admin_profiles')
        .select('id,full_name,email,role')
        .in('role', ['sales', 'freelancer'])
        .eq('is_active', true)
        .order('full_name')
        .limit(200),
    ]);
    if (error) toast.error(error);
    setRows(data);
    setAgents(
      (agentRes.data || []).map((row) => ({
        id: row.id,
        label: row.full_name || row.email || row.id.slice(0, 8),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filters.stockPayment !== 'all' && row.stock_payment !== filters.stockPayment) return false;
      if (filters.shipmentView !== 'all' && row.shipment_view !== filters.shipmentView) return false;
      if (filters.agentId !== 'all' && row.reserved_by !== filters.agentId) return false;
      if (filters.shipmentMode !== 'all' && row.shipment_mode !== filters.shipmentMode) return false;
      if (filters.destinationCountry && !(row.destination_country || '').toLowerCase().includes(filters.destinationCountry.toLowerCase())) return false;
      if (filters.destinationPort && !(row.destination_port || '').toLowerCase().includes(filters.destinationPort.toLowerCase())) return false;
      if (filters.loadingPort && !(row.loading_port || '').toLowerCase().includes(filters.loadingPort.toLowerCase())) return false;
      if (filters.blNumber && !(row.bl_number || '').toLowerCase().includes(filters.blNumber.toLowerCase())) return false;
      if (filters.bookingRef && !(row.booking_ref || '').toLowerCase().includes(filters.bookingRef.toLowerCase())) return false;
      if (filters.make && !(row.make || '').toLowerCase().includes(filters.make.toLowerCase())) return false;
      if (filters.model && !(row.model || '').toLowerCase().includes(filters.model.toLowerCase())) return false;
      if (filters.yard && !(row.location || '').toLowerCase().includes(filters.yard.toLowerCase())) return false;
      if (filters.blUploaded === 'yes' && !row.has_bl) return false;
      if (filters.blUploaded === 'no' && row.has_bl) return false;
      if (filters.exportCert === 'yes' && !row.has_export_cert) return false;
      if (filters.exportCert === 'no' && row.has_export_cert) return false;
      if (filters.inspection === 'yes' && !row.has_inspection) return false;
      if (filters.inspection === 'no' && row.has_inspection) return false;
      if (!inDateRange(row.etd, filters.etdFrom, filters.etdTo)) return false;
      if (!inDateRange(row.eta, filters.etaFrom, filters.etaTo)) return false;
      if (!inDateRange(row.purchase_date, filters.buyFrom, filters.buyTo)) return false;
      return matchesQuery(filters.q, [
        row.title,
        row.stock_number,
        row.chassis_number,
        row.make,
        row.model,
        row.agent_name,
        row.customer_name,
        row.bl_number,
        row.vessel_name,
        row.destination_country,
        row.booking_ref,
        row.shipment_number,
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
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Stock operations</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Stock management</h1>
          <p className="text-sm text-muted-foreground">
            Dual status inventory — stock/payment × shipment — with summary, filters, and dense list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/stock/arrival-watch">
              <Ship className="h-4 w-4" />
              Arrival Watch
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/configuration">Export masters</Link>
          </Button>
          <Button asChild variant="accent">
            <Link href="/admin/reservations">Reserve</Link>
          </Button>
        </div>
      </div>

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
                  <div className="space-y-1 sm:col-span-2 xl:col-span-2">
                    <Label>Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input className="pl-9" value={filters.q} onChange={(e) => patch('q', e.target.value)} placeholder="Stock #, chassis, customer, BL, vessel…" />
                    </div>
                  </div>
                  <FilterSelect label="Stock status" value={filters.stockPayment} onChange={(v) => patch('stockPayment', v)}>
                    <option value="all">All</option>
                    {STOCK_PAYMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>{STOCK_PAYMENT_STATUS_LABELS[s]}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect label="Shipment status" value={filters.shipmentView} onChange={(v) => patch('shipmentView', v)}>
                    <option value="all">All</option>
                    {SHIPMENT_VIEW_STATUSES.map((s) => (
                      <option key={s} value={s}>{SHIPMENT_VIEW_STATUS_LABELS[s]}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect label="Sales agent" value={filters.agentId} onChange={(v) => patch('agentId', v)}>
                    <option value="all">All</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect label="Shipment type" value={filters.shipmentMode} onChange={(v) => patch('shipmentMode', v)}>
                    <option value="all">All</option>
                    {Object.entries(SHIPMENT_MODE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </FilterSelect>
                  <TextFilter label="Make" value={filters.make} onChange={(v) => patch('make', v)} />
                  <TextFilter label="Model" value={filters.model} onChange={(v) => patch('model', v)} />
                  <TextFilter label="Yard / location" value={filters.yard} onChange={(v) => patch('yard', v)} />
                  <TextFilter label="Destination country" value={filters.destinationCountry} onChange={(v) => patch('destinationCountry', v)} />
                  <TextFilter label="Destination port" value={filters.destinationPort} onChange={(v) => patch('destinationPort', v)} />
                  <TextFilter label="Loading port" value={filters.loadingPort} onChange={(v) => patch('loadingPort', v)} />
                  <TextFilter label="BL #" value={filters.blNumber} onChange={(v) => patch('blNumber', v)} />
                  <TextFilter label="Booking #" value={filters.bookingRef} onChange={(v) => patch('bookingRef', v)} />
                  <FilterSelect label="BL uploaded" value={filters.blUploaded} onChange={(v) => patch('blUploaded', v)}>
                    <option value="all">All</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </FilterSelect>
                  <FilterSelect label="Export cert" value={filters.exportCert} onChange={(v) => patch('exportCert', v)}>
                    <option value="all">All</option>
                    <option value="yes">On file</option>
                    <option value="no">Missing</option>
                  </FilterSelect>
                  <FilterSelect label="Inspection cert" value={filters.inspection} onChange={(v) => patch('inspection', v)}>
                    <option value="all">All</option>
                    <option value="yes">On file</option>
                    <option value="no">Missing</option>
                  </FilterSelect>
                  <TextFilter label="ETD from" value={filters.etdFrom} onChange={(v) => patch('etdFrom', v)} type="date" />
                  <TextFilter label="ETD to" value={filters.etdTo} onChange={(v) => patch('etdTo', v)} type="date" />
                  <TextFilter label="ETA from" value={filters.etaFrom} onChange={(v) => patch('etaFrom', v)} type="date" />
                  <TextFilter label="ETA to" value={filters.etaTo} onChange={(v) => patch('etaTo', v)} type="date" />
                  <TextFilter label="Buying from" value={filters.buyFrom} onChange={(v) => patch('buyFrom', v)} type="date" />
                  <TextFilter label="Buying to" value={filters.buyTo} onChange={(v) => patch('buyTo', v)} type="date" />
                  <div className="flex items-end gap-2 xl:col-span-2">
                    <Button type="button" variant="outline" onClick={() => setFilters(emptyFilters())}>
                      Reset
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Showing {filtered.length} of {rows.length}. Container # deferred (no column yet).
                    </p>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Stock list</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-2 sm:p-4">
              {filtered.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No vehicles match these filters.</p>
              ) : (
                filtered.map((row) => <StockRow key={row.id} row={row} />)
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

function TextFilter({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function StockRow({ row }: { row: StockOpsRow }) {
  const photo = row.cover_path ? publicVehicleImageUrl(row.cover_path) : '';
  const stockRef = row.stock_number || row.chassis_number || row.id.slice(0, 8);
  const sold = row.invoice_total;
  const balance = row.invoice_balance;
  const cost = row.landed_cost ?? row.purchase_price;
  const profit = sold != null && cost != null ? sold - cost : null;
  const modeLabel = row.shipment_mode
    ? SHIPMENT_MODE_LABELS[row.shipment_mode as ShipmentMode] || row.shipment_mode
    : '—';

  return (
    <div className="grid gap-3 rounded-lg border bg-sky-50/40 p-3 dark:bg-sky-950/20 lg:grid-cols-[7rem_minmax(12rem,1.2fr)_minmax(8rem,0.8fr)_minmax(9rem,0.9fr)_minmax(10rem,1fr)_minmax(11rem,1.1fr)_7.5rem]">
      <div className="h-20 w-28 overflow-hidden rounded-md bg-secondary">
        {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[10px] text-muted-foreground">No photo</div>}
      </div>

      <div className="min-w-0 space-y-0.5 text-xs">
        <Link href={`/admin/vehicles/${row.id}`} className="font-bold text-primary hover:underline">
          {stockRef}
        </Link>
        <p className="truncate font-semibold">{[row.year, row.make, row.model].filter(Boolean).join(' ')}</p>
        {row.chassis_number ? (
          <p className="truncate font-mono text-[11px] text-muted-foreground">{row.chassis_number}</p>
        ) : null}
        <div className="flex flex-wrap gap-1 pt-1">
          {row.fuel_type ? <Badge variant="outline" className="font-normal">{row.fuel_type}</Badge> : null}
          {row.transmission ? <Badge variant="outline" className="font-normal">{row.transmission}</Badge> : null}
          {row.color ? <Badge variant="outline" className="font-normal">{row.color}</Badge> : null}
        </div>
      </div>

      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>{stockOriginLabel(row.stock_origin)}</p>
        <p>{row.location || '—'}</p>
        {row.loading_port ? <p>POL: {row.loading_port}</p> : null}
        <p className="font-medium text-foreground">
          FOB {money(row.price_fob ?? row.price, row.currency)}
        </p>
      </div>

      <div className="space-y-0.5 text-xs">
        <p className="text-muted-foreground">{row.purchase_date || '—'}</p>
        <p>{money(row.purchase_price, row.purchase_currency || 'JPY')}</p>
        {row.reservation_requester_name ? (
          <Badge className="bg-sky-600 text-white">{row.reservation_requester_name}</Badge>
        ) : row.agent_name ? (
          <Badge variant="secondary">{row.agent_name}</Badge>
        ) : null}
        {row.reservation_vat_applicable != null ? (
          <p className={cn('text-[11px] font-semibold', row.reservation_vat_applicable ? 'text-emerald-700' : 'text-red-700')}>
            {row.reservation_vat_applicable ? 'VAT included' : 'VAT excluded (0%)'}
          </p>
        ) : null}
      </div>

      <div className="space-y-0.5 text-xs">
        <p className="font-semibold">{row.customer_name || '—'}</p>
        <p className="font-bold uppercase">{row.destination_country || row.customer_country || '—'}</p>
        {row.destination_port ? <p>{row.destination_port}</p> : null}
        <p>Sold {money(sold, row.invoice_currency || row.currency)}</p>
        <p className={cn(balance && balance > 0 ? 'font-semibold text-red-600' : '')}>
          Bal {money(balance, row.invoice_currency || row.currency)}
        </p>
        {profit != null ? <p>Profit {money(profit, row.invoice_currency || row.currency)}</p> : null}
        <div className="flex flex-wrap gap-1 pt-1">
          {row.etd ? <span className="text-[10px]">ETD {row.etd}</span> : null}
          {row.eta ? <span className="text-[10px]">ETA {row.eta}</span> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {row.has_bl ? <Badge variant="outline" className="text-[10px]">BL</Badge> : null}
          {row.has_export_cert ? <Badge variant="outline" className="text-[10px]">EC</Badge> : null}
          {row.invoice_id ? <Badge variant="outline" className="text-[10px]">INV</Badge> : null}
        </div>
      </div>

      <div className="space-y-1 text-xs">
        <Badge className={paymentBadge[row.stock_payment]}>{STOCK_PAYMENT_STATUS_LABELS[row.stock_payment].toUpperCase()}</Badge>
        <Badge className={shipBadge[row.shipment_view]}>{SHIPMENT_VIEW_STATUS_LABELS[row.shipment_view].toUpperCase()}</Badge>
        <p className="text-muted-foreground">{modeLabel}</p>
        {row.vessel_name ? <p className="truncate">{row.vessel_name}</p> : null}
        {row.bl_number ? <p className="font-mono text-[10px]">BL {row.bl_number}</p> : null}
        <div className="flex flex-wrap gap-1 pt-1">
          <Button asChild size="sm" variant="ghost">
            <Link href={`/admin/vehicles/${row.id}`}>
              <Eye className="h-3.5 w-3.5" />
              Open
            </Link>
          </Button>
          {row.shipment_id ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin/export-shipments">Ship</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

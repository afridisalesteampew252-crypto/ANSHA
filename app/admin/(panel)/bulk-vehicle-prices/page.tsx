'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CheckSquare, Filter, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canManageReceivables } from '@/lib/admin-rbac';
import { STOCK_ORIGINS } from '@/lib/stock';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole } from '@/lib/types';

type PriceField = 'price_fob' | 'price_cf' | 'price_cif';
type Vehicle = {
  id: string;
  title: string;
  make: string;
  model: string;
  year: number | null;
  chassis_number: string | null;
  stock_origin: string | null;
  currency: string;
  price_fob: number | null;
  price_cf: number | null;
  price_cif: number | null;
};
type Filters = {
  make: string;
  model: string;
  year: string;
  stockOrigin: string;
  currency: string;
  priceStatus: string;
};

const PAGE_SIZE = 1000;
const fields: Array<{ value: PriceField; label: string }> = [
  { value: 'price_fob', label: 'FOB' },
  { value: 'price_cf', label: 'C&F' },
  { value: 'price_cif', label: 'CIF' },
];
const emptyFilters = (): Filters => ({
  make: '',
  model: '',
  year: '',
  stockOrigin: '',
  currency: '',
  priceStatus: '',
});

const originLabel = (value: string) =>
  STOCK_ORIGINS.find((origin) => origin.value === value)?.label || value;

const money = (value: number | null, currency: string) => {
  if (value == null) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ' + (currency || 'USD');
};

export default function BulkVehiclePricesPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selected, setSelected] = useState<string[]>([]);
  const [field, setField] = useState<PriceField>('price_fob');
  const [mode, setMode] = useState('set');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const canWrite = canManageReceivables(role);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase.from('admin_profiles').select('role').eq('id', user.id).maybeSingle();
    setRole((profile?.role as AdminRole) || null);
    const { data, error } = await supabase
      .from('vehicles')
      .select('id,title,make,model,year,chassis_number,stock_origin,currency,price_fob,price_cf,price_cif')
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1);
    if (error) toast.error(error.message);
    setRows((data || []) as Vehicle[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const makes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.make).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const models = useMemo(
    () => Array.from(new Set(rows.filter((row) => !filters.make || row.make === filters.make).map((row) => row.model).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows, filters.make]
  );
  const years = useMemo(
    () => Array.from(new Set(rows.map((row) => row.year).filter((year): year is number => year != null))).sort((a, b) => b - a),
    [rows]
  );
  const stockOrigins = useMemo(
    () => Array.from(new Set(rows.map((row) => row.stock_origin).filter((origin): origin is string => !!origin))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const currencies = useMemo(
    () => Array.from(new Set(rows.map((row) => row.currency || 'USD'))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !term || [row.title, row.make, row.model, row.chassis_number || '']
        .some((value) => value.toLocaleLowerCase().includes(term));
      const matchesPrice = !filters.priceStatus ||
        (filters.priceStatus === 'priced' ? Number(row[field] || 0) > 0 : Number(row[field] || 0) <= 0);
      return matchesSearch
        && (!filters.make || row.make === filters.make)
        && (!filters.model || row.model === filters.model)
        && (!filters.year || String(row.year ?? '') === filters.year)
        && (!filters.stockOrigin || row.stock_origin === filters.stockOrigin)
        && (!filters.currency || (row.currency || 'USD') === filters.currency)
        && matchesPrice;
    });
  }, [rows, query, filters, field]);

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selected.includes(row.id));
  const changeFilter = <K extends keyof Filters>(key: K, nextValue: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: nextValue, ...(key === 'make' ? { model: '' } : {}) }));
    setSelected([]);
  };

  const clearFilters = () => {
    setQuery('');
    setFilters(emptyFilters());
    setSelected([]);
  };

  const toggleAllFiltered = () => {
    setSelected((current) => allFilteredSelected
      ? current.filter((id) => !filteredRows.some((row) => row.id === id))
      : Array.from(new Set([...current, ...filteredRows.map((row) => row.id)])));
  };

  const apply = async () => {
    const amount = Number(value);
    if (!canWrite || !selected.length) return toast.error('Select one or more vehicles first.');
    if (!Number.isFinite(amount) || amount < 0) return toast.error('Enter a valid amount or percentage.');
    const fieldLabel = fields.find((item) => item.value === field)?.label || field;
    const actionLabel = mode === 'set' ? 'set to ' + amount : (mode === 'increase_percent' ? 'increased by ' : 'decreased by ') + amount + '%';
    if (!window.confirm('Apply ' + fieldLabel + ' ' + actionLabel + ' to ' + selected.length + ' selected vehicles?')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('bulk_update_vehicle_prices', {
      vehicle_ids: selected,
      price_field: field,
      adjustment_mode: mode,
      adjustment_value: amount,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Updated ' + String(data ?? selected.length) + ' vehicle prices.');
    setSelected([]);
    await load();
  };

  return <div className="mx-auto max-w-7xl space-y-6">
    <div>
      <h1 className="text-2xl font-bold">Bulk vehicle prices</h1>
      <p className="mt-1 text-sm text-muted-foreground">Filter or search vehicles, select the matching records, then update FOB (the public listing price), C&F, or CIF.</p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5" />Price update</CardTitle>
        <CardDescription>Changes apply only to selected vehicles. Any positive price you set or calculate is automatically made visible on the public site. Percentage reductions stop at zero; blank prices stay blank for percentage changes.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="price-field">Price type</Label>
          <select id="price-field" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={field} onChange={(event) => { setField(event.target.value as PriceField); setSelected([]); }}>
            {fields.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price-mode">Action</Label>
          <select id="price-mode" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="set">Set to amount</option>
            <option value="increase_percent">Increase by percent</option>
            <option value="decrease_percent">Decrease by percent</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price-value">{mode === 'set' ? 'New price' : 'Percentage'}</Label>
          <Input id="price-value" type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder={mode === 'set' ? 'e.g. 12500' : 'e.g. 5'} />
        </div>
        <div className="flex items-end">
          <Button type="button" onClick={() => void apply()} disabled={!canWrite || busy || selected.length === 0 || !value} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
            {busy ? 'Updating…' : 'Apply to ' + selected.length + ' selected'}
          </Button>
        </div>
      </CardContent>
      {!canWrite && <p className="px-6 pb-5 text-sm text-muted-foreground">Your role can view prices, but cannot change them.</p>}
    </Card>

    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Choose vehicles</CardTitle>
            <CardDescription className="mt-1">
              Showing {filteredRows.length} of {rows.length} vehicles
              {selected.length > 0 ? ' · ' + selected.length + ' selected' : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={!filteredRows.length} onClick={toggleAllFiltered}>
              <CheckSquare className="h-4 w-4" />{allFilteredSelected ? 'Clear filtered selection' : 'Select all filtered'}
            </Button>
            {selected.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>Clear selection</Button>}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="relative sm:col-span-2 xl:col-span-2">
            <Label className="sr-only" htmlFor="vehicle-search">Search vehicles</Label>
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input id="vehicle-search" className="pl-9 pr-9" placeholder="Search title, make, model or chassis" value={query} onChange={(event) => { setQuery(event.target.value); setSelected([]); }} />
            {query && <button type="button" className="absolute right-3 top-3 text-muted-foreground hover:text-foreground" onClick={() => { setQuery(''); setSelected([]); }} aria-label="Clear search"><X className="h-4 w-4" /></button>}
          </div>
          <div>
            <Label className="sr-only" htmlFor="filter-make">Make</Label>
            <select id="filter-make" aria-label="Filter by make" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.make} onChange={(event) => changeFilter('make', event.target.value)}>
              <option value="">All makes</option>{makes.map((make) => <option key={make} value={make}>{make}</option>)}
            </select>
          </div>
          <div>
            <Label className="sr-only" htmlFor="filter-model">Model</Label>
            <select id="filter-model" aria-label="Filter by model" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.model} onChange={(event) => changeFilter('model', event.target.value)}>
              <option value="">All models</option>{models.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </div>
          <div>
            <Label className="sr-only" htmlFor="filter-year">Year</Label>
            <select id="filter-year" aria-label="Filter by year" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.year} onChange={(event) => changeFilter('year', event.target.value)}>
              <option value="">All years</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <div>
            <Label className="sr-only" htmlFor="filter-origin">Stock country</Label>
            <select id="filter-origin" aria-label="Filter by stock country" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.stockOrigin} onChange={(event) => changeFilter('stockOrigin', event.target.value)}>
              <option value="">All stock countries</option>{stockOrigins.map((origin) => <option key={origin} value={origin}>{originLabel(origin)}</option>)}
            </select>
          </div>
          <div>
            <Label className="sr-only" htmlFor="filter-currency">Currency</Label>
            <select id="filter-currency" aria-label="Filter by currency" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.currency} onChange={(event) => changeFilter('currency', event.target.value)}>
              <option value="">All currencies</option>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </div>
          <div>
            <Label className="sr-only" htmlFor="filter-price-status">Price status</Label>
            <select id="filter-price-status" aria-label="Filter by selected price status" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.priceStatus} onChange={(event) => changeFilter('priceStatus', event.target.value)}>
              <option value="">Any {fields.find((item) => item.value === field)?.label || 'price'}</option>
              <option value="priced">Has {fields.find((item) => item.value === field)?.label || 'price'}</option>
              <option value="unpriced">Missing {fields.find((item) => item.value === field)?.label || 'price'}</option>
            </select>
          </div>
          <div className="sm:col-span-2 xl:col-span-6 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="h-4 w-4" />Filters update the list immediately. Select all filtered to apply a change to this group.</p>
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters}><RotateCcw className="h-4 w-4" />Reset filters</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <p className="font-medium">No matching vehicles</p>
            <p className="mt-1 text-sm text-muted-foreground">Change or reset the search and filters.</p>
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-auto rounded-lg border">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead className="bg-card shadow-sm">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="sticky left-0 top-0 z-20 bg-card p-3"><input type="checkbox" aria-label="Select all filtered vehicles" checked={allFilteredSelected} onChange={toggleAllFiltered} /></th>
                  <th className="sticky top-0 z-10 bg-card p-3">Vehicle</th><th className="sticky top-0 z-10 bg-card p-3">Stock country</th><th className="sticky top-0 z-10 bg-card p-3">Chassis</th><th className="sticky top-0 z-10 bg-card p-3">Currency</th>
                  {fields.map((item) => <th key={item.value} className="sticky top-0 z-10 bg-card p-3 text-right">{item.label}</th>)}
                </tr>
              </thead>
              <tbody>{filteredRows.map((row) => (
                <tr className="border-b last:border-0 hover:bg-secondary/30" key={row.id}>
                  <td className="sticky left-0 bg-card p-3"><input type="checkbox" aria-label={'Select ' + row.title} checked={selected.includes(row.id)} onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} /></td>
                  <td className="p-3"><span className="font-medium">{row.title}</span><span className="block text-xs text-muted-foreground">{[row.year, row.make, row.model].filter(Boolean).join(' ')}</span></td>
                  <td className="p-3">{row.stock_origin ? originLabel(row.stock_origin) : '—'}</td>
                  <td className="p-3">{row.chassis_number || '—'}</td>
                  <td className="p-3">{row.currency || 'USD'}</td>
                  {fields.map((item) => <td key={item.value} className="p-3 text-right tabular-nums">{money(row[item.value], row.currency || 'USD')}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  </div>;
}

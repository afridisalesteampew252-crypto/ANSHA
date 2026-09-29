'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CheckSquare, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canManageReceivables } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole } from '@/lib/types';

type Vehicle = { id: string; title: string; make: string; model: string; year: number | null; chassis_number: string | null; currency: string; price: number | null; price_fob: number | null; price_cf: number | null; price_cif: number | null };
const PAGE_SIZE = 1000;
const fields = [
  { value: 'price', label: 'Main price' },
  { value: 'price_fob', label: 'FOB' },
  { value: 'price_cf', label: 'C&F' },
  { value: 'price_cif', label: 'CIF' },
] as const;

export default function BulkVehiclePricesPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [field, setField] = useState<(typeof fields)[number]['value']>('price_fob');
  const [mode, setMode] = useState('set');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const canWrite = canManageReceivables(role);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile } = await supabase.from('admin_profiles').select('role').eq('id', user.id).maybeSingle();
    setRole((profile?.role as AdminRole) || null);
    let request = supabase.from('vehicles').select('id,title,make,model,year,chassis_number,currency,price,price_fob,price_cf,price_cif').order('created_at', { ascending: false }).range(0, PAGE_SIZE - 1);
    if (query.trim()) request = request.or('title.ilike.%' + query.trim().replace(/[,%()]/g, '') + '%,make.ilike.%' + query.trim().replace(/[,%()]/g, '') + '%,model.ilike.%' + query.trim().replace(/[,%()]/g, '') + '%,chassis_number.ilike.%' + query.trim().replace(/[,%()]/g, '') + '%');
    const { data, error } = await request;
    if (error) toast.error(error.message);
    setRows((data || []) as Vehicle[]);
    setLoading(false);
  }, [query]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);

  const selectedRows = useMemo(() => rows.filter((row) => selected.includes(row.id)), [rows, selected]);

  const toggleAll = () => setSelected((current) => current.length === rows.length ? [] : rows.map((row) => row.id));

  const apply = async () => {
    const amount = Number(value);
    if (!canWrite || !selected.length) return toast.error('Select one or more vehicles first.');
    if (!Number.isFinite(amount) || amount < 0) return toast.error('Enter a valid amount or percentage.');
    setBusy(true);
    const { data, error } = await supabase.rpc('bulk_update_vehicle_prices', {
      vehicle_ids: selected, price_field: field, adjustment_mode: mode, adjustment_value: amount,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Updated ' + String(data ?? selected.length) + ' vehicle prices.');
    setSelected([]);
    await load();
  };

  return <div className="mx-auto max-w-7xl space-y-6">
    <div><h1 className="text-2xl font-bold">Bulk vehicle prices</h1><p className="mt-1 text-sm text-muted-foreground">Select a group of vehicles and set or adjust their main, FOB, C&F, or CIF price in one action.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5" />Price update</CardTitle><CardDescription>Only selected vehicles are changed. Percentage reductions stop at zero. Vehicles with no existing price stay blank when applying a percentage.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5"><Label htmlFor="price-field">Price type</Label><select id="price-field" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={field} onChange={(event) => setField(event.target.value as typeof field)}>{fields.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="price-mode">Action</Label><select id="price-mode" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={mode} onChange={(event) => setMode(event.target.value)}><option value="set">Set to amount</option><option value="increase_percent">Increase by percent</option><option value="decrease_percent">Decrease by percent</option></select></div>
        <div className="space-y-1.5"><Label htmlFor="price-value">{mode === 'set' ? 'New price' : 'Percentage'}</Label><Input id="price-value" type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder={mode === 'set' ? 'e.g. 12500' : 'e.g. 5'} /></div>
        <div className="flex items-end"><Button onClick={() => void apply()} disabled={!canWrite || busy || selected.length === 0 || !value} className="w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}{busy ? 'Updating…' : 'Apply to ' + selected.length + ' selected'}</Button></div>
      </CardContent>{!canWrite && <p className="px-6 pb-5 text-sm text-muted-foreground">Your role can view prices, but cannot change them.</p>}
    </Card>
    <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><CardTitle>Choose vehicles ({rows.length} shown{selected.length ? ', ' + selected.length + ' selected' : ''})</CardTitle><CardDescription>Select the current results, or tick individual vehicles below.</CardDescription></div><div className="relative sm:w-80"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search title, make, model or chassis" value={query} onChange={(event) => { setSelected([]); setQuery(event.target.value); }} /></div></div></CardHeader>
      <CardContent className="overflow-x-auto">{loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No matching vehicles found.</p> : <table className="w-full min-w-[860px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3"><input type="checkbox" aria-label="Select all shown vehicles" checked={selected.length === rows.length && rows.length > 0} onChange={toggleAll} /></th><th className="p-3">Vehicle</th><th className="p-3">Chassis</th><th className="p-3">Currency</th>{fields.map((item) => <th key={item.value} className="p-3 text-right">{item.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr className="border-b last:border-0" key={row.id}><td className="p-3"><input type="checkbox" aria-label={'Select ' + row.title} checked={selected.includes(row.id)} onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} /></td><td className="p-3"><span className="font-medium">{row.title}</span><span className="block text-xs text-muted-foreground">{[row.year, row.make, row.model].filter(Boolean).join(' ')}</span></td><td className="p-3">{row.chassis_number || '—'}</td><td className="p-3">{row.currency || 'USD'}</td>{fields.map((item) => <td key={item.value} className="p-3 text-right tabular-nums">{row[item.value] == null ? '—' : Number(row[item.value]).toLocaleString()}</td>)}</tr>)}</tbody></table>}</CardContent>
    </Card>
  </div>;
}

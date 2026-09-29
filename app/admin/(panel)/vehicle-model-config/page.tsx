'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Car, Filter, Loader2, Pencil, Plus, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canManageReceivables } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole } from '@/lib/types';

type ModelSpec = {
  id: string; make: string; model: string; length_m: number | null;
  width_m: number | null; height_m: number | null; volume_m3: number;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const empty = () => ({ make: '', model: '', length: '', width: '', height: '', volume: '' });

export default function VehicleModelConfigPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [rows, setRows] = useState<ModelSpec[]>([]);
  const [form, setForm] = useState(empty());
  const [editing, setEditing] = useState<ModelSpec | null>(null);
  const [query, setQuery] = useState('');
  const [makeFilter, setMakeFilter] = useState('');
  const [dimensionFilter, setDimensionFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const canWrite = canManageReceivables(role);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile } = await supabase.from('admin_profiles').select('role').eq('id', user.id).maybeSingle();
    setRole((profile?.role as AdminRole) || null);
    const { data, error } = await supabase.from('vehicle_model_specs').select('*').order('make').order('model');
    if (error) toast.error(error.message);
    setRows((data || []) as ModelSpec[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const makes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.make).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !term || (row.make + ' ' + row.model).toLowerCase().includes(term);
      const hasDimensions = row.length_m != null && row.width_m != null && row.height_m != null;
      return matchesSearch
        && (!makeFilter || row.make === makeFilter)
        && (dimensionFilter === 'all' || (dimensionFilter === 'complete' ? hasDimensions : !hasDimensions));
    });
  }, [rows, query, makeFilter, dimensionFilter]);
  const resetFilters = () => { setQuery(''); setMakeFilter(''); setDimensionFilter('all'); };

  const reset = () => { setEditing(null); setForm(empty()); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    const make = form.make.trim();
    const model = form.model.trim();
    const length = Number(form.length);
    const width = Number(form.width);
    const height = Number(form.height);
    const enteredVolume = Number(form.volume);
    const hasDimensions = [length, width, height].every((value) => Number.isFinite(value) && value > 0);
    const volume = Number.isFinite(enteredVolume) && enteredVolume > 0 ? enteredVolume : (hasDimensions ? length * width * height : 0);
    if (!make || !model || !normalize(make) || !normalize(model)) return toast.error('Enter a valid make and model.');
    if (!Number.isFinite(volume) || volume <= 0) return toast.error('Enter an M³ volume or all three dimensions.');
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      make, model, normalized_make: normalize(make), normalized_model: normalize(model),
      length_m: hasDimensions ? length : null, width_m: hasDimensions ? width : null,
      height_m: hasDimensions ? height : null, volume_m3: Number(volume.toFixed(3)),
      created_by: user?.id || null,
    };
    const result = editing
      ? await supabase.from('vehicle_model_specs').update(payload).eq('id', editing.id)
      : await supabase.from('vehicle_model_specs').upsert(payload, { onConflict: 'normalized_make,normalized_model' });
    setBusy(false);
    if (result.error) return toast.error(result.error.message);
    toast.success('Saved make/model freight volume.');
    reset();
    await load();
  };

  const startEdit = (row: ModelSpec) => {
    setEditing(row);
    setForm({
      make: row.make, model: row.model, length: row.length_m == null ? '' : String(row.length_m),
      width: row.width_m == null ? '' : String(row.width_m), height: row.height_m == null ? '' : String(row.height_m),
      volume: String(row.volume_m3),
    });
  };

  const remove = async (row: ModelSpec) => {
    if (!canWrite || !window.confirm('Delete the saved M³ default for ' + row.make + ' ' + row.model + '?')) return;
    const { error } = await supabase.from('vehicle_model_specs').delete().eq('id', row.id);
    if (error) return toast.error(error.message);
    toast.success('Saved M³ default deleted.');
    await load();
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Vehicle make/model M³</h1><p className="mt-1 text-sm text-muted-foreground">Save each vehicle size once. New manual entries and spreadsheet imports use the matching make/model volume automatically.</p></div>
      <Button variant="outline" onClick={reset}><Plus className="h-4 w-4" />New make/model</Button>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Car className="h-5 w-5" />{editing ? 'Edit saved size' : 'Add a saved size'}</CardTitle><CardDescription>Enter M³ directly, or enter dimensions in metres to calculate it.</CardDescription></CardHeader>
      <CardContent><form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[['make', 'Make'], ['model', 'Model'], ['length', 'Length (m)'], ['width', 'Width (m)'], ['height', 'Height (m)'], ['volume', 'M³ volume']].map(([key, label]) =>
          <div key={key} className="space-y-1.5"><Label htmlFor={'spec-' + key}>{label}</Label><Input id={'spec-' + key} type={key === 'make' || key === 'model' ? 'text' : 'number'} min={key === 'make' || key === 'model' ? undefined : '0.001'} step={key === 'make' || key === 'model' ? undefined : '0.001'} value={form[key as keyof typeof form]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} required={key === 'make' || key === 'model'} /></div>
        )}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={busy || !canWrite}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? 'Saving…' : editing ? 'Update saved size' : 'Save make/model size'}</Button>{editing && <Button type="button" variant="outline" onClick={reset}><X className="h-4 w-4" />Cancel edit</Button>}</div>
      </form>{!canWrite && <p className="mt-3 text-sm text-muted-foreground">You can view these defaults, but your role cannot change them.</p>}</CardContent>
    </Card>
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Saved vehicle sizes ({visibleRows.length} of {rows.length})</CardTitle>
            <CardDescription>Matches ignore case and punctuation while keeping meaningful spaces in model names.</CardDescription>
          </div>
          <div className="relative sm:max-w-xs">
            <Label htmlFor="model-spec-search" className="sr-only">Search make or model</Label>
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input id="model-spec-search" className="pl-9" placeholder="Search make or model" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="sr-only" htmlFor="model-spec-make-filter">Filter by make</Label>
            <select id="model-spec-make-filter" aria-label="Filter by make" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={makeFilter} onChange={(event) => setMakeFilter(event.target.value)}>
              <option value="">All makes</option>{makes.map((make) => <option key={make} value={make}>{make}</option>)}
            </select>
          </div>
          <div>
            <Label className="sr-only" htmlFor="model-spec-dimensions-filter">Filter by dimension status</Label>
            <select id="model-spec-dimensions-filter" aria-label="Filter by dimension status" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={dimensionFilter} onChange={(event) => setDimensionFilter(event.target.value)}>
              <option value="all">All dimension statuses</option>
              <option value="complete">Dimensions entered</option>
              <option value="missing">M³ only, no dimensions</option>
            </select>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="h-4 w-4" />Showing {visibleRows.length} of {rows.length} saved sizes.</p>
          <div className="flex justify-start sm:justify-end"><Button type="button" size="sm" variant="ghost" onClick={resetFilters}><RotateCcw className="h-4 w-4" />Reset filters</Button></div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <p className="font-medium">No matching saved sizes</p>
            <p className="mt-1 text-sm text-muted-foreground">Change or reset the search and filters.</p>
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-auto rounded-lg border">
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="sticky left-0 top-0 z-20 bg-card p-3">Make</th>
                  <th className="sticky top-0 z-10 bg-card p-3">Model</th>
                  <th className="sticky top-0 z-10 bg-card p-3">Dimensions (m)</th>
                  <th className="sticky top-0 z-10 bg-card p-3">M³</th>
                  <th className="sticky top-0 z-10 bg-card p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>{visibleRows.map((row) => (
                <tr className="border-b last:border-0 hover:bg-secondary/30" key={row.id}>
                  <td className="sticky left-0 bg-card p-3 font-medium">{row.make}</td>
                  <td className="p-3">{row.model}</td>
                  <td className="p-3">{row.length_m != null && row.width_m != null && row.height_m != null ? [row.length_m, row.width_m, row.height_m].join(' × ') : '—'}</td>
                  <td className="p-3 font-semibold tabular-nums">{Number(row.volume_m3).toFixed(3)}</td>
                  <td className="p-3 text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={!canWrite} onClick={() => startEdit(row)}><Pencil className="h-4 w-4" />Edit</Button><Button size="sm" variant="destructive" disabled={!canWrite} onClick={() => void remove(row)}><Trash2 className="h-4 w-4" />Delete</Button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  </div>;
}

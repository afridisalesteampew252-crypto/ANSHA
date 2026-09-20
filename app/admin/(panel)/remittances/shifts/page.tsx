'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, CheckCircle2, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { RemittanceSubNav } from '@/components/admin/remittance-sub-nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canManageReceivables } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, RemittanceOffice, RemittanceShift } from '@/lib/types';

export default function RemittanceShiftsPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [rows, setRows] = useState<RemittanceShift[]>([]);
  const [offices, setOffices] = useState<RemittanceOffice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unknownCount, setUnknownCount] = useState(0);
  const [name, setName] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [hoursLabel, setHoursLabel] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [editing, setEditing] = useState<RemittanceShift | null>(null);
  const finance = canManageReceivables(role);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
    }
    const [listRes, officeRes, unknownRes] = await Promise.all([
      supabase.from('remittance_shifts').select('*').order('sort_order').order('name'),
      supabase.from('remittance_offices').select('*').order('sort_order').order('name'),
      supabase.rpc('count_unknown_remittances'),
    ]);
    if (listRes.error) toast.error(listRes.error.message);
    setRows((listRes.data || []) as RemittanceShift[]);
    setOffices((officeRes.data || []) as RemittanceOffice[]);
    setUnknownCount(Number(unknownRes.data || 0));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const officeName = useMemo(() => {
    const map = new Map(offices.map((o) => [o.id, o.name]));
    return (id: string | null) => (id ? map.get(id) || '—' : 'Any office');
  }, [offices]);

  const reset = () => {
    setEditing(null);
    setName('');
    setOfficeId('');
    setHoursLabel('');
    setSortOrder('0');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!finance) return;
    const trimmed = name.trim();
    if (!trimmed) return toast.error('Shift name is required.');
    setBusy(true);
    const payload = {
      name: trimmed,
      office_id: officeId || null,
      hours_label: hoursLabel.trim() || null,
      sort_order: Number(sortOrder) || 0,
    };
    const result = editing
      ? await supabase.from('remittance_shifts').update(payload).eq('id', editing.id)
      : await supabase.from('remittance_shifts').insert({
          ...payload,
          created_by: (await supabase.auth.getUser()).data.user?.id || null,
        });
    setBusy(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(editing ? 'Shift updated.' : 'Shift added.');
    reset();
    await load();
  };

  const toggleActive = async (row: RemittanceShift) => {
    if (!finance) return;
    const { error } = await supabase.from('remittance_shifts').update({ is_active: !row.is_active }).eq('id', row.id);
    if (error) return toast.error(error.message);
    await load();
  };

  const remove = async (row: RemittanceShift) => {
    if (!finance || !window.confirm(`Delete shift "${row.name}"?`)) return;
    const { error } = await supabase.from('remittance_shifts').delete().eq('id', row.id);
    if (error) return toast.error(error.message);
    toast.success('Deleted.');
    if (editing?.id === row.id) reset();
    await load();
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!finance) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">Shift masters are finance-only.</p>
        <Button asChild><Link href="/admin/remittances/mine">My remittances</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Remittances</p>
        <h1 className="text-2xl font-black tracking-tight">Shifts</h1>
        <p className="text-sm text-muted-foreground">Desk shifts optionally tied to an office (e.g. Morning 9–13).</p>
        <RemittanceSubNav canManageFinance unknownCount={unknownCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{editing ? 'Edit shift' : 'Add shift'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="shift-name">Name *</Label>
              <Input id="shift-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shift-office">Office (optional)</Label>
              <select
                id="shift-office"
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Any office</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shift-hours">Hours / label</Label>
              <Input id="shift-hours" value={hoursLabel} onChange={(e) => setHoursLabel(e.target.value)} placeholder="09:00–13:00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shift-sort">Sort</Label>
              <Input id="shift-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editing ? 'Update' : 'Add'}</Button>
              {editing ? <Button type="button" variant="outline" onClick={reset}>Cancel</Button> : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">All shifts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div>
                <p className="font-semibold">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  {officeName(row.office_id)}
                  {row.hours_label ? ` · ${row.hours_label}` : ''}
                  {row.is_active ? '' : ' · Inactive'}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditing(row);
                    setName(row.name);
                    setOfficeId(row.office_id || '');
                    setHoursLabel(row.hours_label || '');
                    setSortOrder(String(row.sort_order));
                  }}
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void toggleActive(row)} aria-label="Toggle active">
                  {row.is_active ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(row)} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No shifts yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

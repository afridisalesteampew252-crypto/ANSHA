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
import type { AdminRole, RemittanceOffice } from '@/lib/types';

export default function RemittanceOfficesPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [rows, setRows] = useState<RemittanceOffice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unknownCount, setUnknownCount] = useState(0);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [editing, setEditing] = useState<RemittanceOffice | null>(null);
  const finance = canManageReceivables(role);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
    }
    const [listRes, unknownRes] = await Promise.all([
      supabase.from('remittance_offices').select('*').order('sort_order').order('name'),
      supabase.rpc('count_unknown_remittances'),
    ]);
    if (listRes.error) toast.error(listRes.error.message);
    setRows((listRes.data || []) as RemittanceOffice[]);
    setUnknownCount(Number(unknownRes.data || 0));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setEditing(null);
    setName('');
    setCode('');
    setSortOrder('0');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!finance) return;
    const trimmed = name.trim();
    if (!trimmed) return toast.error('Office name is required.');
    setBusy(true);
    const payload = {
      name: trimmed,
      code: code.trim() || null,
      sort_order: Number(sortOrder) || 0,
    };
    const result = editing
      ? await supabase.from('remittance_offices').update(payload).eq('id', editing.id)
      : await supabase.from('remittance_offices').insert({
          ...payload,
          created_by: (await supabase.auth.getUser()).data.user?.id || null,
        });
    setBusy(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(editing ? 'Office updated.' : 'Office added.');
    reset();
    await load();
  };

  const toggleActive = async (row: RemittanceOffice) => {
    if (!finance) return;
    const { error } = await supabase.from('remittance_offices').update({ is_active: !row.is_active }).eq('id', row.id);
    if (error) return toast.error(error.message);
    await load();
  };

  const remove = async (row: RemittanceOffice) => {
    if (!finance || !window.confirm(`Delete office "${row.name}"?`)) return;
    const { error } = await supabase.from('remittance_offices').delete().eq('id', row.id);
    if (error) return toast.error(error.message);
    toast.success('Deleted.');
    if (editing?.id === row.id) reset();
    await load();
  };

  const activeCount = useMemo(() => rows.filter((r) => r.is_active).length, [rows]);

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
        <p className="text-sm text-muted-foreground">Office masters are finance-only.</p>
        <Button asChild><Link href="/admin/remittances/mine">My remittances</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Remittances</p>
        <h1 className="text-2xl font-black tracking-tight">Office picklist</h1>
        <p className="text-sm text-muted-foreground">
          Lightweight list used when assigning an office on a user profile. Remittance dashboard reports by that office — this is not HR master data.
        </p>
        <RemittanceSubNav canManageFinance unknownCount={unknownCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{editing ? 'Edit office' : 'Add office'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="office-name">Name *</Label>
              <Input id="office-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="office-code">Code</Label>
              <Input id="office-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="DXB" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="office-sort">Sort</Label>
              <Input id="office-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
            <div className="flex gap-2 sm:col-span-3">
              <Button disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editing ? 'Update' : 'Add'}</Button>
              {editing ? <Button type="button" variant="outline" onClick={reset}>Cancel</Button> : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">All offices ({activeCount} active)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div>
                <p className="font-semibold">{row.name}{row.code ? ` · ${row.code}` : ''}</p>
                <p className="text-xs text-muted-foreground">{row.is_active ? 'Active' : 'Inactive'}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => { setEditing(row); setName(row.name); setCode(row.code || ''); setSortOrder(String(row.sort_order)); }} aria-label="Edit">
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
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No offices yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isOpsRole } from '@/lib/admin-rbac';
import {
  EXPORT_MASTER_KIND_LABELS,
  EXPORT_MASTER_KINDS,
  type ExportMasterKind,
  type ExportMasterOption,
} from '@/lib/export-masters';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole } from '@/lib/types';

export default function ConfigurationPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [kind, setKind] = useState<ExportMasterKind>('destination_country');
  const [rows, setRows] = useState<ExportMasterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [editing, setEditing] = useState<ExportMasterOption | null>(null);
  const canWrite = isOpsRole(role);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: { session } }, listRes] = await Promise.all([
      supabase.auth.getSession(),
      supabase
        .from('export_master_options')
        .select('*')
        .eq('kind', kind)
        .order('sort_order')
        .order('name'),
    ]);
    if (session) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
    }
    if (listRes.error) toast.error(listRes.error.message);
    setRows((listRes.data || []) as ExportMasterOption[]);
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setCode('');
    setSortOrder('0');
  };

  const startEdit = (row: ExportMasterOption) => {
    setEditing(row);
    setName(row.name);
    setCode(row.code || '');
    setSortOrder(String(row.sort_order ?? 0));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required.');
      return;
    }
    setBusy(true);
    const payload = {
      kind,
      name: trimmed,
      code: code.trim() || null,
      sort_order: Number(sortOrder) || 0,
      updated_at: new Date().toISOString(),
    };
    const result = editing
      ? await supabase.from('export_master_options').update(payload).eq('id', editing.id)
      : await supabase.from('export_master_options').insert({
          ...payload,
          created_by: (await supabase.auth.getUser()).data.user?.id || null,
        });
    setBusy(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(editing ? 'Updated.' : 'Added.');
    resetForm();
    await load();
  };

  const toggleActive = async (row: ExportMasterOption) => {
    if (!canWrite) return;
    const { error } = await supabase
      .from('export_master_options')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) return toast.error(error.message);
    await load();
  };

  const remove = async (row: ExportMasterOption) => {
    if (!canWrite || !window.confirm(`Delete "${row.name}"?`)) return;
    const { error } = await supabase.from('export_master_options').delete().eq('id', row.id);
    if (error) return toast.error(error.message);
    toast.success('Deleted.');
    if (editing?.id === row.id) resetForm();
    await load();
  };

  const activeCount = useMemo(() => rows.filter((r) => r.is_active).length, [rows]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Configuration</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight">
          <Settings2 className="h-6 w-6" />
          Export masters
        </h1>
        <p className="text-sm text-muted-foreground">
          Destination countries, ports, vessels, and voyages used by export shipments. Select from these lists when
          booking — not free-text only.
        </p>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Master lists">
        {EXPORT_MASTER_KINDS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setKind(item);
              resetForm();
            }}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
              kind === item ? 'border-accent bg-accent text-white' : 'bg-card hover:border-accent/40'
            }`}
          >
            {EXPORT_MASTER_KIND_LABELS[item]}
          </button>
        ))}
      </nav>

      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editing ? 'Edit' : 'Add'} {EXPORT_MASTER_KIND_LABELS[kind].toLowerCase()}</CardTitle>
            <CardDescription>Names must be unique within this list.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-4" onSubmit={(e) => void save(e)}>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cfg-name">Name</Label>
                <Input id="cfg-name" required value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-code">Code (optional)</Label>
                <Input id="cfg-code" value={code} onChange={(e) => setCode(e.target.value)} disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-sort">Sort</Label>
                <Input id="cfg-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} disabled={busy} />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-4">
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editing ? 'Save' : 'Add'}
                </Button>
                {editing ? (
                  <Button type="button" variant="ghost" disabled={busy} onClick={resetForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{EXPORT_MASTER_KIND_LABELS[kind]}</CardTitle>
          <CardDescription>
            {loading ? 'Loading…' : `${activeCount} active · ${rows.length} total`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className={`font-medium ${row.is_active ? '' : 'text-muted-foreground line-through'}`}>{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.code ? `Code ${row.code} · ` : ''}
                    Sort {row.sort_order}
                    {row.is_active ? '' : ' · inactive'}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex items-center gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => void toggleActive(row)}>
                      {row.is_active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => startEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => void remove(row)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

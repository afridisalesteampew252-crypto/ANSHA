'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, CheckCircle2, Loader2, Pencil, Plus, Search, Settings2, Trash2 } from 'lucide-react';
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
import { matchesQuery } from '@/lib/matches-query';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole } from '@/lib/types';
import { cn } from '@/lib/utils';

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
  const [listQuery, setListQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
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

  useEffect(() => {
    setListQuery('');
  }, [kind]);

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!showInactive && !row.is_active) return false;
      return matchesQuery(listQuery, [row.name, row.code, row.sort_order]);
    });
  }, [rows, listQuery, showInactive]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Configuration</p>
        <h1 className="flex items-center gap-2.5 text-2xl font-black tracking-tight sm:text-[1.75rem]">
          <Settings2 className="h-6 w-6 shrink-0 text-accent" />
          Export masters
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Destination countries, ports, vessels, and voyages used by export shipments. Select from these
          lists when booking — not free-text only.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Country import policies</CardTitle>
          <CardDescription>Edit the age limits, destination ports, transit times, vessel schedules, shipping lines, and inspection notes shown to customers.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/configuration/country-policies">Manage country policies</Link>
          </Button>
        </CardContent>
      </Card>

      <nav
        className="flex flex-wrap gap-2"
        aria-label="Master lists"
      >
        {EXPORT_MASTER_KINDS.map((item) => {
          const active = kind === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => {
                setKind(item);
                resetForm();
              }}
              className={cn(
                'min-h-10 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'border-accent bg-accent text-accent-foreground shadow-sm'
                  : 'border-border/80 bg-card text-foreground hover:border-accent/40 hover:bg-secondary/40'
              )}
              aria-current={active ? 'page' : undefined}
            >
              {EXPORT_MASTER_KIND_LABELS[item]}
            </button>
          );
        })}
      </nav>

      {canWrite ? (
        <Card className="overflow-hidden">
          <CardHeader className="space-y-1.5 pb-4">
            <CardTitle className="text-lg">
              {editing ? 'Edit' : 'Add'} {EXPORT_MASTER_KIND_LABELS[kind].toLowerCase()}
            </CardTitle>
            <CardDescription>Names must be unique within this list.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid grid-cols-1 gap-4 sm:grid-cols-12"
              onSubmit={(e) => void save(e)}
            >
              <div className="space-y-2 sm:col-span-6">
                <Label htmlFor="cfg-name">Name</Label>
                <Input
                  id="cfg-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  placeholder="e.g. Afghanistan"
                />
              </div>
              <div className="space-y-2 sm:col-span-4">
                <Label htmlFor="cfg-code">Code (optional)</Label>
                <Input
                  id="cfg-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={busy}
                  placeholder="ISO / short code"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cfg-sort">Sort</Label>
                <Input
                  id="cfg-sort"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-12">
                <Button type="submit" disabled={busy} className="min-h-10">
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : editing ? (
                    <Pencil className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {editing ? 'Save changes' : 'Add'}
                </Button>
                {editing ? (
                  <Button type="button" variant="ghost" disabled={busy} onClick={resetForm} className="min-h-10">
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="sticky top-0 z-10 space-y-3 border-b border-border/70 bg-card/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-lg">{EXPORT_MASTER_KIND_LABELS[kind]}</CardTitle>
              <CardDescription className="mt-1">
                {loading
                  ? 'Loading…'
                  : `${activeCount} active · ${rows.length} total${
                      listQuery.trim() || !showInactive ? ` · ${filteredRows.length} shown` : ''
                    }`}
              </CardDescription>
            </div>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-[hsl(var(--accent))]"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive
            </label>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder={`Search ${EXPORT_MASTER_KIND_LABELS[kind].toLowerCase()}…`}
              className="h-10 pl-9"
              aria-label={`Filter ${EXPORT_MASTER_KIND_LABELS[kind]} list`}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? 'No entries yet.' : 'No matches for this filter.'}
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {filteredRows.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 sm:px-6',
                    !row.is_active && 'bg-muted/20'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-sm font-semibold leading-snug',
                        !row.is_active && 'text-muted-foreground line-through'
                      )}
                    >
                      {row.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {row.code ? `Code ${row.code} · ` : ''}
                      Sort {row.sort_order}
                      {row.is_active ? '' : ' · inactive'}
                    </p>
                  </div>
                  {canWrite ? (
                    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => void toggleActive(row)}
                        title={row.is_active ? 'Disable' : 'Enable'}
                      >
                        {row.is_active ? (
                          <Ban className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden sm:inline">{row.is_active ? 'Disable' : 'Enable'}</span>
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9"
                        onClick={() => startEdit(row)}
                        aria-label={`Edit ${row.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-destructive hover:text-destructive"
                        onClick={() => void remove(row)}
                        aria-label={`Delete ${row.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, Loader2, Pencil, Plus, Search, Ship, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isOpsRole } from '@/lib/admin-rbac';
import { matchesQuery } from '@/lib/matches-query';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, ShippingCompany } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZES = [10, 25, 50, 100] as const;

export default function ShippingCompaniesPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [rows, setRows] = useState<ShippingCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [vesselName, setVesselName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [editing, setEditing] = useState<ShippingCompany | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const canWrite = isOpsRole(role);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: { session } }, listRes] = await Promise.all([
      supabase.auth.getSession(),
      supabase
        .from('shipping_companies')
        .select('*')
        .order('sort_order')
        .order('company_name')
        .order('vessel_name'),
    ]);
    if (session) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
    }
    if (listRes.error) toast.error(listRes.error.message);
    setRows((listRes.data || []) as ShippingCompany[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setCompanyName('');
    setVesselName('');
    setSortOrder('0');
    setFormOpen(false);
  };

  const openAdd = () => {
    setEditing(null);
    setCompanyName('');
    setVesselName('');
    setSortOrder('0');
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startEdit = (row: ShippingCompany) => {
    setEditing(row);
    setCompanyName(row.company_name);
    setVesselName(row.vessel_name);
    setSortOrder(String(row.sort_order ?? 0));
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    const company = companyName.trim();
    const vessel = vesselName.trim();
    if (!company) {
      toast.error('Shipping company is required.');
      return;
    }
    if (!vessel) {
      toast.error('Vessel name is required.');
      return;
    }
    setBusy(true);
    const payload = {
      company_name: company,
      vessel_name: vessel,
      sort_order: Number(sortOrder) || 0,
      updated_at: new Date().toISOString(),
    };
    const result = editing
      ? await supabase.from('shipping_companies').update(payload).eq('id', editing.id)
      : await supabase.from('shipping_companies').insert({
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

  const toggleActive = async (row: ShippingCompany) => {
    if (!canWrite) return;
    const { error } = await supabase
      .from('shipping_companies')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) return toast.error(error.message);
    await load();
  };

  const remove = async (row: ShippingCompany) => {
    if (!canWrite || !window.confirm(`Delete "${row.company_name} / ${row.vessel_name}"?`)) return;
    const { error } = await supabase.from('shipping_companies').delete().eq('id', row.id);
    if (error) return toast.error(error.message);
    toast.success('Deleted.');
    if (editing?.id === row.id) resetForm();
    await load();
  };

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!showInactive && !row.is_active) return false;
      return matchesQuery(listQuery, [row.company_name, row.vessel_name, row.sort_order, row.notes]);
    });
  }, [rows, listQuery, showInactive]);

  useEffect(() => {
    setPage(1);
  }, [listQuery, showInactive, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const pageNumbers = useMemo(() => {
    const maxButtons = 7;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = new Set<number>([1, totalPages, currentPage]);
    for (let d = 1; pages.size < maxButtons && d < totalPages; d += 1) {
      if (currentPage - d >= 1) pages.add(currentPage - d);
      if (pages.size >= maxButtons) break;
      if (currentPage + d <= totalPages) pages.add(currentPage + d);
    }
    return Array.from(pages).sort((a, b) => a - b);
  }, [currentPage, totalPages]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Configuration</p>
          <h1 className="flex items-center gap-2.5 text-2xl font-black tracking-tight sm:text-[1.75rem]">
            <Ship className="h-6 w-6 shrink-0 text-accent" />
            Shipping Companies — List
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Company and vessel pairings for export booking. One company can have many vessels (one row each).
          </p>
        </div>
        {canWrite ? (
          <Button type="button" className="min-h-10 shrink-0" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Add Shipping Company
          </Button>
        ) : null}
      </div>

      {canWrite && formOpen ? (
        <Card className="overflow-hidden">
          <CardHeader className="space-y-1.5 pb-4">
            <CardTitle className="text-lg">
              {editing ? 'Edit shipping company' : 'Add shipping company'}
            </CardTitle>
            <CardDescription>
              Company + vessel must be unique together. Add another row for a second vessel under the same company.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4 sm:grid-cols-12" onSubmit={(e) => void save(e)}>
              <div className="space-y-2 sm:col-span-5">
                <Label htmlFor="sc-company">Shipping company</Label>
                <Input
                  id="sc-company"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={busy}
                  placeholder="e.g. HAPAG LLOYD"
                />
              </div>
              <div className="space-y-2 sm:col-span-5">
                <Label htmlFor="sc-vessel">Vessel name</Label>
                <Input
                  id="sc-vessel"
                  required
                  value={vesselName}
                  onChange={(e) => setVesselName(e.target.value)}
                  disabled={busy}
                  placeholder="e.g. HAKATA VOYAGER"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sc-sort">Sort</Label>
                <Input
                  id="sc-sort"
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
                <Button type="button" variant="ghost" disabled={busy} onClick={resetForm} className="min-h-10">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="sticky top-0 z-10 space-y-3 border-b border-border/70 bg-card/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-lg">Shipping companies</CardTitle>
              <CardDescription className="mt-1">
                {loading
                  ? 'Loading…'
                  : `Total Shipping Companys: ${filteredRows.length}${
                      listQuery.trim() || !showInactive ? ` · ${rows.length} in master` : ''
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
              placeholder="Search Shipping Company"
              className="h-10 pl-9"
              aria-label="Search shipping companies"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="sr-only">Rows per page</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-1">
              {pageNumbers.map((n, idx) => {
                const prev = pageNumbers[idx - 1];
                const showEllipsis = prev != null && n - prev > 1;
                return (
                  <span key={n} className="flex items-center gap-1">
                    {showEllipsis ? <span className="px-1 text-xs text-muted-foreground">…</span> : null}
                    <button
                      type="button"
                      onClick={() => setPage(n)}
                      className={cn(
                        'flex h-8 min-w-8 items-center justify-center rounded px-2 text-xs font-semibold',
                        n === currentPage
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-secondary'
                      )}
                      aria-current={n === currentPage ? 'page' : undefined}
                    >
                      {n}
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : pageRows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? 'No shipping companies yet.' : 'No matches for this filter.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/40 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 sm:px-6">Shipping company</th>
                    <th className="px-4 py-3 sm:px-6">Vessel name</th>
                    <th className="px-4 py-3 text-right sm:px-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {pageRows.map((row) => (
                    <tr key={row.id} className={cn(!row.is_active && 'bg-muted/20')}>
                      <td className="px-4 py-3 sm:px-6">
                        <p
                          className={cn(
                            'font-semibold',
                            !row.is_active && 'text-muted-foreground line-through'
                          )}
                        >
                          {row.company_name}
                        </p>
                        {!row.is_active ? (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">Inactive</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 sm:px-6">
                        <p className={cn(!row.is_active && 'text-muted-foreground line-through')}>
                          {row.vessel_name}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right sm:px-6">
                        {canWrite ? (
                          <div className="inline-flex items-center justify-end gap-0.5">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9"
                              onClick={() => void toggleActive(row)}
                              title={row.is_active ? 'Disable' : 'Enable'}
                              aria-label={row.is_active ? `Disable ${row.company_name}` : `Enable ${row.company_name}`}
                            >
                              {row.is_active ? (
                                <Ban className="h-3.5 w-3.5" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9"
                              onClick={() => startEdit(row)}
                              aria-label={`Edit ${row.company_name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-destructive hover:text-destructive"
                              onClick={() => void remove(row)}
                              aria-label={`Delete ${row.company_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

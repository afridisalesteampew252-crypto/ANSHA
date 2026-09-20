'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ExportMasterSelect } from '@/components/admin/export-master-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { isOpsRole } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, AuctionYard } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type FormState = {
  auction_name: string;
  port: string;
  yard: string;
  tentative_days: string;
  notes: string;
  sort_order: string;
};

const emptyForm = (): FormState => ({
  auction_name: '',
  port: '',
  yard: '',
  tentative_days: '0',
  notes: '',
  sort_order: '0',
});

function toForm(row: AuctionYard): FormState {
  return {
    auction_name: row.auction_name,
    port: row.port,
    yard: row.yard,
    tentative_days: String(row.tentative_days ?? 0),
    notes: row.notes || '',
    sort_order: String(row.sort_order ?? 0),
  };
}

function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('…');
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}

export default function ConfigurationYardsPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [rows, setRows] = useState<AuctionYard[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AuctionYard | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const canWrite = isOpsRole(role);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    const safeQuery = listQuery.trim().replace(/[,%()]/g, ' ');
    let request = supabase
      .from('auction_yards')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true })
      .order('auction_name', { ascending: true })
      .order('yard', { ascending: true });

    if (safeQuery) {
      request = request.or(
        `auction_name.ilike.%${safeQuery}%,port.ilike.%${safeQuery}%,yard.ilike.%${safeQuery}%`
      );
    }

    const from = (page - 1) * pageSize;
    const [{ data: { session } }, listRes] = await Promise.all([
      supabase.auth.getSession(),
      request.range(from, from + pageSize - 1),
    ]);

    if (session) {
      const { data: prof } = await supabase
        .from('admin_profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      setRole((prof?.role as AdminRole) || null);
    }

    if (listRes.error) toast.error(listRes.error.message);
    setRows((listRes.data || []) as AuctionYard[]);
    setTotalCount(listRes.count || 0);
    setLoading(false);
  }, [listQuery, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (row: AuctionYard) => {
    setEditing(row);
    setForm(toForm(row));
    setFormOpen(true);
  };

  const applySearch = () => {
    setPage(1);
    setListQuery(searchInput);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;

    const auction_name = form.auction_name.trim();
    const port = form.port.trim();
    const yard = form.yard.trim();
    const tentative_days = Number(form.tentative_days);
    const sort_order = Number(form.sort_order) || 0;

    if (!auction_name || !port || !yard) {
      toast.error('Auction name, port, and yard are required.');
      return;
    }
    if (!Number.isFinite(tentative_days) || tentative_days < 0) {
      toast.error('Tentative days must be a non-negative number.');
      return;
    }

    setBusy(true);
    const payload = {
      auction_name,
      port,
      yard,
      tentative_days: Math.floor(tentative_days),
      notes: form.notes.trim() || null,
      sort_order,
      updated_at: new Date().toISOString(),
    };

    const result = editing
      ? await supabase.from('auction_yards').update(payload).eq('id', editing.id)
      : await supabase.from('auction_yards').insert({
          ...payload,
          created_by: (await supabase.auth.getUser()).data.user?.id || null,
        });

    setBusy(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(editing ? 'Yard updated.' : 'Yard added.');
    resetForm();
    await load();
  };

  const remove = async (row: AuctionYard) => {
    if (!canWrite) return;
    if (!window.confirm(`Delete yard "${row.yard}" (${row.auction_name} / ${row.port})?`)) return;
    const { error } = await supabase.from('auction_yards').delete().eq('id', row.id);
    if (error) return toast.error(error.message);
    toast.success('Deleted.');
    if (editing?.id === row.id) resetForm();
    await load();
  };

  const pages = useMemo(() => pageWindow(page, totalPages), [page, totalPages]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            <span className="text-foreground">Configuration</span>
            <span className="font-normal text-muted-foreground"> | Yards — List</span>
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Auction yards with loading port and tentative days. Port values prefer export master
            loading ports.
          </p>
        </div>
        {canWrite ? (
          <Button type="button" onClick={openAdd} className="min-h-10 shrink-0 gap-1.5">
            <Plus className="h-4 w-4" />
            Add Yard
          </Button>
        ) : null}
      </div>

      {formOpen && canWrite ? (
        <Card className="overflow-hidden border-accent/30">
          <CardHeader className="space-y-1.5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">{editing ? 'Edit yard' : 'Add yard'}</CardTitle>
                <CardDescription>
                  Auction name + port + yard must be unique together.
                </CardDescription>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={resetForm} aria-label="Close form">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4 sm:grid-cols-12" onSubmit={(e) => void save(e)}>
              <div className="space-y-2 sm:col-span-4">
                <Label htmlFor="yard-auction">Auction name</Label>
                <Input
                  id="yard-auction"
                  required
                  value={form.auction_name}
                  onChange={(e) => setForm((f) => ({ ...f, auction_name: e.target.value }))}
                  disabled={busy}
                  placeholder="e.g. USS / TAA"
                />
              </div>
              <div className="sm:col-span-4">
                <ExportMasterSelect
                  id="yard-port"
                  kind="loading_port"
                  value={form.port}
                  onChange={(port) => setForm((f) => ({ ...f, port }))}
                  disabled={busy}
                  allowCustom
                />
              </div>
              <div className="space-y-2 sm:col-span-4">
                <Label htmlFor="yard-name">Yard</Label>
                <Input
                  id="yard-name"
                  required
                  value={form.yard}
                  onChange={(e) => setForm((f) => ({ ...f, yard: e.target.value }))}
                  disabled={busy}
                  placeholder="Yard / location name"
                />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="yard-days">Tentative days</Label>
                <Input
                  id="yard-days"
                  type="number"
                  min={0}
                  required
                  value={form.tentative_days}
                  onChange={(e) => setForm((f) => ({ ...f, tentative_days: e.target.value }))}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="yard-sort">Sort</Label>
                <Input
                  id="yard-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2 sm:col-span-7">
                <Label htmlFor="yard-notes">Notes (optional)</Label>
                <Textarea
                  id="yard-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  disabled={busy}
                  placeholder="Optional notes"
                />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-12">
                <Button type="submit" disabled={busy} className="min-h-10">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editing ? 'Save changes' : 'Add yard'}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={resetForm} className="min-h-10">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applySearch();
            }
          }}
          placeholder="Search Yard"
          className="h-11 pl-9 pr-24"
          aria-label="Search yards"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2"
          onClick={applySearch}
        >
          Search
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="whitespace-nowrap">Rows per page</span>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
              setPage(1);
            }}
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            Total Yards: <span className="text-foreground">{totalCount}</span>
          </p>
          <nav className="flex items-center gap-0.5" aria-label="Yards pagination">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pages.map((item, idx) =>
              item === '…' ? (
                <span key={`e-${idx}`} className="px-1 text-sm text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={item}
                  type="button"
                  size="icon"
                  variant={item === page ? 'default' : 'ghost'}
                  className={cn(
                    'h-8 w-8 text-xs',
                    item === page && 'bg-accent text-accent-foreground hover:bg-accent/90'
                  )}
                  disabled={loading}
                  onClick={() => setPage(item)}
                  aria-current={item === page ? 'page' : undefined}
                >
                  {item}
                </Button>
              )
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                {listQuery.trim() ? 'No yards match this search.' : 'No yards yet. Add the first yard.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-bold uppercase tracking-wide text-foreground">
                    Auction name
                  </TableHead>
                  <TableHead className="font-bold uppercase tracking-wide text-foreground">Port</TableHead>
                  <TableHead className="font-bold uppercase tracking-wide text-foreground">Yard</TableHead>
                  <TableHead className="font-bold uppercase tracking-wide text-foreground">
                    Tentative days
                  </TableHead>
                  <TableHead className="w-[7rem] text-right font-bold uppercase tracking-wide text-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className={!row.is_active ? 'bg-muted/20 opacity-70' : undefined}>
                    <TableCell className="font-medium">{row.auction_name}</TableCell>
                    <TableCell>{row.port}</TableCell>
                    <TableCell>{row.yard}</TableCell>
                    <TableCell>{row.tentative_days}</TableCell>
                    <TableCell className="text-right">
                      {canWrite ? (
                        <div className="flex justify-end gap-0.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEdit(row)}
                            aria-label={`Edit ${row.yard}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => void remove(row)}
                            aria-label={`Delete ${row.yard}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

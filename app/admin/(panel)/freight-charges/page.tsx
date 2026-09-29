'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Ship,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ExportMasterSelect } from '@/components/admin/export-master-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canManageReceivables, isManagerRole, isOpsRole } from '@/lib/admin-rbac';
import {
  formatFreightAmount,
  formatFreightRoute,
  type FreightCharge,
} from '@/lib/freight-charges';
import { matchesQuery } from '@/lib/matches-query';
import { supabase } from '@/lib/supabase/client';
import { SHIPMENT_MODE_LABELS, SHIPMENT_MODES, type ShipmentMode } from '@/lib/trade-terms';
import type { AdminRole, ShippingCompany } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZES = [10, 25, 50, 100] as const;
const CURRENCIES = ['USD', 'AED', 'EUR', 'JPY', 'GBP'] as const;

type FormState = {
  source_country: string;
  source_port: string;
  destination_country: string;
  destination_port: string;
  shipment_type: ShipmentMode;
  freight_charge: string;
  currency: string;
  shipping_company: string;
  contact_person: string;
  contact_number: string;
  email: string;
  website: string;
  notes: string;
  sort_order: string;
};

const emptyForm = (): FormState => ({
  source_country: '',
  source_port: '',
  destination_country: '',
  destination_port: '',
  shipment_type: 'roro',
  freight_charge: '',
  currency: 'USD',
  shipping_company: '',
  contact_person: '',
  contact_number: '',
  email: '',
  website: '',
  notes: '',
  sort_order: '0',
});

function formFromRow(row: FreightCharge): FormState {
  return {
    source_country: row.source_country,
    source_port: row.source_port || '',
    destination_country: row.destination_country,
    destination_port: row.destination_port || '',
    shipment_type: row.shipment_type,
    freight_charge: String(row.freight_charge ?? ''),
    currency: row.currency || 'USD',
    shipping_company: row.shipping_company || '',
    contact_person: row.contact_person || '',
    contact_number: row.contact_number || '',
    email: row.email || '',
    website: row.website || '',
    notes: row.notes || '',
    sort_order: String(row.sort_order ?? 0),
  };
}

export default function FreightChargesPage() {
  const formRef = useRef<HTMLDivElement>(null);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [rows, setRows] = useState<FreightCharge[]>([]);
  const [shippingCompanies, setShippingCompanies] = useState<ShippingCompany[]>([]);
  const [companyCustom, setCompanyCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<FreightCharge | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);

  const canWrite = canManageReceivables(role);
  const canView =
    isOpsRole(role) || canManageReceivables(role) || isManagerRole(role);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const { data: prof } = await supabase
        .from('admin_profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      setRole((prof?.role as AdminRole) || null);
    }
    const [listRes, companiesRes] = await Promise.all([
      supabase
        .from('freight_charges')
        .select('*')
        .order('sort_order')
        .order('source_country')
        .order('destination_country')
        .order('shipping_company'),
      supabase
        .from('shipping_companies')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('company_name'),
    ]);
    if (listRes.error) toast.error(listRes.error.message);
    setRows((listRes.data || []) as FreightCharge[]);
    // Distinct company names from the Shipping Companies master (ignore vessel pairing for this field)
    const companies = (companiesRes.data || []) as ShippingCompany[];
    const seen = new Set<string>();
    setShippingCompanies(
      companies.filter((row) => {
        const key = row.company_name.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const companyNames = useMemo(
    () => shippingCompanies.map((c) => c.company_name),
    [shippingCompanies]
  );

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm());
    setCompanyCustom(false);
    setShowForm(false);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setCompanyCustom(false);
    setShowForm(true);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const startEdit = (row: FreightCharge) => {
    if (!canWrite) return;
    setEditing(row);
    setForm(formFromRow(row));
    const name = (row.shipping_company || '').trim();
    setCompanyCustom(!!name && !companyNames.some((n) => n.toLowerCase() === name.toLowerCase()));
    setShowForm(true);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    const sourceCountry = form.source_country.trim();
    const destCountry = form.destination_country.trim();
    if (!sourceCountry) return toast.error('Source country is required.');
    if (!destCountry) return toast.error('Destination country is required.');
    const amount = Number(form.freight_charge);
    if (!Number.isFinite(amount) || amount < 0) {
      return toast.error('Enter a valid freight charge amount.');
    }
    setBusy(true);
    const payload = {
      source_country: sourceCountry,
      source_port: form.source_port.trim() || null,
      destination_country: destCountry,
      destination_port: form.destination_port.trim() || null,
      shipment_type: form.shipment_type,
      freight_charge: amount,
      currency: (form.currency.trim() || 'USD').toUpperCase(),
      shipping_company: form.shipping_company.trim() || null,
      contact_person: form.contact_person.trim() || null,
      contact_number: form.contact_number.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      notes: form.notes.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      updated_at: new Date().toISOString(),
    };
    const result = editing
      ? await supabase.from('freight_charges').update(payload).eq('id', editing.id)
      : await supabase.from('freight_charges').insert({
          ...payload,
          created_by: (await supabase.auth.getUser()).data.user?.id || null,
        });
    setBusy(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(editing ? 'Freight charge updated.' : 'Freight charge added.');
    resetForm();
    await load();
  };

  const toggleActive = async (row: FreightCharge) => {
    if (!canWrite) return;
    const { error } = await supabase
      .from('freight_charges')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) return toast.error(error.message);
    await load();
  };

  const remove = async (row: FreightCharge) => {
    if (!canWrite) return;
    const label = `${formatFreightRoute(row.source_country, row.source_port)} → ${formatFreightRoute(row.destination_country, row.destination_port)}`;
    if (!window.confirm(`Delete freight charge for ${label}?`)) return;
    const { error } = await supabase.from('freight_charges').delete().eq('id', row.id);
    if (error) return toast.error(error.message);
    toast.success('Deleted.');
    if (editing?.id === row.id) resetForm();
    await load();
  };

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!showInactive && !row.is_active) return false;
      return matchesQuery(listQuery, [
        row.source_country,
        row.source_port,
        row.destination_country,
        row.destination_port,
        row.shipment_type,
        SHIPMENT_MODE_LABELS[row.shipment_type],
        row.freight_charge,
        row.currency,
        row.shipping_company,
        row.contact_person,
        row.contact_number,
        row.email,
        row.website,
      ]);
    });
  }, [rows, listQuery, showInactive]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [listQuery, pageSize, showInactive]);

  const pageNumbers = useMemo(() => {
    const pages: Array<number | '…'> = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
      return pages;
    }
    pages.push(1);
    const left = Math.max(2, safePage - 1);
    const right = Math.min(totalPages - 1, safePage + 1);
    if (left > 2) pages.push('…');
    for (let i = left; i <= right; i += 1) pages.push(i);
    if (right < totalPages - 1) pages.push('…');
    pages.push(totalPages);
    return pages;
  }, [safePage, totalPages]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">Freight charges are for ops, accounts, and managers.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Configuration</p>
          <h1 className="flex items-center gap-2.5 text-2xl font-black tracking-tight sm:text-[1.75rem]">
            <Ship className="h-6 w-6 shrink-0 text-accent" />
            Freight Charges — List
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Route rates by source / destination, shipment type, and shipping company. RoRo is priced per m³; 40-ft rates are the full container total. Countries and ports reuse Export masters where available.
          </p>
        </div>
        {canWrite ? (
          <Button type="button" onClick={openAdd} className="shrink-0">
            <Plus className="h-4 w-4" />
            Add Freight Charge
          </Button>
        ) : null}
      </div>

      {canWrite && showForm ? (
        <div ref={formRef}>
          <Card className="overflow-hidden">
            <CardHeader className="space-y-1.5 pb-4">
              <CardTitle className="text-lg">{editing ? 'Edit freight charge' : 'Add freight charge'}</CardTitle>
              <CardDescription>
                Source and destination countries/ports pull from Export masters; you can type a custom value
                when needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid grid-cols-1 gap-4 sm:grid-cols-12" onSubmit={(e) => void save(e)}>
                <div className="sm:col-span-3">
                  <ExportMasterSelect
                    id="fc-source-country"
                    kind="destination_country"
                    label="Source country"
                    value={form.source_country}
                    onChange={(v) => patch('source_country', v)}
                    disabled={busy}
                  />
                </div>
                <div className="sm:col-span-3">
                  <ExportMasterSelect
                    id="fc-source-port"
                    kind="loading_port"
                    label="Source port"
                    value={form.source_port}
                    onChange={(v) => patch('source_port', v)}
                    disabled={busy}
                  />
                </div>
                <div className="sm:col-span-3">
                  <ExportMasterSelect
                    id="fc-dest-country"
                    kind="destination_country"
                    label="Destination country"
                    value={form.destination_country}
                    onChange={(v) => patch('destination_country', v)}
                    disabled={busy}
                  />
                </div>
                <div className="sm:col-span-3">
                  <ExportMasterSelect
                    id="fc-dest-port"
                    kind="destination_port"
                    label="Destination port"
                    value={form.destination_port}
                    onChange={(v) => patch('destination_port', v)}
                    disabled={busy}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="fc-shipment">Shipment type</Label>
                  <select
                    id="fc-shipment"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.shipment_type}
                    disabled={busy}
                    onChange={(e) => patch('shipment_type', e.target.value as ShipmentMode)}
                  >
                    {SHIPMENT_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {SHIPMENT_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="fc-amount">
                    {form.shipment_type === 'roro' ? 'RoRo rate per m³ *' : form.shipment_type === 'container_40ft' ? '40-ft container total price *' : 'Freight charge *'}
                  </Label>
                  <Input
                    id="fc-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={form.freight_charge}
                    disabled={busy}
                    onChange={(e) => patch('freight_charge', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="fc-currency">Currency</Label>
                  <select
                    id="fc-currency"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.currency}
                    disabled={busy}
                    onChange={(e) => patch('currency', e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-4">
                  <Label htmlFor="fc-company">Shipping company</Label>
                  {companyCustom || companyNames.length === 0 ? (
                    <Input
                      id="fc-company"
                      value={form.shipping_company}
                      disabled={busy}
                      onChange={(e) => patch('shipping_company', e.target.value)}
                      placeholder="Company name"
                    />
                  ) : (
                    <select
                      id="fc-company"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.shipping_company}
                      disabled={busy}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setCompanyCustom(true);
                          patch('shipping_company', '');
                          return;
                        }
                        patch('shipping_company', e.target.value);
                      }}
                    >
                      <option value="">Select…</option>
                      {companyNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      <option value="__custom__">Other (type…)</option>
                    </select>
                  )}
                  {companyCustom && companyNames.length > 0 ? (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      disabled={busy}
                      onClick={() => {
                        setCompanyCustom(false);
                        patch('shipping_company', '');
                      }}
                    >
                      Choose from list
                    </button>
                  ) : null}
                </div>

                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="fc-contact">Contact person</Label>
                  <Input
                    id="fc-contact"
                    value={form.contact_person}
                    disabled={busy}
                    onChange={(e) => patch('contact_person', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="fc-phone">Contact number</Label>
                  <Input
                    id="fc-phone"
                    value={form.contact_number}
                    disabled={busy}
                    onChange={(e) => patch('contact_number', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="fc-email">Email</Label>
                  <Input
                    id="fc-email"
                    type="email"
                    value={form.email}
                    disabled={busy}
                    onChange={(e) => patch('email', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="fc-website">Website</Label>
                  <Input
                    id="fc-website"
                    value={form.website}
                    disabled={busy}
                    onChange={(e) => patch('website', e.target.value)}
                    placeholder="https://"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-10">
                  <Label htmlFor="fc-notes">Notes</Label>
                  <Input
                    id="fc-notes"
                    value={form.notes}
                    disabled={busy}
                    onChange={(e) => patch('notes', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="fc-sort">Sort</Label>
                  <Input
                    id="fc-sort"
                    type="number"
                    value={form.sort_order}
                    disabled={busy}
                    onChange={(e) => patch('sort_order', e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap gap-2 sm:col-span-12">
                  <Button type="submit" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {editing ? 'Update' : 'Save'}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader className="space-y-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search Freight Charge"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              aria-label="Search freight charges"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="sr-only">Rows per page</span>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="rounded border"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Show inactive
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                Total Freight Charges: {filteredRows.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {pageNumbers.map((item, idx) =>
                  item === '…' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-sm text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      className={cn(
                        'min-w-8 rounded px-2 py-1 text-sm font-semibold transition-colors',
                        item === safePage
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-secondary'
                      )}
                      aria-current={item === safePage ? 'page' : undefined}
                    >
                      {item}
                    </button>
                  )
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-y bg-secondary/40 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Source country / port</th>
                <th className="px-4 py-3">Country / port</th>
                <th className="px-4 py-3">Shipment type</th>
                <th className="px-4 py-3">Freight charges</th>
                <th className="px-4 py-3">Shipping company</th>
                <th className="px-4 py-3">Contact person</th>
                <th className="px-4 py-3">Contact number</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Website</th>
                {canWrite ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b last:border-0',
                    !row.is_active && 'bg-muted/30 text-muted-foreground'
                  )}
                >
                  <td className="px-4 py-3 font-medium">
                    {formatFreightRoute(row.source_country, row.source_port)}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {formatFreightRoute(row.destination_country, row.destination_port)}
                  </td>
                  <td className="px-4 py-3">{SHIPMENT_MODE_LABELS[row.shipment_type]}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatFreightAmount(Number(row.freight_charge), row.currency)}{row.shipment_type === 'roro' ? ' / m³' : row.shipment_type === 'container_40ft' ? ' / 40-ft container' : ''}
                  </td>
                  <td className="px-4 py-3">{row.shipping_company || '—'}</td>
                  <td className="px-4 py-3">{row.contact_person || '—'}</td>
                  <td className="px-4 py-3">{row.contact_number || '—'}</td>
                  <td className="px-4 py-3">
                    {row.email ? (
                      <a className="text-primary hover:underline" href={`mailto:${row.email}`}>
                        {row.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.website ? (
                      <a
                        className="text-primary hover:underline"
                        href={row.website.startsWith('http') ? row.website : `https://${row.website}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.website}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  {canWrite ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => startEdit(row)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => void toggleActive(row)}
                          aria-label={row.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {row.is_active ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => void remove(row)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canWrite ? 10 : 9}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    No freight charges yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

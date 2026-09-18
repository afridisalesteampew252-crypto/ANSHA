'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import type { Supplier } from '@/lib/types';

const emptyForm = {
  supplier_code: '',
  name: '',
  trn: '',
  country: '',
  email: '',
  phone: '',
  address: '',
  currency: 'AED',
  notes: '',
  is_active: true,
};

export default function SuppliersPage() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('suppliers').select('*').order('name');
    if (error) toast.error(error.message);
    setRows((data || []) as Supplier[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const startCreate = async () => {
    reset();
    const { data, error } = await supabase.rpc('next_supplier_code');
    if (error) toast.error(error.message);
    else setForm((current) => ({ ...current, supplier_code: String(data || '') }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.supplier_code.trim()) {
      toast.error('Supplier code and name are required.');
      return;
    }
    setBusy(true);
    const payload = {
      supplier_code: form.supplier_code.trim().toUpperCase(),
      name: form.name.trim(),
      trn: form.trn.trim() || null,
      country: form.country.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      currency: form.currency.trim().toUpperCase() || 'AED',
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    const { error } = editingId
      ? await supabase.from('suppliers').update(payload).eq('id', editingId)
      : await supabase.from('suppliers').insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingId ? 'Supplier updated.' : 'Supplier created.');
    reset();
    await load();
  };

  const edit = (row: Supplier) => {
    setEditingId(row.id);
    setForm({
      supplier_code: row.supplier_code,
      name: row.name,
      trn: row.trn || '',
      country: row.country || '',
      email: row.email || '',
      phone: row.phone || '',
      address: row.address || '',
      currency: row.currency || 'AED',
      notes: row.notes || '',
      is_active: row.is_active,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filtered = rows.filter((row) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.supplier_code, row.name, row.country, row.trn].some((value) => value?.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Purchase vendors for costed vehicle and parts inventory.</p>
        </div>
        <Button type="button" onClick={() => void startCreate()}>
          <Plus className="h-4 w-4" />
          New supplier
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{editingId ? 'Edit supplier' : 'Supplier form'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-code">Code</Label>
              <Input id="supplier-code" value={form.supplier_code} onChange={(e) => setForm({ ...form, supplier_code: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-name">Name</Label>
              <Input id="supplier-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-trn">TRN</Label>
              <Input id="supplier-trn" value={form.trn} onChange={(e) => setForm({ ...form, trn: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-country">Country</Label>
              <Input id="supplier-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-email">Email</Label>
              <Input id="supplier-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-phone">Phone</Label>
              <Input id="supplier-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-currency">Currency</Label>
              <Input id="supplier-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input id="supplier-active" type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              <Label htmlFor="supplier-active">Active</Label>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="supplier-address">Address</Label>
              <Textarea id="supplier-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="supplier-notes">Notes</Label>
              <Textarea id="supplier-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Update' : 'Create'}</Button>
              {editingId ? <Button type="button" variant="outline" onClick={reset}>Cancel</Button> : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search suppliers…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <ul className="space-y-2">
        {filtered.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-mono text-sm">{row.supplier_code}</strong>
                <span className="font-semibold">{row.name}</span>
                {row.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[row.country, row.trn ? `TRN ${row.trn}` : null, row.currency].filter(Boolean).join(' · ') || 'No details'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/suppliers/${row.id}`}>SOA</Link>
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => edit(row)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          </li>
        ))}
        {filtered.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No suppliers yet.</p> : null}
      </ul>
    </div>
  );
}

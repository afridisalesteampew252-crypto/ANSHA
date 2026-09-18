'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardList, Loader2, Plus, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import type { PurchaseOrder, PurchaseOrderLine, Supplier } from '@/lib/types';

type LineDraft = {
  description: string;
  quantity: string;
  unit_price: string;
  inventory_type: '' | 'part' | 'vehicle';
  part_id: string;
  vehicle_id: string;
};

type StockOption = { id: string; label: string };

const money = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

const matchBadge: Record<string, string> = {
  open: 'bg-slate-100 text-slate-700',
  partially_received: 'bg-amber-100 text-amber-800',
  received: 'bg-sky-100 text-sky-800',
  invoiced: 'bg-violet-100 text-violet-800',
  matched: 'bg-emerald-100 text-emerald-800',
  partially_paid: 'bg-orange-100 text-orange-800',
  paid: 'bg-emerald-200 text-emerald-900',
  cancelled: 'bg-zinc-200 text-zinc-700',
};

const emptyLine = (): LineDraft => ({
  description: '',
  quantity: '1',
  unit_price: '',
  inventory_type: '',
  part_id: '',
  vehicle_id: '',
});

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [parts, setParts] = useState<StockOption[]>([]);
  const [vehicles, setVehicles] = useState<StockOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('AED');
  const [vatRate, setVatRate] = useState('5');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [draftLines, setDraftLines] = useState<LineDraft[]>([emptyLine()]);

  const load = useCallback(async () => {
    const [poRes, supRes, partRes, vehRes] = await Promise.all([
      supabase.from('purchase_orders').select('*').order('order_date', { ascending: false }).limit(100),
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('parts').select('id,part_code,name').order('part_code').limit(400),
      supabase.from('vehicles').select('id,title,stock_number,chassis_number').neq('stock_status', 'sold').order('created_at', { ascending: false }).limit(400),
    ]);
    if (poRes.error) toast.error(poRes.error.message);
    setOrders((poRes.data || []) as PurchaseOrder[]);
    setSuppliers((supRes.data || []) as Supplier[]);
    setParts((partRes.data || []).map((row) => ({ id: row.id, label: `${row.part_code} — ${row.name}` })));
    setVehicles((vehRes.data || []).map((row) => ({
      id: row.id,
      label: `${row.stock_number || row.chassis_number || row.id.slice(0, 8)} — ${row.title}`,
    })));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = orders.find((row) => row.id === selectedId) || null;
  const supplierName = (id: string) => suppliers.find((row) => row.id === id)?.name || id.slice(0, 8);

  const openOrder = async (id: string) => {
    setSelectedId(id);
    const { data, error } = await supabase
      .from('purchase_order_lines')
      .select('*')
      .eq('purchase_order_id', id)
      .order('sort_order');
    if (error) toast.error(error.message);
    setLines((data || []) as PurchaseOrderLine[]);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((row) =>
      [row.po_number, row.match_status, row.status, supplierName(row.supplier_id)].some((value) =>
        value?.toLowerCase().includes(q)
      )
    );
  }, [orders, query, suppliers]);

  const resetForm = () => {
    setShowForm(false);
    setSupplierId('');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setCurrency('AED');
    setVatRate('5');
    setTerms('');
    setNotes('');
    setDraftLines([emptyLine()]);
  };

  const createOrder = async (confirm: boolean) => {
    if (!supplierId) {
      toast.error('Select a supplier.');
      return;
    }
    const payloadLines = draftLines
      .filter((line) => line.description.trim())
      .map((line) => ({
        description: line.description.trim(),
        quantity: Number(line.quantity) || 1,
        unit_price: Number(line.unit_price) || 0,
        tax_rate: Number(vatRate) || 5,
        inventory_type: line.inventory_type || null,
        part_id: line.inventory_type === 'part' ? line.part_id || null : null,
        vehicle_id: line.inventory_type === 'vehicle' ? line.vehicle_id || null : null,
      }));
    if (payloadLines.length === 0) {
      toast.error('Add at least one line with a description.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('create_purchase_order', {
      p_supplier_id: supplierId,
      p_order_date: orderDate,
      p_currency: currency,
      p_vat_rate: Number(vatRate) || 5,
      p_terms: terms || null,
      p_notes: notes || null,
      p_lines: payloadLines,
      p_confirm: confirm,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(confirm ? 'Purchase order confirmed.' : 'Purchase order saved as draft.');
    resetForm();
    await load();
    if (data) await openOrder(String(data));
  };

  const confirmOrder = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('confirm_purchase_order', { p_po_id: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('PO marked ordered.');
    await load();
    await openOrder(id);
  };

  const cancelOrder = async (id: string) => {
    if (!window.confirm('Cancel this purchase order?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('cancel_purchase_order', { p_po_id: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('PO cancelled.');
    await load();
    await openOrder(id);
  };

  const refreshMatch = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('refresh_purchase_order_match', { p_po_id: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Match status refreshed.');
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase orders</h1>
          <p className="text-sm text-muted-foreground">
            Order from suppliers, then match goods receipts and supplier invoice files (3-way).
          </p>
        </div>
        <Button type="button" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          New PO
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New purchase order</CardTitle>
            <CardDescription>Save as draft or confirm immediately to allow receiving against it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Supplier</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Select supplier</option>
                  {suppliers.map((row) => (
                    <option key={row.id} value={row.id}>{row.supplier_code} — {row.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Order date</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
              </div>
              <div className="space-y-1.5">
                <Label>VAT %</Label>
                <Input type="number" min="0" step="0.01" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              {draftLines.map((line, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label>Description</Label>
                    <Input value={line.description} onChange={(e) => setDraftLines((rows) => rows.map((row, i) => (i === index ? { ...row, description: e.target.value } : row)))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Qty</Label>
                    <Input type="number" min="0.001" step="any" value={line.quantity} onChange={(e) => setDraftLines((rows) => rows.map((row, i) => (i === index ? { ...row, quantity: e.target.value } : row)))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Unit price</Label>
                    <Input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => setDraftLines((rows) => rows.map((row, i) => (i === index ? { ...row, unit_price: e.target.value } : row)))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Stock link</Label>
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={line.inventory_type} onChange={(e) => setDraftLines((rows) => rows.map((row, i) => (i === index ? { ...row, inventory_type: e.target.value as LineDraft['inventory_type'], part_id: '', vehicle_id: '' } : row)))}>
                      <option value="">None</option>
                      <option value="vehicle">Vehicle</option>
                      <option value="part">Part</option>
                    </select>
                  </div>
                  {line.inventory_type === 'vehicle' ? (
                    <div className="space-y-1.5">
                      <Label>Vehicle</Label>
                      <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={line.vehicle_id} onChange={(e) => setDraftLines((rows) => rows.map((row, i) => (i === index ? { ...row, vehicle_id: e.target.value } : row)))}>
                        <option value="">Select</option>
                        {vehicles.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                      </select>
                    </div>
                  ) : line.inventory_type === 'part' ? (
                    <div className="space-y-1.5">
                      <Label>Part</Label>
                      <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={line.part_id} onChange={(e) => setDraftLines((rows) => rows.map((row, i) => (i === index ? { ...row, part_id: e.target.value } : row)))}>
                        <option value="">Select</option>
                        {parts.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-end">
                      <Button type="button" variant="ghost" size="sm" disabled={draftLines.length === 1} onClick={() => setDraftLines((rows) => rows.filter((_, i) => i !== index))}>
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setDraftLines((rows) => [...rows, emptyLine()])}>
                Add line
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Terms</Label>
                <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void createOrder(false)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save draft
              </Button>
              <Button type="button" disabled={busy} onClick={() => void createOrder(true)}>
                <CheckCircle2 className="h-4 w-4" />
                Confirm ordered
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search PO number, supplier, status" className="pl-10" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5" />
              Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {filtered.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => void openOrder(row.id)}
                className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-3 text-left text-sm transition hover:border-primary/40 ${selectedId === row.id ? 'border-primary bg-primary/5' : ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold">{row.po_number}</span>
                  <div className="flex gap-1">
                    <Badge variant="outline">{row.status}</Badge>
                    <Badge className={matchBadge[row.match_status] || ''}>{row.match_status.replaceAll('_', ' ')}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {supplierName(row.supplier_id)} · {row.order_date} · Ordered {money(row.amount_ordered, row.currency)}
                </p>
              </button>
            ))}
            {filtered.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No purchase orders yet.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">3-way match</CardTitle>
            <CardDescription>Compare ordered vs received (GRN) vs supplier invoice files vs payments.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Select a purchase order.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{selected.status}</Badge>
                  <Badge className={matchBadge[selected.match_status] || ''}>{selected.match_status.replaceAll('_', ' ')}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Ordered', money(selected.amount_ordered, selected.currency), `Qty ${selected.qty_ordered}`],
                    ['Received', money(selected.amount_received, selected.currency), `Qty ${selected.qty_received}`],
                    ['Invoiced', money(selected.amount_invoiced, selected.currency), 'Supplier files'],
                    ['Paid', money(selected.amount_paid, selected.currency), selected.match_status.includes('paid') ? selected.match_status.replaceAll('_', ' ') : 'Allocated payments'],
                  ].map(([label, value, hint]) => (
                    <div key={String(label)} className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 text-lg font-semibold">{value}</p>
                      <p className="text-xs text-muted-foreground">{hint}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Lines</p>
                  {lines.map((line) => (
                    <div key={line.id} className="rounded-md border px-3 py-2 text-sm">
                      <p className="font-medium">{line.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Qty {line.quantity} · {money(line.unit_price, selected.currency)}
                        {line.inventory_type ? ` · ${line.inventory_type}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.status === 'draft' ? (
                    <Button type="button" size="sm" disabled={busy} onClick={() => void confirmOrder(selected.id)}>
                      <CheckCircle2 className="h-4 w-4" />Confirm
                    </Button>
                  ) : null}
                  {selected.status === 'ordered' ? (
                    <>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/inventory/receive?po=${selected.id}`}>Receive stock</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/suppliers/${selected.supplier_id}`}>Supplier SOA / pay</Link>
                      </Button>
                    </>
                  ) : null}
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void refreshMatch(selected.id)}>
                    Refresh match
                  </Button>
                  {selected.status !== 'cancelled' ? (
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void cancelOrder(selected.id)}>
                      <XCircle className="h-4 w-4" />Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

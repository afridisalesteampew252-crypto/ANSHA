'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import type { InventoryReceipt, Supplier, SupplierInvoice } from '@/lib/types';

type StockOption = { id: string; label: string };

export default function InventoryReceivePage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [parts, setParts] = useState<StockOption[]>([]);
  const [vehicles, setVehicles] = useState<StockOption[]>([]);
  const [receipts, setReceipts] = useState<InventoryReceipt[]>([]);
  const [busy, setBusy] = useState(false);

  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceId, setSupplierInvoiceId] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [notes, setNotes] = useState('');
  const [inventoryType, setInventoryType] = useState<'vehicle' | 'part'>('vehicle');
  const [vehicleId, setVehicleId] = useState('');
  const [partId, setPartId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');

  const load = useCallback(async () => {
    const [supRes, invRes, partRes, vehRes, recRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('supplier_invoices').select('*').order('invoice_date', { ascending: false }).limit(100),
      supabase.from('parts').select('id,part_code,name').order('part_code').limit(500),
      supabase.from('vehicles').select('id,title,stock_number,chassis_number').neq('stock_status', 'sold').order('created_at', { ascending: false }).limit(500),
      supabase.from('inventory_receipts').select('*').order('received_date', { ascending: false }).limit(30),
    ]);
    if (supRes.error) toast.error(supRes.error.message);
    setSuppliers((supRes.data || []) as Supplier[]);
    setSupplierInvoices((invRes.data || []) as SupplierInvoice[]);
    setParts((partRes.data || []).map((row) => ({ id: row.id, label: `${row.part_code} — ${row.name}` })));
    setVehicles((vehRes.data || []).map((row) => ({
      id: row.id,
      label: `${row.stock_number || row.chassis_number || row.id.slice(0, 8)} — ${row.title}`,
    })));
    setReceipts((recRes.data || []) as InventoryReceipt[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cost = Number(unitCost);
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error('Enter a valid unit cost.');
      return;
    }
    if (inventoryType === 'vehicle' && !vehicleId) {
      toast.error('Select a vehicle.');
      return;
    }
    if (inventoryType === 'part' && !partId) {
      toast.error('Select a part.');
      return;
    }
    setBusy(true);
    const line =
      inventoryType === 'vehicle'
        ? { inventory_type: 'vehicle', vehicle_id: vehicleId, quantity: 1, unit_cost: cost }
        : { inventory_type: 'part', part_id: partId, quantity: Number(quantity) || 1, unit_cost: cost };

    const { data, error } = await supabase.rpc('create_inventory_receipt', {
      p_received_date: receivedDate,
      p_supplier_id: supplierId || null,
      p_supplier_invoice_id: supplierInvoiceId || null,
      p_currency: currency,
      p_notes: notes || null,
      p_lines: [line],
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Receipt saved (${String(data).slice(0, 8)}…). Purchase cost applied to stock.`);
    setUnitCost('');
    setNotes('');
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receive stock</h1>
        <p className="text-sm text-muted-foreground">
          Goods receipt (GRN) applies purchase cost to an existing vehicle or part. Create the catalog item first if needed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New receipt</CardTitle>
          <CardDescription>
            Link an optional <Link href="/admin/invoices/supplier" className="text-primary underline">supplier invoice file</Link> and supplier master.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
            <div className="space-y-1.5">
              <Label htmlFor="grn-date">Received date</Label>
              <Input id="grn-date" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grn-currency">Currency</Label>
              <Input id="grn-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grn-supplier">Supplier</Label>
              <select id="grn-supplier" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">No supplier</option>
                {suppliers.map((row) => (
                  <option key={row.id} value={row.id}>{row.supplier_code} — {row.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grn-supplier-invoice">Supplier invoice file</Label>
              <select id="grn-supplier-invoice" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={supplierInvoiceId} onChange={(e) => setSupplierInvoiceId(e.target.value)}>
                <option value="">None</option>
                {supplierInvoices.map((row) => (
                  <option key={row.id} value={row.id}>
                    {(row.invoice_number || row.file_name)} · {row.supplier_name} · {row.invoice_date}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grn-type">Stock type</Label>
              <select id="grn-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={inventoryType} onChange={(e) => setInventoryType(e.target.value as 'vehicle' | 'part')}>
                <option value="vehicle">Vehicle</option>
                <option value="part">Part</option>
              </select>
            </div>
            {inventoryType === 'vehicle' ? (
              <div className="space-y-1.5">
                <Label htmlFor="grn-vehicle">Vehicle</Label>
                <select id="grn-vehicle" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
                  <option value="">Select vehicle</option>
                  {vehicles.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="grn-part">Part</Label>
                  <select id="grn-part" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={partId} onChange={(e) => setPartId(e.target.value)} required>
                    <option value="">Select part</option>
                    {parts.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="grn-qty">Quantity</Label>
                  <Input id="grn-qty" type="number" min="0.001" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="grn-cost">Unit cost</Label>
              <Input id="grn-cost" type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="grn-notes">Notes</Label>
              <Textarea id="grn-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
                Post receipt
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent receipts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {receipts.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="font-mono font-semibold">{row.receipt_number}</span>
              <span className="text-muted-foreground">{row.received_date} · {row.currency}</span>
            </div>
          ))}
          {receipts.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No receipts yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

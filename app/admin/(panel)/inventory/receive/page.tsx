'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect, vehicleSelectOption } from '@/components/admin/searchable-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import type { InventoryReceipt, PurchaseOrder, Supplier, SupplierInvoice } from '@/lib/types';
import { cn } from '@/lib/utils';

type StockOption = {
  id: string;
  label: string;
  title?: string | null;
  stock_number?: string | null;
  chassis_number?: string | null;
  part_code?: string | null;
  name?: string | null;
};

const fieldClass = 'space-y-2';

export default function InventoryReceivePage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [parts, setParts] = useState<StockOption[]>([]);
  const [vehicles, setVehicles] = useState<StockOption[]>([]);
  const [receipts, setReceipts] = useState<InventoryReceipt[]>([]);
  const [busy, setBusy] = useState(false);

  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [supplierInvoiceId, setSupplierInvoiceId] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [notes, setNotes] = useState('');
  const [inventoryType, setInventoryType] = useState<'vehicle' | 'part'>('vehicle');
  const [vehicleId, setVehicleId] = useState('');
  const [partId, setPartId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');

  const load = useCallback(async () => {
    const [supRes, invRes, poRes, partRes, vehRes, recRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('supplier_invoices').select('*').order('invoice_date', { ascending: false }).limit(100),
      supabase.from('purchase_orders').select('*').eq('status', 'ordered').order('order_date', { ascending: false }).limit(100),
      supabase.from('parts').select('id,part_code,name').order('part_code').limit(500),
      supabase.from('vehicles').select('id,title,stock_number,chassis_number').neq('stock_status', 'sold').order('created_at', { ascending: false }).limit(500),
      supabase.from('inventory_receipts').select('*').order('received_date', { ascending: false }).limit(30),
    ]);
    if (supRes.error) toast.error(supRes.error.message);
    setSuppliers((supRes.data || []) as Supplier[]);
    setSupplierInvoices((invRes.data || []) as SupplierInvoice[]);
    setPurchaseOrders((poRes.data || []) as PurchaseOrder[]);
    setParts((partRes.data || []).map((row) => ({ id: row.id, label: `${row.part_code} — ${row.name}`, part_code: row.part_code, name: row.name })));
    setVehicles((vehRes.data || []).map((row) => ({
      id: row.id,
      title: row.title,
      stock_number: row.stock_number,
      chassis_number: row.chassis_number,
      label: `${row.stock_number || row.chassis_number || row.id.slice(0, 8)} — ${row.title}`,
    })));
    setReceipts((recRes.data || []) as InventoryReceipt[]);
  }, []);

  useEffect(() => {
    void load();
    const fromQuery = new URLSearchParams(window.location.search).get('po');
    if (fromQuery) setPurchaseOrderId(fromQuery);
  }, [load]);

  useEffect(() => {
    const po = purchaseOrders.find((row) => row.id === purchaseOrderId);
    if (!po) return;
    setSupplierId(po.supplier_id);
    setCurrency(po.currency || 'AED');
  }, [purchaseOrderId, purchaseOrders]);

  const vehicleOptions = useMemo(() => vehicles.map(vehicleSelectOption), [vehicles]);
  const partOptions = useMemo(
    () =>
      parts.map((row) => ({
        value: row.id,
        label: row.label,
        keywords: [row.part_code, row.name],
      })),
    [parts]
  );

  const filteredInvoices = useMemo(() => {
    if (!supplierId) return supplierInvoices;
    return supplierInvoices.filter((row) => !row.supplier_id || row.supplier_id === supplierId);
  }, [supplierId, supplierInvoices]);

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
      p_purchase_order_id: purchaseOrderId || null,
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
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Purchase &amp; stock</p>
        <h1 className="flex items-center gap-2.5 text-2xl font-black tracking-tight sm:text-[1.75rem]">
          <PackagePlus className="h-6 w-6 shrink-0 text-accent" />
          Receive stock
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Goods receipt (GRN) applies purchase cost to an existing vehicle or part. Create the catalog item
          first if needed.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="space-y-1.5 pb-4">
          <CardTitle className="text-lg">New receipt</CardTitle>
          <CardDescription>
            Optional link to a confirmed{' '}
            <Link href="/admin/purchase-orders" className="text-primary underline-offset-2 hover:underline">
              purchase order
            </Link>{' '}
            and{' '}
            <Link href="/admin/invoices/supplier" className="text-primary underline-offset-2 hover:underline">
              supplier invoice file
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
            <div className={fieldClass}>
              <Label htmlFor="grn-date">Received date</Label>
              <Input
                id="grn-date"
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                required
              />
            </div>
            <div className={fieldClass}>
              <Label htmlFor="grn-currency">Currency</Label>
              <Input
                id="grn-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                maxLength={3}
                required
              />
            </div>

            <div className={cn(fieldClass, 'sm:col-span-2')}>
              <Label htmlFor="grn-po">Purchase order</Label>
              <NativeSelect
                id="grn-po"
                value={purchaseOrderId}
                onChange={(e) => setPurchaseOrderId(e.target.value)}
              >
                <option value="">No PO</option>
                {purchaseOrders.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.po_number} · {row.currency} · {row.match_status.replaceAll('_', ' ')}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className={fieldClass}>
              <Label htmlFor="grn-supplier">Supplier</Label>
              <NativeSelect
                id="grn-supplier"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setSupplierInvoiceId('');
                }}
              >
                <option value="">No supplier</option>
                {suppliers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.supplier_code} — {row.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className={fieldClass}>
              <Label htmlFor="grn-supplier-invoice">Supplier invoice file</Label>
              <NativeSelect
                id="grn-supplier-invoice"
                value={supplierInvoiceId}
                onChange={(e) => setSupplierInvoiceId(e.target.value)}
              >
                <option value="">None</option>
                {filteredInvoices.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.invoice_number || row.file_name} · {row.supplier_name} · {row.invoice_date}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className={fieldClass}>
              <Label htmlFor="grn-type">Stock type</Label>
              <NativeSelect
                id="grn-type"
                value={inventoryType}
                onChange={(e) => setInventoryType(e.target.value as 'vehicle' | 'part')}
              >
                <option value="vehicle">Vehicle</option>
                <option value="part">Part</option>
              </NativeSelect>
            </div>
            {inventoryType === 'vehicle' ? (
              <div className={fieldClass}>
                <Label htmlFor="grn-vehicle">Vehicle</Label>
                <SearchableSelect
                  id="grn-vehicle"
                  value={vehicleId}
                  onValueChange={setVehicleId}
                  options={vehicleOptions}
                  placeholder="Select vehicle"
                  searchPlaceholder="Search stock #, chassis, title…"
                  clearLabel="Select vehicle"
                  required
                />
              </div>
            ) : (
              <div className={fieldClass}>
                <Label htmlFor="grn-part">Part</Label>
                <SearchableSelect
                  id="grn-part"
                  value={partId}
                  onValueChange={setPartId}
                  options={partOptions}
                  placeholder="Select part"
                  searchPlaceholder="Search part code or name…"
                  clearLabel="Select part"
                  required
                />
              </div>
            )}

            {inventoryType === 'part' ? (
              <div className={fieldClass}>
                <Label htmlFor="grn-qty">Quantity</Label>
                <Input
                  id="grn-qty"
                  type="number"
                  min="0.001"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
            ) : null}
            <div className={fieldClass}>
              <Label htmlFor="grn-cost">Unit cost</Label>
              <Input
                id="grn-cost"
                type="number"
                min="0"
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                required
              />
            </div>

            <div className={cn(fieldClass, 'sm:col-span-2')}>
              <Label htmlFor="grn-notes">Notes</Label>
              <Textarea id="grn-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="pt-1 sm:col-span-2">
              <Button type="submit" disabled={busy} className="min-h-10">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
                Post receipt
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent receipts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {receipts.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No receipts yet.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {receipts.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-6"
                >
                  <span className="font-mono font-semibold">{row.receipt_number}</span>
                  <span className="text-muted-foreground">
                    {row.received_date} · {row.currency}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

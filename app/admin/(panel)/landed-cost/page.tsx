'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Calculator, CheckCircle2, Loader2, Plus, Search, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import type {
  InventoryReceipt,
  LandedCostAllocation,
  LandedCostAllocationMethod,
  LandedCostCharge,
  LandedCostChargeType,
  LandedCostPack,
  LandedCostPackStatus,
  PurchaseOrder,
  Supplier,
  SupplierInvoice,
} from '@/lib/types';

type StockOption = { id: string; label: string; purchase_price: number | null };
type ChargeDraft = { charge_type: LandedCostChargeType; description: string; amount: string };
type AllocRow = LandedCostAllocation & { label: string };

const money = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

const statusBadge: Record<LandedCostPackStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  posted: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-zinc-200 text-zinc-700',
};

const CHARGE_TYPES: { value: LandedCostChargeType; label: string }[] = [
  { value: 'freight', label: 'Freight' },
  { value: 'duty', label: 'Duty' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'handling', label: 'Handling' },
  { value: 'other', label: 'Other' },
];

const emptyCharge = (): ChargeDraft => ({ charge_type: 'freight', description: '', amount: '' });

export default function LandedCostPage() {
  const [packs, setPacks] = useState<LandedCostPack[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<InventoryReceipt[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [parts, setParts] = useState<StockOption[]>([]);
  const [vehicles, setVehicles] = useState<StockOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [charges, setCharges] = useState<LandedCostCharge[]>([]);
  const [allocations, setAllocations] = useState<AllocRow[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [packDate, setPackDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('AED');
  const [allocationMethod, setAllocationMethod] = useState<LandedCostAllocationMethod>('equal');
  const [supplierId, setSupplierId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [inventoryReceiptId, setInventoryReceiptId] = useState('');
  const [supplierInvoiceId, setSupplierInvoiceId] = useState('');
  const [notes, setNotes] = useState('');
  const [draftCharges, setDraftCharges] = useState<ChargeDraft[]>([emptyCharge()]);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);

  const [addChargeType, setAddChargeType] = useState<LandedCostChargeType>('freight');
  const [addChargeDesc, setAddChargeDesc] = useState('');
  const [addChargeAmount, setAddChargeAmount] = useState('');
  const [addInventoryType, setAddInventoryType] = useState<'vehicle' | 'part'>('vehicle');
  const [addVehicleId, setAddVehicleId] = useState('');
  const [addPartId, setAddPartId] = useState('');
  const [addAllocAmount, setAddAllocAmount] = useState('');

  const load = useCallback(async () => {
    const [packRes, supRes, poRes, recRes, invRes, partRes, vehRes] = await Promise.all([
      supabase.from('landed_cost_packs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('purchase_orders').select('*').neq('status', 'cancelled').order('order_date', { ascending: false }).limit(100),
      supabase.from('inventory_receipts').select('*').order('received_date', { ascending: false }).limit(100),
      supabase.from('supplier_invoices').select('*').order('invoice_date', { ascending: false }).limit(100),
      supabase.from('parts').select('id,part_code,name,purchase_price').order('part_code').limit(400),
      supabase
        .from('vehicles')
        .select('id,title,stock_number,chassis_number,purchase_price')
        .neq('stock_status', 'sold')
        .order('created_at', { ascending: false })
        .limit(400),
    ]);
    if (packRes.error) toast.error(packRes.error.message);
    setPacks((packRes.data || []) as LandedCostPack[]);
    setSuppliers((supRes.data || []) as Supplier[]);
    setPurchaseOrders((poRes.data || []) as PurchaseOrder[]);
    setReceipts((recRes.data || []) as InventoryReceipt[]);
    setSupplierInvoices((invRes.data || []) as SupplierInvoice[]);
    setParts(
      (partRes.data || []).map((row) => ({
        id: row.id,
        label: `${row.part_code} — ${row.name}`,
        purchase_price: row.purchase_price,
      }))
    );
    setVehicles(
      (vehRes.data || []).map((row) => ({
        id: row.id,
        label: `${row.stock_number || row.chassis_number || row.id.slice(0, 8)} — ${row.title}`,
        purchase_price: row.purchase_price,
      }))
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = packs.find((row) => row.id === selectedId) || null;
  const isDraft = selected?.status === 'draft';

  const openPack = async (id: string) => {
    setSelectedId(id);
    setAddChargeDesc('');
    setAddChargeAmount('');
    setAddVehicleId('');
    setAddPartId('');
    setAddAllocAmount('');
    const [chargeRes, allocRes] = await Promise.all([
      supabase.from('landed_cost_charges').select('*').eq('pack_id', id).order('sort_order'),
      supabase.from('landed_cost_allocations').select('*').eq('pack_id', id).order('created_at'),
    ]);
    if (chargeRes.error) toast.error(chargeRes.error.message);
    if (allocRes.error) toast.error(allocRes.error.message);
    setCharges((chargeRes.data || []) as LandedCostCharge[]);
    const allocRows = (allocRes.data || []) as LandedCostAllocation[];
    setAllocations(
      allocRows.map((row) => {
        if (row.inventory_type === 'vehicle' && row.vehicle_id) {
          const vehicle = vehicles.find((v) => v.id === row.vehicle_id);
          return { ...row, label: vehicle?.label || row.vehicle_id.slice(0, 8) };
        }
        if (row.inventory_type === 'part' && row.part_id) {
          const part = parts.find((p) => p.id === row.part_id);
          return { ...row, label: part?.label || row.part_id.slice(0, 8) };
        }
        return { ...row, label: row.id.slice(0, 8) };
      })
    );
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packs;
    return packs.filter((row) =>
      [row.pack_number, row.status, row.currency, row.notes].some((value) => value?.toLowerCase().includes(q))
    );
  }, [packs, query]);

  const resetForm = () => {
    setShowForm(false);
    setPackDate(new Date().toISOString().slice(0, 10));
    setCurrency('AED');
    setAllocationMethod('equal');
    setSupplierId('');
    setPurchaseOrderId('');
    setInventoryReceiptId('');
    setSupplierInvoiceId('');
    setNotes('');
    setDraftCharges([emptyCharge()]);
    setSelectedVehicleIds([]);
    setSelectedPartIds([]);
  };

  const toggleVehicle = (id: string) => {
    setSelectedVehicleIds((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));
  };

  const togglePart = (id: string) => {
    setSelectedPartIds((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));
  };

  const createPack = async () => {
    const payloadCharges = draftCharges
      .filter((line) => Number(line.amount) > 0)
      .map((line) => ({
        charge_type: line.charge_type,
        description: line.description.trim() || null,
        amount: Number(line.amount) || 0,
      }));
    if (payloadCharges.length === 0) {
      toast.error('Add at least one charge with an amount.');
      return;
    }
    if (selectedVehicleIds.length === 0 && selectedPartIds.length === 0) {
      toast.error('Select at least one vehicle or part to allocate.');
      return;
    }
    const stockLines = [
      ...selectedVehicleIds.map((id) => ({ inventory_type: 'vehicle', vehicle_id: id, part_id: null })),
      ...selectedPartIds.map((id) => ({ inventory_type: 'part', part_id: id, vehicle_id: null })),
    ];
    setBusy(true);
    const { data, error } = await supabase.rpc('create_landed_cost_pack', {
      p_pack_date: packDate,
      p_currency: currency,
      p_allocation_method: allocationMethod,
      p_notes: notes || null,
      p_supplier_id: supplierId || null,
      p_purchase_order_id: purchaseOrderId || null,
      p_inventory_receipt_id: inventoryReceiptId || null,
      p_supplier_invoice_id: supplierInvoiceId || null,
      p_charges: payloadCharges,
      p_stock: stockLines,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Landed-cost pack created.');
    resetForm();
    await load();
    if (data) await openPack(String(data));
  };

  const addCharge = async () => {
    if (!selected || !isDraft) return;
    const amount = Number(addChargeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid charge amount.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('add_landed_cost_charge', {
      p_pack_id: selected.id,
      p_charge_type: addChargeType,
      p_description: addChargeDesc.trim() || null,
      p_amount: amount,
      p_supplier_id: null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Charge added.');
    setAddChargeDesc('');
    setAddChargeAmount('');
    await load();
    await openPack(selected.id);
  };

  const removeCharge = async (chargeId: string) => {
    if (!selected || !isDraft) return;
    setBusy(true);
    const { error } = await supabase.rpc('remove_landed_cost_charge', { p_charge_id: chargeId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Charge removed.');
    await load();
    await openPack(selected.id);
  };

  const addAllocation = async () => {
    if (!selected || !isDraft) return;
    if (addInventoryType === 'vehicle' && !addVehicleId) {
      toast.error('Select a vehicle.');
      return;
    }
    if (addInventoryType === 'part' && !addPartId) {
      toast.error('Select a part.');
      return;
    }
    const amount = addAllocAmount === '' ? null : Number(addAllocAmount);
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      toast.error('Enter a valid allocation amount.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('add_landed_cost_allocation', {
      p_pack_id: selected.id,
      p_inventory_type: addInventoryType,
      p_vehicle_id: addInventoryType === 'vehicle' ? addVehicleId : null,
      p_part_id: addInventoryType === 'part' ? addPartId : null,
      p_allocated_amount: amount,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Stock line added.');
    setAddVehicleId('');
    setAddPartId('');
    setAddAllocAmount('');
    await openPack(selected.id);
  };

  const removeAllocation = async (allocationId: string) => {
    if (!selected || !isDraft) return;
    setBusy(true);
    const { error } = await supabase.rpc('remove_landed_cost_allocation', { p_allocation_id: allocationId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Stock line removed.');
    await openPack(selected.id);
  };

  const redistribute = async (method: LandedCostAllocationMethod) => {
    if (!selected || !isDraft) return;
    setBusy(true);
    const { error } = await supabase.rpc('redistribute_landed_cost_pack', {
      p_pack_id: selected.id,
      p_method: method,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Allocations redistributed (${method.replaceAll('_', ' ')}).`);
    await load();
    await openPack(selected.id);
  };

  const postPack = async (id: string) => {
    if (!window.confirm('Post this pack? Stock landed_cost will be updated from purchase + allocated charges.')) return;
    setBusy(true);
    const { error } = await supabase.rpc('post_landed_cost_pack', { p_pack_id: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Pack posted — landed costs applied.');
    await load();
    await openPack(id);
  };

  const cancelPack = async (id: string) => {
    if (!window.confirm('Cancel this landed-cost pack?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('cancel_landed_cost_pack', { p_pack_id: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Pack cancelled.');
    await load();
    await openPack(id);
  };

  const chargeTotal = charges.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const allocTotal = allocations.reduce((sum, row) => sum + Number(row.allocated_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Landed cost</h1>
          <p className="text-sm text-muted-foreground">
            Pack freight, duty, and other charges, allocate to vehicles/parts, then post to update stock{' '}
            <code className="text-xs">landed_cost</code>.
          </p>
        </div>
        <Button type="button" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          New pack
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New landed-cost pack</CardTitle>
            <CardDescription>
              Charges are split across selected stock by equal share or purchase value. Post later to write{' '}
              <code className="text-xs">landed_cost</code> on each unit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Pack date</Label>
                <Input type="date" value={packDate} onChange={(e) => setPackDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Allocation method</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={allocationMethod}
                  onChange={(e) => setAllocationMethod(e.target.value as LandedCostAllocationMethod)}
                >
                  <option value="equal">Equal split</option>
                  <option value="purchase_value">By purchase value</option>
                  <option value="manual">Manual amounts</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Supplier (optional)</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">None</option>
                  {suppliers.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.supplier_code} — {row.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Purchase order (optional)</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={purchaseOrderId} onChange={(e) => setPurchaseOrderId(e.target.value)}>
                  <option value="">None</option>
                  {purchaseOrders.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.po_number} · {row.currency}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>GRN (optional)</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={inventoryReceiptId} onChange={(e) => setInventoryReceiptId(e.target.value)}>
                  <option value="">None</option>
                  {receipts.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.receipt_number} · {row.received_date}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Supplier invoice file (optional)</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={supplierInvoiceId} onChange={(e) => setSupplierInvoiceId(e.target.value)}>
                  <option value="">None</option>
                  {supplierInvoices.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.invoice_number || row.file_name} · {row.supplier_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Charges</Label>
              {draftCharges.map((line, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={line.charge_type}
                      onChange={(e) =>
                        setDraftCharges((rows) =>
                          rows.map((row, i) => (i === index ? { ...row, charge_type: e.target.value as LandedCostChargeType } : row))
                        )
                      }
                    >
                      {CHARGE_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label>Description</Label>
                    <Input
                      value={line.description}
                      onChange={(e) =>
                        setDraftCharges((rows) => rows.map((row, i) => (i === index ? { ...row, description: e.target.value } : row)))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.amount}
                      onChange={(e) =>
                        setDraftCharges((rows) => rows.map((row, i) => (i === index ? { ...row, amount: e.target.value } : row)))
                      }
                    />
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setDraftCharges((rows) => [...rows, emptyCharge()])}>
                <Plus className="h-4 w-4" />
                Add charge line
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Vehicles</Label>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                  {vehicles.map((row) => (
                    <label key={row.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary/60">
                      <input type="checkbox" checked={selectedVehicleIds.includes(row.id)} onChange={() => toggleVehicle(row.id)} />
                      <span className="truncate">{row.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{selectedVehicleIds.length} vehicles selected</p>
              </div>
              <div className="space-y-2">
                <Label>Parts</Label>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                  {parts.map((row) => (
                    <label key={row.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary/60">
                      <input type="checkbox" checked={selectedPartIds.includes(row.id)} onChange={() => togglePart(row.id)} />
                      <span className="truncate">{row.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{selectedPartIds.length} parts selected</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void createPack()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create draft pack
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calculator className="h-5 w-5" />
              Packs
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search pack number or status" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No landed-cost packs yet.</p>
            ) : (
              filtered.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => void openPack(row.id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selectedId === row.id ? 'border-primary bg-primary/5' : 'hover:bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{row.pack_number}</span>
                    <Badge className={statusBadge[row.status]}>{row.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.pack_date} · {money(row.total_charges, row.currency)} · {row.allocation_method.replaceAll('_', ' ')}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{selected ? selected.pack_number : 'Pack detail'}</CardTitle>
            <CardDescription>
              {selected
                ? `Status ${selected.status}. Formula on post: purchase_price + allocated charges → landed_cost.`
                : 'Select a pack to manage charges and allocations.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Choose a pack from the list.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {isDraft ? (
                    <>
                      <Button type="button" variant="accent" disabled={busy} onClick={() => void postPack(selected.id)}>
                        <CheckCircle2 className="h-4 w-4" />
                        Post &amp; apply
                      </Button>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => void redistribute('equal')}>
                        Split equal
                      </Button>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => void redistribute('purchase_value')}>
                        Split by purchase
                      </Button>
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => void cancelPack(selected.id)}>
                        <XCircle className="h-4 w-4" />
                        Cancel pack
                      </Button>
                    </>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link href="/admin/inventory/receive">Receive stock</Link>
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Charges</p>
                    <p className="font-semibold">{money(chargeTotal, selected.currency)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Allocated</p>
                    <p className="font-semibold">{money(allocTotal, selected.currency)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Method</p>
                    <p className="font-semibold">{selected.allocation_method.replaceAll('_', ' ')}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Charges</h3>
                  {charges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No charges.</p>
                  ) : (
                    <div className="space-y-1">
                      {charges.map((row) => (
                        <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                          <div>
                            <span className="font-medium capitalize">{row.charge_type}</span>
                            {row.description ? <span className="text-muted-foreground"> — {row.description}</span> : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <span>{money(row.amount, selected.currency)}</span>
                            {isDraft ? (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={() => void removeCharge(row.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isDraft ? (
                    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1.2fr_1fr_auto]">
                      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={addChargeType} onChange={(e) => setAddChargeType(e.target.value as LandedCostChargeType)}>
                        {CHARGE_TYPES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <Input placeholder="Description" value={addChargeDesc} onChange={(e) => setAddChargeDesc(e.target.value)} />
                      <Input type="number" min="0" step="0.01" placeholder="Amount" value={addChargeAmount} onChange={(e) => setAddChargeAmount(e.target.value)} />
                      <Button type="button" disabled={busy} onClick={() => void addCharge()}>
                        Add
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Allocations</h3>
                  {allocations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No stock lines.</p>
                  ) : (
                    <div className="space-y-1">
                      {allocations.map((row) => (
                        <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.label}</p>
                            <p className="text-xs capitalize text-muted-foreground">{row.inventory_type}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>{money(row.allocated_amount, selected.currency)}</span>
                            {isDraft ? (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={() => void removeAllocation(row.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isDraft ? (
                    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1fr_auto]">
                      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={addInventoryType} onChange={(e) => setAddInventoryType(e.target.value as 'vehicle' | 'part')}>
                        <option value="vehicle">Vehicle</option>
                        <option value="part">Part</option>
                      </select>
                      {addInventoryType === 'vehicle' ? (
                        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={addVehicleId} onChange={(e) => setAddVehicleId(e.target.value)}>
                          <option value="">Select vehicle</option>
                          {vehicles.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={addPartId} onChange={(e) => setAddPartId(e.target.value)}>
                          <option value="">Select part</option>
                          {parts.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <Input type="number" min="0" step="0.01" placeholder="Amount (optional)" value={addAllocAmount} onChange={(e) => setAddAllocAmount(e.target.value)} />
                      <Button type="button" disabled={busy} onClick={() => void addAllocation()}>
                        Add
                      </Button>
                    </div>
                  ) : null}
                </div>

                {selected.notes ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selected.notes}</p> : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

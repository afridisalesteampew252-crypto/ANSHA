'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Loader2, RotateCcw, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import type {
  PurchaseOrder,
  Supplier,
  SupplierInvoice,
  SupplierPayment,
  SupplierPaymentAllocation,
} from '@/lib/types';

const money = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

export default function SupplierSoaPage() {
  const params = useParams<{ id: string }>();
  const supplierId = params.id;

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [allocations, setAllocations] = useState<SupplierPaymentAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [method, setMethod] = useState('bank_transfer');
  const [bankReference, setBankReference] = useState('');
  const [notes, setNotes] = useState('');

  const [paymentId, setPaymentId] = useState('');
  const [targetType, setTargetType] = useState<'po' | 'invoice'>('po');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [supplierInvoiceId, setSupplierInvoiceId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [supRes, poRes, invRes, payRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('id', supplierId).maybeSingle(),
      supabase.from('purchase_orders').select('*').eq('supplier_id', supplierId).order('order_date', { ascending: false }),
      supabase.from('supplier_invoices').select('*').eq('supplier_id', supplierId).order('invoice_date', { ascending: false }),
      supabase.from('supplier_payments').select('*').eq('supplier_id', supplierId).order('paid_date', { ascending: false }),
    ]);
    if (supRes.error) toast.error(supRes.error.message);
    const paymentRows = (payRes.data || []) as SupplierPayment[];
    setSupplier((supRes.data || null) as Supplier | null);
    setOrders((poRes.data || []) as PurchaseOrder[]);
    setInvoices((invRes.data || []) as SupplierInvoice[]);
    setPayments(paymentRows);
    if (supRes.data?.currency) setCurrency(supRes.data.currency);

    if (paymentRows.length) {
      const { data, error } = await supabase
        .from('supplier_payment_allocations')
        .select('*')
        .in('payment_id', paymentRows.map((row) => row.id))
        .order('created_at', { ascending: false });
      if (error) toast.error(error.message);
      setAllocations((data || []) as SupplierPaymentAllocation[]);
    } else {
      setAllocations([]);
    }
    setLoading(false);
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const allocatedByPayment = useMemo(
    () => allocations.reduce<Record<string, number>>((sum, row) => ({ ...sum, [row.payment_id]: (sum[row.payment_id] || 0) + Number(row.amount) }), {}),
    [allocations]
  );

  const openOrders = useMemo(
    () => orders.filter((row) => row.status !== 'cancelled' && Number(row.amount_ordered) - Number(row.amount_paid) > 0.009),
    [orders]
  );

  const invoiceAllocated = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of allocations) {
      if (!row.supplier_invoice_id) continue;
      map[row.supplier_invoice_id] = (map[row.supplier_invoice_id] || 0) + Number(row.amount);
    }
    return map;
  }, [allocations]);

  const openInvoices = useMemo(
    () => invoices.filter((row) => Number(row.total_amount) - (invoiceAllocated[row.id] || 0) > 0.009),
    [invoices, invoiceAllocated]
  );

  const usablePayments = useMemo(
    () => payments.filter((row) => row.status === 'confirmed' && Number(row.amount) - (allocatedByPayment[row.id] || 0) > 0.009),
    [payments, allocatedByPayment]
  );

  const totalOrdered = orders.filter((row) => row.status !== 'cancelled').reduce((sum, row) => sum + Number(row.amount_ordered), 0);
  const totalPaid = payments.filter((row) => row.status === 'confirmed').reduce((sum, row) => sum + Number(row.amount), 0);
  const totalAllocated = allocations.reduce((sum, row) => sum + Number(row.amount), 0);
  const outstanding = Math.max(0, totalOrdered - orders.filter((row) => row.status !== 'cancelled').reduce((sum, row) => sum + Number(row.amount_paid), 0));
  const displayCurrency = orders[0]?.currency || payments[0]?.currency || supplier?.currency || 'AED';

  const selectedPayment = payments.find((row) => row.id === paymentId);

  const createPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!Number(amount)) {
      toast.error('Enter a payment amount.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('create_supplier_payment', {
      p_supplier_id: supplierId,
      p_paid_date: paidDate,
      p_amount: Number(amount),
      p_currency: currency,
      p_method: method,
      p_bank_reference: bankReference || null,
      p_status: 'confirmed',
      p_notes: notes || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Supplier payment recorded.');
    setAmount('');
    setBankReference('');
    setNotes('');
    await load();
  };

  const allocate = async () => {
    if (!paymentId || !Number(allocAmount)) {
      toast.error('Choose a payment and amount.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('allocate_supplier_payment', {
      p_payment_id: paymentId,
      p_purchase_order_id: targetType === 'po' ? purchaseOrderId || null : null,
      p_supplier_invoice_id: targetType === 'invoice' ? supplierInvoiceId || null : null,
      p_amount: Number(allocAmount),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Payment allocated.');
    setAllocAmount('');
    await load();
  };

  const reverse = async (allocationId: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('reverse_supplier_payment_allocation', { p_allocation_id: allocationId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Allocation reversed.');
    await load();
  };

  const exportCsv = () => {
    if (!supplier) return;
    const lines = [
      ['Date', 'Reference', 'Type', 'Debit', 'Credit', 'Currency'].join(','),
      ...orders
        .filter((row) => row.status !== 'cancelled')
        .map((row) => [row.order_date, row.po_number, 'Purchase order', row.amount_ordered, '', row.currency].join(',')),
      ...invoices.map((row) => [row.invoice_date, row.invoice_number || row.file_name, 'Supplier invoice', row.total_amount, '', row.currency].join(',')),
      ...payments
        .filter((row) => row.status === 'confirmed')
        .map((row) => [row.paid_date, row.payment_number, 'Payment', '', row.amount, row.currency].join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${supplier.supplier_code}-soa.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost"><Link href="/admin/suppliers"><ArrowLeft className="h-4 w-4" />Back</Link></Button>
        <p className="text-sm text-muted-foreground">Supplier not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link href="/admin/suppliers"><ArrowLeft className="h-4 w-4" />Suppliers</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground">
            {supplier.supplier_code} · Supplier statement of account
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" />Export CSV
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>Print / PDF</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['PO ordered', money(totalOrdered, displayCurrency)],
          ['Payments recorded', money(totalPaid, displayCurrency)],
          ['Allocated', money(totalAllocated, displayCurrency)],
          ['PO outstanding', money(outstanding, displayCurrency)],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><WalletCards className="h-5 w-5" />Record payment</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void createPayment(event)}>
              <div className="space-y-1.5">
                <Label>Paid date</Label>
                <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} required />
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="cheque">Cheque</option>
                  <option value="remittance_company">Remittance company</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Bank reference</Label>
                <Input value={bankReference} onChange={(e) => setBankReference(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save payment</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Allocate to PO / invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Confirmed payment</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentId} onChange={(e) => {
                setPaymentId(e.target.value);
                const pay = payments.find((row) => row.id === e.target.value);
                const available = pay ? Number(pay.amount) - (allocatedByPayment[pay.id] || 0) : 0;
                setAllocAmount(String(available || ''));
              }}>
                <option value="">Select payment</option>
                {usablePayments.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.payment_number} · {money(Number(row.amount) - (allocatedByPayment[row.id] || 0), row.currency)} available
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Target</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={targetType} onChange={(e) => setTargetType(e.target.value as 'po' | 'invoice')}>
                <option value="po">Purchase order</option>
                <option value="invoice">Supplier invoice file</option>
              </select>
            </div>
            {targetType === 'po' ? (
              <div className="space-y-1.5">
                <Label>Open PO</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={purchaseOrderId} onChange={(e) => {
                  setPurchaseOrderId(e.target.value);
                  const po = orders.find((row) => row.id === e.target.value);
                  const available = selectedPayment ? Number(selectedPayment.amount) - (allocatedByPayment[selectedPayment.id] || 0) : 0;
                  const due = po ? Number(po.amount_ordered) - Number(po.amount_paid) : 0;
                  setAllocAmount(String(Math.min(available, due) || ''));
                }}>
                  <option value="">Select PO</option>
                  {openOrders.filter((row) => !selectedPayment || row.currency === selectedPayment.currency).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.po_number} · {money(Number(row.amount_ordered) - Number(row.amount_paid), row.currency)} due
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Open supplier invoice</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={supplierInvoiceId} onChange={(e) => {
                  setSupplierInvoiceId(e.target.value);
                  const inv = invoices.find((row) => row.id === e.target.value);
                  const available = selectedPayment ? Number(selectedPayment.amount) - (allocatedByPayment[selectedPayment.id] || 0) : 0;
                  const due = inv ? Number(inv.total_amount) - (invoiceAllocated[inv.id] || 0) : 0;
                  setAllocAmount(String(Math.min(available, due) || ''));
                }}>
                  <option value="">Select invoice</option>
                  {openInvoices.filter((row) => !selectedPayment || row.currency === selectedPayment.currency).map((row) => (
                    <option key={row.id} value={row.id}>
                      {(row.invoice_number || row.file_name)} · {money(Number(row.total_amount) - (invoiceAllocated[row.id] || 0), row.currency)} due
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" min="0.01" step="0.01" value={allocAmount} onChange={(e) => setAllocAmount(e.target.value)} />
            </div>
            <Button type="button" disabled={busy || !paymentId} onClick={() => void allocate()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Apply allocation
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Statement ledger</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Reference</th>
                  <th className="p-4">Type</th>
                  <th className="p-4 text-right">Debit</th>
                  <th className="p-4 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {orders.filter((row) => row.status !== 'cancelled').map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-4">{row.order_date}</td>
                    <td className="p-4"><Link href="/admin/purchase-orders" className="font-semibold text-primary hover:underline">{row.po_number}</Link></td>
                    <td className="p-4">Purchase order · {row.match_status.replaceAll('_', ' ')}</td>
                    <td className="p-4 text-right">{money(row.amount_ordered, row.currency)}</td>
                    <td className="p-4 text-right">{money(row.amount_paid, row.currency)}</td>
                  </tr>
                ))}
                {payments.filter((row) => row.status === 'confirmed').map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-4">{row.paid_date}</td>
                    <td className="p-4 font-mono font-semibold">{row.payment_number}</td>
                    <td className="p-4">Payment · {row.method.replaceAll('_', ' ')}</td>
                    <td className="p-4 text-right">—</td>
                    <td className="p-4 text-right">{money(row.amount, row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payments and allocations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {payments.map((row) => {
            const used = allocatedByPayment[row.id] || 0;
            return (
              <div key={row.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{row.payment_number}</p>
                    <p className="text-xs text-muted-foreground">{row.paid_date} · {row.method.replaceAll('_', ' ')} · {row.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{money(row.amount, row.currency)}</p>
                    <p className="text-xs text-muted-foreground">{money(Number(row.amount) - used, row.currency)} available</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {allocations.filter((item) => item.payment_id === row.id).map((allocation) => {
                    const po = orders.find((item) => item.id === allocation.purchase_order_id);
                    const inv = invoices.find((item) => item.id === allocation.supplier_invoice_id);
                    return (
                      <div key={allocation.id} className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2 text-xs">
                        <span>
                          Applied to {po?.po_number || inv?.invoice_number || inv?.file_name || 'target'} · {money(allocation.amount, row.currency)}
                        </span>
                        <Button variant="ghost" size="sm" className="h-7 text-destructive" disabled={busy} onClick={() => void reverse(allocation.id)}>
                          <RotateCcw className="h-3.5 w-3.5" />Reverse
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {payments.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No supplier payments yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

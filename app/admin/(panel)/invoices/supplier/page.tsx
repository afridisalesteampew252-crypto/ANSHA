'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileUp, Loader2, ReceiptText, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type SupplierInvoice = {
  id: string; supplier_name: string; invoice_number: string | null; invoice_date: string;
  currency: string; total_amount: number; reference: string | null; notes: string | null;
  storage_path: string; file_name: string; created_by: string; created_at: string;
  purchase_order_id: string | null;
};
type PurchaseOrderOption = { id: string; po_number: string; status: string };

const MAX_BYTES = 25 * 1024 * 1024;
const today = new Date().toISOString().slice(0, 10);
const safeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'supplier-invoice';

export default function SupplierInvoicesPage() {
  const [records, setRecords] = useState<SupplierInvoice[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([]);
  const [supplier, setSupplier] = useState('');
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(today);
  const [currency, setCurrency] = useState('AED');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const [invRes, poRes] = await Promise.all([
      supabase.from('supplier_invoices').select('*').order('invoice_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('purchase_orders').select('id,po_number,status').in('status', ['draft', 'ordered']).order('order_date', { ascending: false }).limit(100),
    ]);
    if (invRes.error) setNotice(invRes.error.message);
    setRecords((invRes.data || []) as SupplierInvoice[]);
    setPurchaseOrders((poRes.data || []) as PurchaseOrderOption[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !supplier.trim()) return setNotice('Supplier and invoice document are required.');
    if (file.size > MAX_BYTES) return setNotice('File must be 25 MB or smaller.');
    setBusy(true); setNotice('Uploading supplier invoice…');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return setNotice('Your session has expired.'); }
    const path = `${user.id}/${Date.now()}-${safeName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from('supplier-invoices').upload(path, file, { contentType: file.type || undefined, cacheControl: '3600' });
    if (uploadError) { setBusy(false); return setNotice(uploadError.message); }
    const { data: inserted, error } = await supabase.from('supplier_invoices').insert({
      supplier_name: supplier.trim(), invoice_number: number.trim() || null, invoice_date: date,
      currency, total_amount: Number(amount || 0), reference: reference.trim() || null,
      notes: notes.trim() || null, storage_path: path, file_name: file.name,
      mime_type: file.type || null, size_bytes: file.size, created_by: user.id,
      purchase_order_id: purchaseOrderId || null,
    }).select('id').single();
    if (error) { await supabase.storage.from('supplier-invoices').remove([path]); setBusy(false); return setNotice(error.message); }
    if (purchaseOrderId && inserted?.id) {
      const { error: linkError } = await supabase.rpc('link_supplier_invoice_to_po', {
        p_supplier_invoice_id: inserted.id,
        p_purchase_order_id: purchaseOrderId,
      });
      if (linkError) setNotice(linkError.message);
    }
    setSupplier(''); setNumber(''); setAmount(''); setReference(''); setNotes(''); setPurchaseOrderId(''); setFile(null);
    setBusy(false); setNotice('Supplier invoice saved securely.'); await load();
  }

  async function linkToPo(record: SupplierInvoice, poId: string) {
    setBusy(true);
    const { error } = await supabase.rpc('link_supplier_invoice_to_po', {
      p_supplier_invoice_id: record.id,
      p_purchase_order_id: poId || null,
    });
    setBusy(false);
    if (error) return setNotice(error.message);
    setNotice(poId ? 'Linked to purchase order.' : 'PO link cleared.');
    await load();
  }

  async function openRecord(record: SupplierInvoice) {
    const { data, error } = await supabase.storage.from('supplier-invoices').createSignedUrl(record.storage_path, 60);
    if (error || !data?.signedUrl) return setNotice(error?.message || 'Unable to open document.');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function removeRecord(record: SupplierInvoice) {
    if (!window.confirm(`Delete supplier invoice ${record.invoice_number || record.file_name}?`)) return;
    const { error } = await supabase.from('supplier_invoices').delete().eq('id', record.id);
    if (error) return setNotice(error.message);
    await supabase.storage.from('supplier-invoices').remove([record.storage_path]);
    setNotice('Supplier invoice deleted.'); await load();
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <div><Button asChild variant="ghost" className="-ml-3 mb-2"><Link href="/admin/invoices"><ArrowLeft className="h-4 w-4" />Invoice management</Link></Button><h1 className="text-2xl font-bold">Supplier and market invoices</h1><p className="text-sm text-muted-foreground">Keep purchase invoices and documents received from suppliers in a private, searchable company record.</p></div>
    <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
      <Card className="h-fit"><CardHeader><CardTitle className="text-lg">Upload received invoice</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="supplier">Supplier *</Label><Input id="supplier" required value={supplier} onChange={(event) => setSupplier(event.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="number">Invoice number</Label><Input id="number" value={number} onChange={(event) => setNumber(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="date">Invoice date</Label><Input id="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div></div>
        <div className="grid grid-cols-[7rem_1fr] gap-3"><div className="space-y-1.5"><Label>Currency</Label><select value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm"><option>AED</option><option>USD</option><option>JPY</option><option>EUR</option><option>GBP</option></select></div><div className="space-y-1.5"><Label htmlFor="amount">Total amount</Label><Input id="amount" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></div>
        <div className="space-y-1.5"><Label htmlFor="reference">Purchase / stock reference</Label><Input id="reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="PO, chassis, stock or part reference" /></div>
        <div className="space-y-1.5"><Label htmlFor="po">Link purchase order</Label><select id="po" value={purchaseOrderId} onChange={(event) => setPurchaseOrderId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm"><option value="">None</option>{purchaseOrders.map((row) => <option key={row.id} value={row.id}>{row.po_number} · {row.status}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="document">Invoice document *</Label><Input id="document" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} /><p className="text-xs text-muted-foreground">PDF, image, Word, or Excel up to 25 MB. Stored privately.</p></div>
        <div className="space-y-1.5"><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
        <Button className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}{busy ? 'Uploading…' : 'Save supplier invoice'}</Button>
      </form></CardContent></Card>

      <div className="space-y-3">{notice && <div role="status" className="rounded-lg border bg-secondary/30 p-3 text-sm">{notice}</div>}{records.length === 0 ? <Card><CardContent className="py-16 text-center"><ReceiptText className="mx-auto h-10 w-10 text-muted-foreground/30" /><p className="mt-3 text-sm text-muted-foreground">No supplier invoices uploaded.</p></CardContent></Card> : records.map((record) => <Card key={record.id}><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{record.supplier_name}</h2><span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{record.invoice_number || 'No invoice number'}</span></div><p className="mt-1 truncate text-sm text-muted-foreground">{record.file_name}</p><p className="mt-1 text-xs text-muted-foreground">{record.invoice_date} · {record.currency} {Number(record.total_amount).toLocaleString()}{record.reference ? ` · Ref ${record.reference}` : ''}{record.purchase_order_id ? ` · PO linked` : ''}</p><div className="mt-2"><select className="h-9 w-full max-w-xs rounded-md border bg-background px-2 text-xs" value={record.purchase_order_id || ''} disabled={busy} onChange={(event) => void linkToPo(record, event.target.value)}><option value="">No PO link</option>{purchaseOrders.map((row) => <option key={row.id} value={row.id}>{row.po_number}</option>)}</select></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void openRecord(record)}><Download className="h-4 w-4" />Open</Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => void removeRecord(record)}><Trash2 className="h-4 w-4" /></Button></div></CardContent></Card>)}</div>
    </div>
  </div>;
}

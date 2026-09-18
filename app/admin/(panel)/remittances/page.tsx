'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, ExternalLink, FileText, Loader2, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { SearchableSelect, customerSelectOption } from '@/components/admin/searchable-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Customer = { id: string; full_name: string; company_name: string | null; customer_code?: string | null; phone?: string | null; email?: string | null };
type Invoice = { id: string; invoice_number: string; customer_id: string | null; customer_name: string; customer_company: string | null; currency: string; balance_due: number; status: string };
type Document = { id: string; remittance_id: string; storage_path: string; file_name: string; size_bytes: number | null };
type Remittance = { id: string; remittance_number: string; customer_id: string | null; customer_name: string; invoice_id: string | null; received_date: string; amount: number; currency: string; method: string; bank_reference: string | null; sender_bank: string | null; receiving_bank: string | null; status: string; notes: string | null; created_at: string };
const emptyForm = { customer_id: '', invoice_id: '', customer_name: '', received_date: new Date().toISOString().slice(0, 10), amount: '', currency: 'AED', method: 'bank_transfer', bank_reference: '', sender_bank: '', receiving_bank: 'WIO BANK', status: 'pending', notes: '' };
const money = (value: number, currency: string) => new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(Number(value || 0));
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export default function RemittancesPage() {
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState<File[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const [remittanceResult, documentResult, customerResult, invoiceResult] = await Promise.all([
      supabase.from('remittances').select('*').order('received_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('remittance_documents').select('*').order('created_at'),
      supabase.from('customers').select('id,full_name,company_name,customer_code,phone,email').eq('is_active', true).order('company_name').order('full_name'),
      supabase.from('invoices').select('id,invoice_number,customer_id,customer_name,customer_company,currency,balance_due,status').gt('balance_due', 0).neq('status', 'cancelled').order('issue_date', { ascending: false }),
    ]);
    if (remittanceResult.error) setMessage(remittanceResult.error.message);
    setRemittances((remittanceResult.data || []) as Remittance[]);
    setDocuments((documentResult.data || []) as Document[]);
    setCustomers((customerResult.data || []) as Customer[]);
    setInvoices((invoiceResult.data || []) as Invoice[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startCreate = () => {
    setEditingId(null); setForm(emptyForm); setFiles([]); setMessage(''); setOpen(true);
  };
  const startEdit = (item: Remittance) => {
    setEditingId(item.id);
    setForm({
      customer_id: item.customer_id || '', invoice_id: item.invoice_id || '', customer_name: item.customer_name,
      received_date: item.received_date, amount: String(item.amount), currency: item.currency, method: item.method,
      bank_reference: item.bank_reference || '', sender_bank: item.sender_bank || '',
      receiving_bank: item.receiving_bank || '', status: item.status, notes: item.notes || '',
    });
    setFiles([]); setMessage(''); setOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const chooseInvoice = (id: string) => {
    const invoice = invoices.find((item) => item.id === id);
    setForm((current) => invoice ? { ...current, invoice_id: id, customer_id: invoice.customer_id || '', customer_name: invoice.customer_company || invoice.customer_name, currency: invoice.currency, amount: String(invoice.balance_due) } : { ...current, invoice_id: id });
  };
  const chooseCustomer = (id: string) => {
    const customer = customers.find((item) => item.id === id);
    setForm((current) => ({ ...current, customer_id: id, customer_name: customer ? customer.company_name || customer.full_name : current.customer_name }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.customer_name.trim() || Number(form.amount) <= 0) return setMessage('Customer/sender and a positive amount are required.');
    const oversized = files.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) return setMessage(`${oversized.name} exceeds the 25 MB document limit.`);
    setBusy(true); setMessage('Saving remittance…');
    let remittanceId = editingId;
    if (editingId) {
      const { error } = await supabase.from('remittances').update({
        customer_id: form.customer_id || null, invoice_id: form.invoice_id || null, customer_name: form.customer_name.trim(),
        received_date: form.received_date, amount: Number(form.amount), currency: form.currency, method: form.method,
        bank_reference: form.bank_reference.trim() || null, sender_bank: form.sender_bank.trim() || null,
        receiving_bank: form.receiving_bank.trim() || null, status: form.status, notes: form.notes.trim() || null,
      }).eq('id', editingId);
      if (error) { setBusy(false); return setMessage(error.message); }
    } else {
      const { data, error } = await supabase.rpc('create_remittance', {
        p_customer_id: form.customer_id || null, p_invoice_id: form.invoice_id || null, p_customer_name: form.customer_name.trim(),
        p_received_date: form.received_date, p_amount: Number(form.amount), p_currency: form.currency, p_method: form.method,
        p_bank_reference: form.bank_reference.trim(), p_sender_bank: form.sender_bank.trim(), p_receiving_bank: form.receiving_bank.trim(),
        p_status: form.status, p_notes: form.notes.trim(),
      });
      if (error || !data) { setBusy(false); return setMessage(error?.message || 'Could not save remittance.'); }
      remittanceId = String(data);
    }
    if (!remittanceId) { setBusy(false); return setMessage('Could not identify the remittance record.'); }
    const { data: { user } } = await supabase.auth.getUser();
    try {
      if (!user && files.length) throw new Error('Session expired before document upload.');
      for (const file of files) {
        const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
        const path = `${user!.id}/${remittanceId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('remittance-documents').upload(path, file, { cacheControl: '31536000' });
        if (uploadError) throw uploadError;
        const { error: rowError } = await supabase.from('remittance_documents').insert({ remittance_id: remittanceId, storage_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size, uploaded_by: user!.id });
        if (rowError) throw rowError;
      }
      setMessage(editingId ? 'Remittance updated and its linked invoice balance recalculated.' : form.status === 'confirmed' && form.invoice_id ? 'Remittance confirmed and applied to the invoice once.' : 'Remittance saved.');
      setForm(emptyForm); setFiles([]); setEditingId(null); setOpen(false); await load();
    } catch (uploadError) {
      setMessage(`Money record saved, but a document failed: ${uploadError instanceof Error ? uploadError.message : 'upload error'}`);
      await load();
    } finally { setBusy(false); }
  };

  const viewDocument = async (document: Document) => {
    const { data, error } = await supabase.storage.from('remittance-documents').createSignedUrl(document.storage_path, 300);
    if (error || !data?.signedUrl) return setMessage(error?.message || 'Could not open document.');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const remove = async (item: Remittance) => {
    if (!window.confirm(`Delete ${item.remittance_number}? A linked invoice payment will be reversed. This cannot be undone.`)) return;
    setBusy(true); setMessage('Deleting remittance and reversing linked payment…');
    const paths = documents.filter((document) => document.remittance_id === item.id).map((document) => document.storage_path);
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from('remittance-documents').remove(paths);
      if (storageError) { setBusy(false); return setMessage(`Could not remove private documents: ${storageError.message}`); }
    }
    const { error } = await supabase.from('remittances').delete().eq('id', item.id);
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage('Remittance deleted and linked invoice balance recalculated.'); await load();
  };

  const totals = useMemo(() => remittances.filter((item) => item.status === 'confirmed').reduce<Record<string, number>>((sum, item) => ({ ...sum, [item.currency]: (sum[item.currency] || 0) + Number(item.amount) }), {}), [remittances]);
  const customerOptions = useMemo(() => customers.map(customerSelectOption), [customers]);
  const invoiceOptions = useMemo(
    () =>
      invoices.map((item) => ({
        value: item.id,
        label: `${item.invoice_number} — ${item.customer_company || item.customer_name} — ${money(item.balance_due, item.currency)}`,
        keywords: [item.invoice_number, item.customer_company, item.customer_name],
      })),
    [invoices]
  );

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold">Remittances</h1><p className="text-sm text-muted-foreground">Record customer funds, reconcile invoices, and keep private transfer evidence.</p></div><Button onClick={startCreate}><Plus className="h-4 w-4" />New remittance</Button></div>
    <div className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Records</p><p className="mt-1 text-2xl font-bold">{remittances.length}</p></CardContent></Card>{Object.entries(totals).slice(0,2).map(([currency,total]) => <Card key={currency}><CardContent className="p-5"><p className="text-sm text-muted-foreground">Confirmed {currency}</p><p className="mt-1 text-2xl font-bold">{money(total,currency)}</p></CardContent></Card>)}</div>

    {open && <Card><CardHeader><CardTitle className="text-lg">{editingId ? 'Edit remittance' : 'Record money received'}</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="space-y-1.5"><Label htmlFor="rem-invoice">Apply to invoice (optional)</Label><SearchableSelect id="rem-invoice" value={form.invoice_id} onValueChange={chooseInvoice} options={invoiceOptions} placeholder="Unapplied transfer" searchPlaceholder="Search invoice or customer…" clearLabel="Unapplied transfer" /></div>
      <div className="space-y-1.5"><Label htmlFor="rem-customer">Saved customer (optional)</Label><SearchableSelect id="rem-customer" value={form.customer_id} onValueChange={chooseCustomer} options={customerOptions} placeholder="Select customer" searchPlaceholder="Search code, name, company, phone, email…" clearLabel="Select customer" /></div>
      <div className="space-y-1.5"><Label htmlFor="rem-name">Customer / sender *</Label><Input id="rem-name" required value={form.customer_name} onChange={(event)=>setForm({...form,customer_name:event.target.value})}/></div>
      <div className="space-y-1.5"><Label htmlFor="rem-date">Date received</Label><Input id="rem-date" type="date" value={form.received_date} onChange={(event)=>setForm({...form,received_date:event.target.value})}/></div>
      <div className="space-y-1.5"><Label htmlFor="rem-amount">Amount *</Label><Input id="rem-amount" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(event)=>setForm({...form,amount:event.target.value})}/></div>
      <div className="space-y-1.5"><Label htmlFor="rem-currency">Currency</Label><select id="rem-currency" value={form.currency} onChange={(event)=>setForm({...form,currency:event.target.value})} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option>AED</option><option>USD</option><option>EUR</option><option>GBP</option></select></div>
      <div className="space-y-1.5"><Label htmlFor="rem-method">Method</Label><select id="rem-method" value={form.method} onChange={(event)=>setForm({...form,method:event.target.value})} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="other">Other</option></select></div>
      <div className="space-y-1.5"><Label htmlFor="rem-status">Reconciliation status</Label><select id="rem-status" value={form.status} onChange={(event)=>setForm({...form,status:event.target.value})} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="pending">Pending review</option><option value="confirmed">Confirmed received</option><option value="rejected">Rejected</option><option value="reversed">Reversed</option></select></div>
      <div className="space-y-1.5"><Label htmlFor="rem-reference">Bank reference</Label><Input id="rem-reference" value={form.bank_reference} onChange={(event)=>setForm({...form,bank_reference:event.target.value})}/></div>
      <div className="space-y-1.5"><Label htmlFor="rem-sender-bank">Sender bank</Label><Input id="rem-sender-bank" value={form.sender_bank} onChange={(event)=>setForm({...form,sender_bank:event.target.value})}/></div>
      <div className="space-y-1.5"><Label htmlFor="rem-receiving-bank">Receiving bank</Label><Input id="rem-receiving-bank" value={form.receiving_bank} onChange={(event)=>setForm({...form,receiving_bank:event.target.value})}/></div>
      <div className="space-y-1.5"><Label htmlFor="rem-files">Receipts / documents</Label><Input id="rem-files" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv" onChange={(event)=>setFiles(Array.from(event.target.files || []))}/><p className="text-xs text-muted-foreground">Private, up to 25 MB each.</p></div>
      <div className="space-y-1.5 md:col-span-2 xl:col-span-3"><Label htmlFor="rem-notes">Notes</Label><Textarea id="rem-notes" rows={2} value={form.notes} onChange={(event)=>setForm({...form,notes:event.target.value})}/></div>
      {form.status === 'confirmed' && form.invoice_id && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2 xl:col-span-3">Confirmation will create one linked invoice payment. The same remittance cannot be applied twice.</p>}
      <div className="flex items-center gap-3 md:col-span-2 xl:col-span-3"><Button disabled={busy}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Banknote className="h-4 w-4"/>}{busy?'Saving…':editingId?'Update remittance':'Save remittance'}</Button><Button type="button" variant="outline" onClick={()=>{setOpen(false);setEditingId(null);setForm(emptyForm);setFiles([]);}}>Cancel</Button></div>
    </form></CardContent></Card>}

    {message && <div role="status" className="rounded-lg border bg-secondary/30 p-3 text-sm">{message}</div>}
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm"><thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-4">Record</th><th className="p-4">Customer</th><th className="p-4">Date / reference</th><th className="p-4 text-right">Amount</th><th className="p-4">Status</th><th className="p-4">Documents</th><th className="p-4 text-right">Actions</th></tr></thead><tbody>{remittances.map((item)=>{const docs=documents.filter((doc)=>doc.remittance_id===item.id);return <tr key={item.id} className="border-t align-top"><td className="p-4 font-semibold">{item.remittance_number}</td><td className="p-4">{item.customer_name}<p className="text-xs text-muted-foreground">{item.sender_bank || item.method.replaceAll('_',' ')}</p></td><td className="p-4">{item.received_date}<p className="text-xs text-muted-foreground">{item.bank_reference || 'No reference'}</p></td><td className="p-4 text-right font-semibold">{money(item.amount,item.currency)}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${item.status==='confirmed'?'bg-emerald-100 text-emerald-700':item.status==='pending'?'bg-amber-100 text-amber-700':'bg-zinc-200 text-zinc-700'}`}>{item.status}</span></td><td className="p-4">{docs.length===0?<span className="text-xs text-muted-foreground">None</span>:<div className="space-y-1">{docs.map((doc)=><button key={doc.id} onClick={()=>void viewDocument(doc)} className="flex max-w-48 items-center gap-1.5 text-left text-xs text-primary hover:underline"><Paperclip className="h-3.5 w-3.5 shrink-0"/><span className="truncate">{doc.file_name}</span><ExternalLink className="h-3 w-3 shrink-0"/></button>)}</div>}</td><td className="p-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={()=>startEdit(item)} aria-label={`Edit ${item.remittance_number}`}><Pencil className="h-4 w-4"/></Button><Button variant="ghost" size="icon" className="text-destructive" disabled={busy} onClick={()=>void remove(item)} aria-label={`Delete ${item.remittance_number}`}><Trash2 className="h-4 w-4"/></Button></div></td></tr>})}{remittances.length===0&&<tr><td colSpan={7} className="p-12 text-center text-muted-foreground"><FileText className="mx-auto mb-3 h-9 w-9"/>No remittances recorded.</td></tr>}</tbody></table></div></Card>
  </div>;
}

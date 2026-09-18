'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Banknote, CheckCircle2, KeyRound, Loader2, ReceiptText, RotateCcw, ShoppingBag, WalletCards } from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Customer = { id: string; customer_code: string; full_name: string; company_name: string | null; email: string | null; phone: string | null; country: string | null };
type Invoice = { id: string; invoice_number: string; document_type: string; issue_date: string; currency: string; status: string; total_amount: number; amount_paid: number; balance_due: number };
type InvoiceItem = { id: string; invoice_id: string; description: string; quantity: number; line_total: number; inventory_type: string | null; inventory_reference: string | null };
type Remittance = { id: string; remittance_number: string; received_date: string; amount: number; currency: string; status: string; method: string; bank_reference: string | null };
type Allocation = { id: string; remittance_id: string; invoice_id: string; invoice_payment_id: string; amount: number; created_at: string };
type PortalLink = { id: string; email: string; full_name: string | null; is_active: boolean };

const money = (value: number, currency = 'AED') => new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));
const receivableDocument = (type: string) => type === 'tax_invoice' || type === 'commercial_invoice';

export default function CustomerAccountPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [portalLink, setPortalLink] = useState<PortalLink | null>(null);
  const [portalEmail, setPortalEmail] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [portalBusy, setPortalBusy] = useState(false);
  const [remittanceId, setRemittanceId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [allocationAmount, setAllocationAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [customerResult, invoiceResult, remittanceResult, portalResult] = await Promise.all([
      supabase.from('customers').select('id,customer_code,full_name,company_name,email,phone,country').eq('id', customerId).single(),
      supabase.from('invoices').select('id,invoice_number,document_type,issue_date,currency,status,total_amount,amount_paid,balance_due').eq('customer_id', customerId).order('issue_date', { ascending: false }),
      supabase.from('remittances').select('id,remittance_number,received_date,amount,currency,status,method,bank_reference').eq('customer_id', customerId).order('received_date', { ascending: false }),
      supabase.from('customer_profiles').select('id,email,full_name,is_active').eq('customer_id', customerId).maybeSingle(),
    ]);
    if (customerResult.error) setNotice(customerResult.error.message);
    const invoiceRows = (invoiceResult.data || []) as Invoice[];
    const remittanceRows = (remittanceResult.data || []) as Remittance[];
    setCustomer(customerResult.data as Customer | null);
    setPortalLink((portalResult.data || null) as PortalLink | null);
    setPortalEmail(customerResult.data?.email || '');
    setInvoices(invoiceRows);
    setRemittances(remittanceRows);
    const [itemResult, allocationResult] = await Promise.all([
      invoiceRows.length ? supabase.from('invoice_items').select('id,invoice_id,description,quantity,line_total,inventory_type,inventory_reference').in('invoice_id', invoiceRows.map((row) => row.id)).order('sort_order') : Promise.resolve({ data: [] }),
      remittanceRows.length ? supabase.from('remittance_allocations').select('id,remittance_id,invoice_id,invoice_payment_id,amount,created_at').in('remittance_id', remittanceRows.map((row) => row.id)).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    setItems((itemResult.data || []) as InvoiceItem[]);
    setAllocations((allocationResult.data || []) as Allocation[]);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  const allocatedByRemittance = useMemo(() => allocations.reduce<Record<string, number>>((sum, row) => ({ ...sum, [row.remittance_id]: (sum[row.remittance_id] || 0) + Number(row.amount) }), {}), [allocations]);
  const receivableInvoices = useMemo(() => invoices.filter((row) => receivableDocument(row.document_type) && row.status !== 'cancelled'), [invoices]);
  const openInvoices = useMemo(() => receivableInvoices.filter((row) => Number(row.balance_due) > 0), [receivableInvoices]);
  const usableRemittances = useMemo(() => remittances.filter((row) => row.status === 'confirmed' && Number(row.amount) - (allocatedByRemittance[row.id] || 0) > 0), [remittances, allocatedByRemittance]);
  const selectedRemittance = remittances.find((row) => row.id === remittanceId);
  const selectedInvoice = invoices.find((row) => row.id === invoiceId);
  const totalInvoiced = receivableInvoices.reduce((sum, row) => sum + Number(row.total_amount), 0);
  const totalAllocated = allocations.reduce((sum, row) => sum + Number(row.amount), 0);
  const balanceDue = receivableInvoices.reduce((sum, row) => sum + Number(row.balance_due), 0);
  const availableFunds = remittances.filter((row) => row.status === 'confirmed').reduce((sum, row) => sum + Math.max(0, Number(row.amount) - (allocatedByRemittance[row.id] || 0)), 0);
  const currency = receivableInvoices[0]?.currency || remittances[0]?.currency || 'AED';

  const chartData = useMemo(() => Array.from({ length: 6 }, (_, offset) => {
    const month = startOfMonth(subMonths(new Date(), 5 - offset));
    const key = format(month, 'yyyy-MM');
    return {
      month: format(month, 'MMM'),
      invoices: receivableInvoices.filter((row) => row.issue_date.startsWith(key)).reduce((sum, row) => sum + Number(row.total_amount), 0),
      payments: allocations.filter((row) => row.created_at.startsWith(key)).reduce((sum, row) => sum + Number(row.amount), 0),
    };
  }), [receivableInvoices, allocations]);

  const chooseRemittance = (value: string) => {
    setRemittanceId(value);
    const remittance = remittances.find((row) => row.id === value);
    const available = remittance ? Number(remittance.amount) - (allocatedByRemittance[value] || 0) : 0;
    const invoice = openInvoices.find((row) => row.currency === remittance?.currency);
    if (invoice) setInvoiceId(invoice.id);
    setAllocationAmount(String(Math.min(available, Number(invoice?.balance_due || available)) || ''));
  };

  const allocate = async () => {
    if (!remittanceId || !invoiceId || Number(allocationAmount) <= 0) return setNotice('Choose a remittance, invoice, and positive amount.');
    setBusy(true); setNotice('Applying customer funds…');
    const { error } = await supabase.rpc('allocate_remittance', { p_remittance_id: remittanceId, p_invoice_id: invoiceId, p_amount: Number(allocationAmount) });
    setBusy(false);
    if (error) return setNotice(error.message);
    setNotice('Funds allocated. The invoice balance and customer statement were updated.');
    setRemittanceId(''); setInvoiceId(''); setAllocationAmount(''); await load();
  };

  const reverse = async (allocation: Allocation) => {
    if (!window.confirm('Reverse this allocation and restore both balances?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('reverse_remittance_allocation', { p_allocation_id: allocation.id });
    setBusy(false);
    if (error) return setNotice(error.message);
    setNotice('Allocation reversed and balances restored.'); await load();
  };

  const enablePortal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!customer) return;
    setPortalBusy(true);
    setNotice('Creating portal access…');
    const { data, error } = await supabase.functions.invoke('portal-create-access', {
      body: {
        customer_id: customer.id,
        email: portalEmail.trim(),
        password: portalPassword,
        full_name: customer.full_name,
      },
    });
    setPortalBusy(false);
    if (error || data?.error) {
      setNotice(data?.error || error?.message || 'Could not enable portal access.');
      return;
    }
    setPortalPassword('');
    setNotice(`Portal access created for ${data.email}. Share the temporary password securely.`);
    await load();
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!customer) return <Card><CardContent className="p-10 text-center">Customer account not found.</CardContent></Card>;

  return <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><Button asChild variant="ghost" size="sm" className="-ml-3 mb-2"><Link href="/admin/customers"><ArrowLeft className="h-4 w-4" />Customers</Link></Button><h1 className="text-2xl font-bold">{customer.company_name || customer.full_name}</h1><p className="text-sm text-muted-foreground">Statement of Account · {customer.customer_code} · {[customer.email, customer.phone, customer.country].filter(Boolean).join(' · ')}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link href={`/admin/chat?customer=${customer.id}`}>Open linked chat</Link></Button>
        <Button asChild><Link href={`/admin/invoices/new?customer=${customer.id}`}><ReceiptText className="h-4 w-4" />Create invoice</Link></Button>
      </div>
    </div>

    <Card className="border-accent/25 bg-accent/[0.04]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5 text-accent" />
          Customer portal access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This creates a separate login for the customer at <Link href="/portal" className="font-semibold text-accent underline">/portal</Link> so they can view their own invoices. It never adds them as staff.
        </p>
        {portalLink ? (
          <p className="rounded-lg border bg-background p-3 text-sm">
            Portal login active for <strong>{portalLink.email}</strong>
            {portalLink.is_active ? '' : ' (inactive)'}.
          </p>
        ) : (
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => void enablePortal(event)}>
            <div className="space-y-1.5">
              <Label htmlFor="portal-email">Portal email</Label>
              <Input id="portal-email" type="email" required value={portalEmail} onChange={(event) => setPortalEmail(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-password">Temporary password</Label>
              <Input id="portal-password" type="text" required minLength={8} value={portalPassword} onChange={(event) => setPortalPassword(event.target.value)} placeholder="At least 8 characters" />
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="accent" disabled={portalBusy}>
                {portalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Enable portal
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[['Receivable invoices', money(totalInvoiced, currency), ReceiptText], ['Payments allocated', money(totalAllocated, currency), CheckCircle2], ['Outstanding balance', money(balanceDue, currency), WalletCards], ['Available remittance', money(availableFunds, currency), Banknote]].map(([label, value, Icon]) => <Card key={String(label)}><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{String(label)}</p><p className="mt-1 text-2xl font-bold">{String(value)}</p></div><span className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></span></CardContent></Card>)}
    </div>

    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <Card><CardHeader><CardTitle className="text-lg">Invoices and payments · last 6 months</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} /><YAxis fontSize={12} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => money(Number(value), currency)} /><Bar dataKey="invoices" name="Invoiced" fill="hsl(var(--primary))" radius={[4,4,0,0]} /><Bar dataKey="payments" name="Paid" fill="#10b981" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-lg">Allocate received funds</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="soa-remittance">Confirmed remittance</Label><select id="soa-remittance" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={remittanceId} onChange={(event) => chooseRemittance(event.target.value)}><option value="">Select available funds</option>{usableRemittances.map((row) => <option key={row.id} value={row.id}>{row.remittance_number} · {money(Number(row.amount) - (allocatedByRemittance[row.id] || 0), row.currency)} available</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="soa-invoice">Open invoice</Label><select id="soa-invoice" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={invoiceId} onChange={(event) => { setInvoiceId(event.target.value); const invoice = invoices.find((row) => row.id === event.target.value); const available = selectedRemittance ? Number(selectedRemittance.amount) - (allocatedByRemittance[selectedRemittance.id] || 0) : 0; setAllocationAmount(String(Math.min(available, Number(invoice?.balance_due || 0)) || '')); }}><option value="">Select invoice</option>{openInvoices.filter((row) => !selectedRemittance || row.currency === selectedRemittance.currency).map((row) => <option key={row.id} value={row.id}>{row.invoice_number} · {money(row.balance_due, row.currency)}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="soa-amount">Amount {selectedInvoice ? `(${selectedInvoice.currency})` : ''}</Label><Input id="soa-amount" type="number" min="0.01" step="0.01" value={allocationAmount} onChange={(event) => setAllocationAmount(event.target.value)} /></div>
        <Button className="w-full" disabled={busy || !remittanceId || !invoiceId} onClick={() => void allocate()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}Apply payment</Button>
        <p className="text-xs text-muted-foreground">Only matching customer and currency records can be linked. Every change remains auditable.</p>
      </CardContent></Card>
    </div>

    {notice ? <div role="status" className="rounded-lg border bg-secondary/30 p-3 text-sm">{notice}</div> : null}

    <Card><CardHeader><CardTitle className="text-lg">Statement ledger</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-4">Date</th><th className="p-4">Reference</th><th className="p-4">Type</th><th className="p-4 text-right">Debit</th><th className="p-4 text-right">Credit</th><th className="p-4 text-right">Balance</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} className="border-t"><td className="p-4">{invoice.issue_date}</td><td className="p-4"><Link href={`/admin/invoices/${invoice.id}`} className="font-semibold text-primary hover:underline">{invoice.invoice_number}</Link></td><td className="p-4 capitalize">{invoice.document_type.replaceAll('_',' ')}</td><td className="p-4 text-right">{receivableDocument(invoice.document_type) ? money(invoice.total_amount, invoice.currency) : 'Non-posting'}</td><td className="p-4 text-right">{money(invoice.amount_paid, invoice.currency)}</td><td className="p-4 text-right font-semibold">{receivableDocument(invoice.document_type) ? money(invoice.balance_due, invoice.currency) : '—'}</td></tr>)}</tbody></table></div></CardContent></Card>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-lg">Remittances and allocations</CardTitle></CardHeader><CardContent className="space-y-3">{remittances.map((row) => { const used = allocatedByRemittance[row.id] || 0; return <div key={row.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{row.remittance_number}</p><p className="text-xs text-muted-foreground">{row.received_date} · {row.method.replaceAll('_',' ')} · {row.bank_reference || 'No bank reference'}</p></div><div className="text-right"><p className="font-semibold">{money(row.amount,row.currency)}</p><p className="text-xs text-muted-foreground">{money(Number(row.amount)-used,row.currency)} available</p></div></div><div className="mt-3 space-y-2">{allocations.filter((item) => item.remittance_id === row.id).map((allocation) => { const invoice = invoices.find((item) => item.id === allocation.invoice_id); return <div key={allocation.id} className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2 text-xs"><span>Applied to {invoice?.invoice_number || 'invoice'} · {money(allocation.amount,row.currency)}</span><Button variant="ghost" size="sm" className="h-7 text-destructive" disabled={busy} onClick={() => void reverse(allocation)}><RotateCcw className="h-3.5 w-3.5" />Reverse</Button></div>; })}</div></div>; })}{remittances.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No remittances recorded for this customer.</p> : null}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShoppingBag className="h-5 w-5" />Buying details</CardTitle></CardHeader><CardContent className="space-y-3">{items.map((item) => { const invoice = invoices.find((row) => row.id === item.invoice_id); return <div key={item.id} className="flex items-start justify-between gap-4 rounded-lg border p-4"><div><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{invoice?.invoice_number} · Qty {item.quantity}{item.inventory_reference ? ` · Ref ${item.inventory_reference}` : ''}{item.inventory_type ? ` · ${item.inventory_type}` : ''}</p></div><span className="shrink-0 font-semibold">{money(item.line_total, invoice?.currency || currency)}</span></div>; })}{items.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No invoice buying details yet.</p> : null}</CardContent></Card>
    </div>
  </div>;
}

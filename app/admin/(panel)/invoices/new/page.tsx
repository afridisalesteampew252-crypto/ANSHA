'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Customer = { id: string; full_name: string; company_name: string | null; email: string | null; phone: string | null; address: string | null; tax_registration_number: string | null };
type Line = { key: string; description: string; quantity: number; unit_price: number; discount_percent: number; tax_rate: number; inventory_type: '' | 'part' | 'vehicle'; part_id: string | null; vehicle_id: string | null; inventory_reference: string };
type StockItem = { id: string; type: 'part' | 'vehicle'; reference: string; label: string; price: number | null; currency: string; status: string };

const today = new Date().toISOString().slice(0, 10);
const defaultDue = (() => { const date = new Date(); date.setDate(date.getDate() + 30); return date.toISOString().slice(0, 10); })();
const newLine = (): Line => ({ key: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_rate: 5, inventory_type: '', part_id: null, vehicle_id: null, inventory_reference: '' });
const money = (value: number, currency: string) => new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(value || 0);

export default function NewInvoicePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customer, setCustomer] = useState({ name: '', company: '', email: '', phone: '', address: '', trn: '' });
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [documentType, setDocumentType] = useState('proforma_invoice');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(defaultDue);
  const [currency, setCurrency] = useState('AED');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Payment is due by the date shown on the invoice.');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { void (async () => {
    const [customerResult, partsResult, vehiclesResult] = await Promise.all([
      supabase.from('customers').select('id,full_name,company_name,email,phone,address,tax_registration_number').eq('is_active', true).order('company_name').order('full_name'),
      supabase.from('parts').select('id,part_code,name,price,currency,stock_status').neq('stock_status', 'sold').order('part_code').limit(500),
      supabase.from('vehicles').select('id,stock_number,chassis_number,chassis_code,title,price,currency,stock_status').neq('stock_status', 'sold').order('stock_number').limit(500),
    ]);
    setCustomers((customerResult.data || []) as Customer[]);
    const parts: StockItem[] = (partsResult.data || []).map((item) => ({ id: item.id, type: 'part', reference: item.part_code, label: item.name, price: item.price, currency: item.currency, status: item.stock_status }));
    const vehicles: StockItem[] = (vehiclesResult.data || []).map((item) => ({ id: item.id, type: 'vehicle', reference: item.stock_number || item.chassis_number || item.chassis_code || item.id.slice(0, 8), label: item.title, price: item.price, currency: item.currency, status: item.stock_status }));
    setStockItems([...vehicles, ...parts]);
  })(); }, []);

  const chooseCustomer = (id: string) => {
    setCustomerId(id);
    const selected = customers.find((item) => item.id === id);
    if (selected) setCustomer({ name: selected.full_name, company: selected.company_name || '', email: selected.email || '', phone: selected.phone || '', address: selected.address || '', trn: selected.tax_registration_number || '' });
  };

  const updateLine = (key: string, field: keyof Omit<Line, 'key'>, value: string) => {
    const numeric = ['quantity', 'unit_price', 'discount_percent', 'tax_rate'].includes(field);
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: numeric ? Number(value) : value } : line));
  };

  const chooseInventory = (key: string, value: string) => {
    const selected = stockItems.find((item) => `${item.type}:${item.id}` === value);
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line;
      if (!selected) return { ...line, inventory_type: '', part_id: null, vehicle_id: null, inventory_reference: '' };
      return {
        ...line,
        inventory_type: selected.type,
        part_id: selected.type === 'part' ? selected.id : null,
        vehicle_id: selected.type === 'vehicle' ? selected.id : null,
        inventory_reference: selected.reference,
        description: `${selected.label}\nReference: ${selected.reference}`,
        unit_price: selected.price || line.unit_price,
      };
    }));
  };

  const totals = useMemo(() => lines.reduce((sum, line) => {
    const subtotal = line.quantity * line.unit_price;
    const discount = subtotal * line.discount_percent / 100;
    const tax = (subtotal - discount) * line.tax_rate / 100;
    return { subtotal: sum.subtotal + subtotal, discount: sum.discount + discount, tax: sum.tax + tax, total: sum.total + subtotal - discount + tax };
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 }), [lines]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('Creating invoice…');
    const validLines = lines.filter((line) => line.description.trim());
    if (!customer.name.trim()) { setBusy(false); return setMessage('Customer name is required.'); }
    if (!validLines.length) { setBusy(false); return setMessage('Add at least one line item.'); }
    const { data, error } = await supabase.rpc('create_invoice_v3', {
      p_invoice_number: invoiceNumber.trim() || null,
      p_document_type: documentType,
      p_customer_id: customerId || null,
      p_customer_name: customer.name.trim(),
      p_customer_company: customer.company.trim(),
      p_customer_email: customer.email.trim(),
      p_customer_phone: customer.phone.trim(),
      p_customer_address: customer.address.trim(),
      p_customer_tax_registration_number: customer.trn.trim(),
      p_issue_date: issueDate,
      p_due_date: dueDate,
      p_currency: currency,
      p_reference: reference.trim(),
      p_notes: notes.trim(),
      p_terms: terms.trim(),
      p_items: validLines.map((line) => ({ description: line.description, quantity: line.quantity, unit_price: line.unit_price, discount_percent: line.discount_percent, tax_rate: line.tax_rate, inventory_type: line.inventory_type || null, part_id: line.part_id, vehicle_id: line.vehicle_id, inventory_reference: line.inventory_reference || null })),
    });
    setBusy(false);
    if (error || !data) return setMessage(error?.message || 'Could not create invoice.');
    router.push(`/admin/invoices/${data}`);
  };

  return <form onSubmit={submit} className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><Button asChild variant="ghost" className="-ml-3 mb-2"><Link href="/admin/invoices"><ArrowLeft className="h-4 w-4" />Invoices</Link></Button><h1 className="text-2xl font-bold">New invoice</h1><p className="text-sm text-muted-foreground">Create delivery notes, quotations, proforma, tax, purchase, or commercial invoices with secure QR verification.</p></div><Button disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? 'Saving…' : 'Create invoice'}</Button></div>

    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0 space-y-6">
        <Card><CardHeader><CardTitle className="text-lg">Customer</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="saved-customer">Saved customer</Label><select id="saved-customer" value={customerId} onChange={(event) => chooseCustomer(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Enter customer manually</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.company_name ? `${item.company_name} — ${item.full_name}` : item.full_name}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="customer-name">Contact name *</Label><Input id="customer-name" required value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="customer-company">Company</Label><Input id="customer-company" value={customer.company} onChange={(event) => setCustomer({ ...customer, company: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="customer-email">Email</Label><Input id="customer-email" type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="customer-phone">Phone</Label><Input id="customer-phone" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="customer-address">Billing address</Label><Textarea id="customer-address" rows={2} value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="customer-trn">Customer TRN</Label><Input id="customer-trn" value={customer.trn} onChange={(event) => setCustomer({ ...customer, trn: event.target.value })} placeholder="Tax registration number, if applicable" /></div>
        </CardContent></Card>

        <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-lg">Line items</CardTitle><Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, newLine()])}><Plus className="h-4 w-4" />Add line</Button></CardHeader><CardContent className="space-y-3">
          <div className="hidden grid-cols-[minmax(15rem,1fr)_5rem_7rem_5rem_5rem_2.5rem] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid"><span>Description</span><span>Qty</span><span>Unit price</span><span>Discount %</span><span>VAT %</span><span /></div>
          {lines.map((line, index) => <div key={line.key} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(15rem,1fr)_5rem_7rem_5rem_5rem_2.5rem] md:items-end md:border-0 md:p-0">
            <div className="space-y-2"><Label className="md:sr-only" htmlFor={`description-${line.key}`}>Description</Label><select aria-label="Pick inventory reference" value={line.inventory_type ? `${line.inventory_type}:${line.part_id || line.vehicle_id}` : ''} onChange={(event) => chooseInventory(line.key, event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-xs"><option value="">Manual line / no stock link</option><optgroup label="Vehicle stock">{stockItems.filter((item) => item.type === 'vehicle').map((item) => <option key={`vehicle-${item.id}`} value={`vehicle:${item.id}`}>${item.reference} — ${item.label}</option>)}</optgroup><optgroup label="Parts stock">{stockItems.filter((item) => item.type === 'part').map((item) => <option key={`part-${item.id}`} value={`part:${item.id}`}>${item.reference} — ${item.label}</option>)}</optgroup></select><Textarea id={`description-${line.key}`} required={index === 0} rows={4} value={line.description} onChange={(event) => updateLine(line.key, 'description', event.target.value)} placeholder={index === 0 ? "Select a stock reference above or enter vehicle/part details" : "Part, vehicle, shipping, or service"} />{line.inventory_reference && <p className="text-[11px] font-medium text-primary">Linked stock: {line.inventory_reference}</p>}</div>
            <div className="space-y-1 md:space-y-0"><Label className="md:sr-only" htmlFor={`quantity-${line.key}`}>Quantity</Label><Input id={`quantity-${line.key}`} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(line.key, 'quantity', event.target.value)} /></div>
            <div className="space-y-1 md:space-y-0"><Label className="md:sr-only" htmlFor={`price-${line.key}`}>Unit price</Label><Input id={`price-${line.key}`} type="number" min="0" step="0.01" value={line.unit_price} onChange={(event) => updateLine(line.key, 'unit_price', event.target.value)} /></div>
            <div className="space-y-1 md:space-y-0"><Label className="md:sr-only" htmlFor={`discount-${line.key}`}>Discount %</Label><Input id={`discount-${line.key}`} type="number" min="0" max="100" step="0.01" value={line.discount_percent} onChange={(event) => updateLine(line.key, 'discount_percent', event.target.value)} /></div>
            <div className="space-y-1 md:space-y-0"><Label className="md:sr-only" htmlFor={`tax-${line.key}`}>VAT %</Label><Input id={`tax-${line.key}`} type="number" min="0" max="100" step="0.01" value={line.tax_rate} onChange={(event) => updateLine(line.key, 'tax_rate', event.target.value)} /></div>
            <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} aria-label="Remove line"><Trash2 className="h-4 w-4" /></Button>
          </div>)}
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-lg">Notes and terms</CardTitle></CardHeader><CardContent className="grid gap-4"><div className="space-y-1.5"><Label htmlFor="notes">Customer notes</Label><Textarea id="notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Delivery details, warranty notes or other information" /></div><div className="space-y-1.5"><Label htmlFor="terms">Payment terms</Label><Textarea id="terms" rows={2} value={terms} onChange={(event) => setTerms(event.target.value)} /></div></CardContent></Card>
      </div>

      <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        <Card><CardHeader><CardTitle className="text-lg">Invoice details</CardTitle></CardHeader><CardContent className="grid gap-4">
          <div className="space-y-1.5"><Label htmlFor="document-type">Document type</Label><select id="document-type" value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="proforma_invoice">Proforma invoice</option><option value="quotation">Quotation</option><option value="tax_invoice">Tax invoice</option><option value="delivery_note">Delivery note</option><option value="purchase_invoice">Purchase invoice</option><option value="commercial_invoice">Commercial invoice</option></select></div>
          <div className="space-y-1.5"><Label htmlFor="invoice-number">Invoice number</Label><Input id="invoice-number" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value.toUpperCase())} placeholder="RIYA0063 or leave blank" maxLength={40} /><p className="text-xs text-muted-foreground">Use an existing sales code such as RIYA0063, or leave blank for an automatic INV number.</p></div>
          <div className="space-y-1.5"><Label htmlFor="issue-date">Issue date</Label><Input id="issue-date" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="due-date">Due date</Label><Input id="due-date" type="date" min={issueDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="currency">Currency</Label><select id="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="AED">AED</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></div>
          <div className="space-y-1.5"><Label htmlFor="reference">Reference / PO</Label><Input id="reference" value={reference} onChange={(event) => setReference(event.target.value)} /></div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-lg">Summary</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(totals.subtotal, currency)}</span></div>{totals.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{money(totals.discount, currency)}</span></div>}<div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span>{money(totals.tax, currency)}</span></div><div className="flex justify-between border-t pt-3 text-base font-bold"><span>Total</span><span>{money(totals.total, currency)}</span></div></CardContent></Card>
        {message && <div role="status" className="rounded-lg border bg-secondary/30 p-3 text-sm">{message}</div>}
      </div>
    </div>
  </form>;
}

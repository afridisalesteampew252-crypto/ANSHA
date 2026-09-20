'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Banknote, FileJson, Loader2, Pencil, Printer, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InvoicePrintDocument } from '@/components/invoices/invoice-print-document';
import { siteConfig } from '@/lib/site-config';
import { canManageReceivables, isFieldAgentRole } from '@/lib/admin-rbac';
import {
  INVOICE_DELETE_CONFIRM,
  INVOICE_UNALLOCATE_DELETE_CONFIRM,
  needsUnallocateBeforeDelete,
} from '@/lib/invoice-delete';

type Invoice = {
  id: string; invoice_number: string; customer_name: string; customer_company: string | null;
  customer_email: string | null; customer_phone: string | null; customer_address: string | null;
  customer_tax_registration_number: string | null; seller_name: string; seller_tax_registration_number: string;
  seller_address: string; issue_date: string; due_date: string; currency: string; reference: string | null;
  status: string; subtotal: number; discount_amount: number; tax_amount: number; total_amount: number;
  amount_paid: number; balance_due: number; notes: string | null; terms: string | null;
  price_term: 'fob' | 'cf' | 'cif' | null;
  shipment_term: 'dhl' | 'roro' | 'container_20ft' | 'container_40ft' | null;
  provider_name: string | null; provider_submission_id: string | null; provider_status: string; reported_at: string | null;
  document_type: 'delivery_note' | 'tax_invoice' | 'proforma_invoice' | 'quotation' | 'purchase_invoice' | 'commercial_invoice'; verification_code: string;
  verification_enabled: boolean; verification_issued_at: string;
};
type Item = {
  id: string; description: string; inventory_reference: string | null; quantity: number; unit_price: number;
  discount_percent: number; tax_rate: number; line_subtotal: number; line_discount: number; line_tax: number;
  line_total: number; sort_order: number; price_term: 'fob' | 'cf' | 'cif' | null;
};
type Payment = { id: string; payment_date: string; amount: number; method: string; reference: string | null; notes: string | null; created_at: string };
type Allocation = { id: string; remittance_id: string; amount: number; created_at: string };

const money = (value: number, currency: string) => new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(value || 0);
const statusClass: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-zinc-200 text-zinc-600',
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [fieldAgent, setFieldAgent] = useState(false);
  const [canFinance, setCanFinance] = useState(false);
  const [payment, setPayment] = useState({
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    method: 'bank_transfer',
    reference: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('admin_profiles').select('role').eq('id', user.id).maybeSingle();
      setFieldAgent(isFieldAgentRole(profile?.role));
      setCanFinance(canManageReceivables(profile?.role));
    }
    const [invoiceResult, itemResult, paymentResult, allocationResult] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', params.id).maybeSingle(),
      supabase.from('invoice_items').select('*').eq('invoice_id', params.id).order('sort_order'),
      supabase.from('invoice_payments').select('*').eq('invoice_id', params.id).order('payment_date', { ascending: false }),
      supabase.from('remittance_allocations').select('id,remittance_id,amount,created_at').eq('invoice_id', params.id).order('created_at', { ascending: false }),
    ]);
    setLoading(false);
    if (invoiceResult.error || !invoiceResult.data) return setMessage(invoiceResult.error?.message || 'Invoice not found.');
    setInvoice(invoiceResult.data as Invoice);
    setItems((itemResult.data || []) as Item[]);
    setPayments((paymentResult.data || []) as Payment[]);
    setAllocations((allocationResult.data || []) as Allocation[]);
    setPayment((current) => ({ ...current, amount: String(Math.max(Number(invoiceResult.data.balance_due || 0), 0)) }));
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  const effectiveStatus = useMemo(() => {
    if (!invoice) return 'draft';
    if (!['paid', 'cancelled', 'draft'].includes(invoice.status) && invoice.balance_due > 0 && invoice.due_date < new Date().toISOString().slice(0, 10)) {
      return 'overdue';
    }
    return invoice.status;
  }, [invoice]);

  const updateStatus = async (status: string) => {
    if (!invoice || fieldAgent) return;
    setBusy(true);
    const { error } = await supabase.from('invoices').update({ status }).eq('id', invoice.id);
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage(status === 'sent' ? 'Invoice marked sent / approved.' : 'Invoice status updated.');
    void load();
  };

  const recordPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!invoice) return;
    setBusy(true);
    setMessage('Recording payment…');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return setMessage('Session expired.');
    }
    const { error } = await supabase.from('invoice_payments').insert({
      invoice_id: invoice.id,
      payment_date: payment.payment_date,
      amount: Number(payment.amount),
      method: payment.method,
      reference: payment.reference.trim() || null,
      notes: payment.notes.trim() || null,
      created_by: user.id,
    });
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage('Payment recorded and balance updated.');
    setPaymentOpen(false);
    void load();
  };

  const exportJson = () => {
    if (!invoice) return;
    const payload = { document_type: invoice.document_type, invoice, line_items: items, payments, exported_at: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${invoice.invoice_number}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const unallocateRemittances = async () => {
    if (!invoice || !canFinance) return;
    if (!window.confirm(`Unallocate ${allocations.length || 'all'} remittance payment(s) on ${invoice.invoice_number}? Funds return to the remittance pool.`)) return;
    setBusy(true);
    setMessage('Unallocating remittance payments…');
    const { data, error } = await supabase.rpc('unallocate_invoice_remittances', { p_invoice_id: invoice.id });
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage(`Unallocated ${Number(data || 0)} remittance allocation(s). You can delete the invoice now.`);
    void load();
  };

  const removeInvoice = async (forceUnallocate = false) => {
    if (!invoice) return;
    const confirmText = forceUnallocate
      ? INVOICE_UNALLOCATE_DELETE_CONFIRM
      : `Delete ${invoice.invoice_number}? ${INVOICE_DELETE_CONFIRM}`;
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(forceUnallocate ? 'Unallocating and deleting invoice…' : 'Deleting invoice…');
    const { error } = forceUnallocate
      ? await supabase.rpc('unallocate_and_delete_invoice', { p_invoice_id: invoice.id })
      : await supabase.rpc('delete_invoice_safely', { p_invoice_id: invoice.id });
    setBusy(false);
    if (error) {
      if (!forceUnallocate && canFinance && needsUnallocateBeforeDelete(error.message)) {
        if (window.confirm(`${error.message}\n\nUnallocate remittance payments and delete now?`)) {
          return void removeInvoice(true);
        }
      }
      return setMessage(error.message);
    }
    router.push('/admin/invoices');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost">
          <Link href="/admin/invoices"><ArrowLeft className="h-4 w-4" />Invoices</Link>
        </Button>
        <Card><CardContent className="p-6">{message || 'Invoice not found.'}</CardContent></Card>
      </div>
    );
  }

  const verificationUrl = `${siteConfig.url}/verify/invoice/${invoice.verification_code}`;
  const canEditDraft = !fieldAgent || (invoice.document_type === 'proforma_invoice' && invoice.status === 'draft');

  return (
    <div className="invoice-detail-page mx-auto max-w-7xl space-y-6">
      <div className="admin-invoice-actions no-print flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Button asChild variant="ghost" className="-ml-3 mb-2">
            <Link href="/admin/invoices"><ArrowLeft className="h-4 w-4" />Invoices</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusClass[effectiveStatus]}`}>
              {effectiveStatus.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">Issued {invoice.issue_date} · Due {invoice.due_date}</p>
          {fieldAgent ? <p className="mt-1 text-xs text-muted-foreground">Draft proformas stay with you until accounts marks them sent.</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditDraft ? (
            <Button asChild variant="outline">
              <Link href={`/admin/invoices/new?edit=${invoice.id}`}><Pencil className="h-4 w-4" />Edit</Link>
            </Button>
          ) : null}
          <Button variant="outline" onClick={exportJson}><FileJson className="h-4 w-4" />Export JSON</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print A4 / PDF</Button>
          {canFinance ? (
            <Button onClick={() => setPaymentOpen((open) => !open)} disabled={invoice.status === 'cancelled' || invoice.balance_due <= 0}>
              <Banknote className="h-4 w-4" />Record payment
            </Button>
          ) : null}
          {(canFinance || (fieldAgent && invoice.status === 'draft')) ? (
            <>
              {canFinance && allocations.length > 0 ? (
                <Button variant="outline" disabled={busy} onClick={() => void unallocateRemittances()}>
                  Unallocate ({allocations.length})
                </Button>
              ) : null}
              {canFinance && (allocations.length > 0 || invoice.amount_paid > 0) ? (
                <Button variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => void removeInvoice(true)}>
                  <Trash2 className="h-4 w-4" />Unallocate & delete
                </Button>
              ) : null}
              <Button variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => void removeInvoice(false)}>
                <Trash2 className="h-4 w-4" />Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="invoice-print-stage min-w-0">
          <InvoicePrintDocument invoice={invoice} items={items} />
        </div>

        <div className="admin-invoice-actions no-print space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Invoice status</CardTitle></CardHeader>
            <CardContent>
              {fieldAgent ? (
                <>
                  <p className="rounded-md border bg-secondary/40 px-3 py-2 text-sm capitalize">{effectiveStatus.replace('_', ' ')}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Only accounts (or ops) can mark drafts as sent.</p>
                </>
              ) : (
                <>
                  <select
                    value={invoice.status}
                    onChange={(event) => void updateStatus(event.target.value)}
                    disabled={busy}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="overdue">Overdue</option>
                    <option value="cancelled">Cancelled</option>
                    {invoice.status === 'partially_paid' && <option value="partially_paid">Partially paid</option>}
                    {invoice.status === 'paid' && <option value="paid">Paid</option>}
                  </select>
                  <p className="mt-2 text-xs text-muted-foreground">Mark draft → sent to approve. Paid and partially paid update automatically from payments.</p>
                </>
              )}
            </CardContent>
          </Card>

          {paymentOpen && (
            <Card>
              <CardHeader><CardTitle className="text-base">Record payment</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={recordPayment} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="payment-amount">Amount</Label>
                    <Input
                      id="payment-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={Math.max(invoice.balance_due, 0)}
                      required
                      value={payment.amount}
                      onChange={(event) => setPayment({ ...payment, amount: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="payment-date">Date</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      required
                      value={payment.payment_date}
                      onChange={(event) => setPayment({ ...payment, payment_date: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="payment-method">Method</Label>
                    <select
                      id="payment-method"
                      value={payment.method}
                      onChange={(event) => setPayment({ ...payment, method: event.target.value })}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="cheque">Cheque</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="payment-reference">Reference</Label>
                    <Input
                      id="payment-reference"
                      value={payment.reference}
                      onChange={(event) => setPayment({ ...payment, reference: event.target.value })}
                    />
                  </div>
                  <Button className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save payment
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Payments</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {payments.length ? payments.map((entry) => (
                <div key={entry.id} className="border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{money(entry.amount, invoice.currency)}</span>
                    <span className="text-xs text-muted-foreground">{entry.payment_date}</span>
                  </div>
                  <p className="text-xs capitalize text-muted-foreground">
                    {entry.method.replace('_', ' ')}{entry.reference ? ` · ${entry.reference}` : ''}
                  </p>
                </div>
              )) : <p className="text-sm text-muted-foreground">No payments recorded.</p>}
            </CardContent>
          </Card>

          {canFinance ? (
            <Card>
              <CardHeader><CardTitle className="text-base">Remittance allocations</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {allocations.length ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Unallocate these before deleting the invoice. Funds return to the remittance pool.
                    </p>
                    {allocations.map((entry) => (
                      <div key={entry.id} className="flex justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                        <span className="font-medium">{money(entry.amount, invoice.currency)}</span>
                        <span className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No remittance allocations on this invoice.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader><CardTitle className="text-base">QR verification</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Customer-facing verification is {invoice.verification_enabled ? 'active' : 'disabled'}.
              </p>
              <p className="rounded-md border bg-secondary/40 px-3 py-2 font-mono text-xs break-all">
                {invoice.verification_code}
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href={verificationUrl} target="_blank">Open verification page</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">eInvoice readiness</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Structured export</span><span className="font-medium">Available</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider status</span>
                <span className="font-medium capitalize">{invoice.provider_status.replace('_', ' ')}</span>
              </div>
              <p className="pt-2 text-xs text-muted-foreground">
                Connect an accredited UAE service provider before marking invoices as reported to the tax authority.
              </p>
            </CardContent>
          </Card>

          {message && <div role="status" className="rounded-lg border bg-secondary/30 p-3 text-sm">{message}</div>}
        </div>
      </div>
    </div>
  );
}

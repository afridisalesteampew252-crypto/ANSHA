'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { matchesQuery } from '@/lib/matches-query';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { canManageReceivables, isFieldAgentRole } from '@/lib/admin-rbac';
import {
  INVOICE_DELETE_CONFIRM,
  INVOICE_UNALLOCATE_DELETE_CONFIRM,
  needsUnallocateBeforeDelete,
} from '@/lib/invoice-delete';
import {
  addToCurrencyMap,
  formatMoney,
  listCurrencies,
  normalizeCurrency,
} from '@/lib/money';
import { MoneyBreakdown } from '@/components/money-breakdown';

type InvoiceItemRef = {
  description: string | null;
  inventory_reference: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_company: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_tax_registration_number: string | null;
  issue_date: string;
  due_date: string;
  currency: string;
  status: string;
  document_type: string;
  reference: string | null;
  notes: string | null;
  terms: string | null;
  verification_code: string | null;
  total_amount: number;
  balance_due: number;
  created_at: string;
  invoice_items?: InvoiceItemRef[] | null;
};

const money = (value: number, currency: string) => formatMoney(value, currency);
const statusClass: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  cancelled: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

function effectiveStatus(invoice: Invoice) {
  if (!['paid', 'cancelled', 'draft'].includes(invoice.status) && invoice.balance_due > 0 && invoice.due_date < new Date().toISOString().slice(0, 10)) return 'overdue';
  return invoice.status;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [documentType, setDocumentType] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [fieldAgent, setFieldAgent] = useState(false);
  const [canFinance, setCanFinance] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('admin_profiles').select('role').eq('id', user.id).maybeSingle();
      const role = profile?.role;
      setFieldAgent(isFieldAgentRole(role));
      setCanFinance(canManageReceivables(role));
    }
    const { data, error } = await supabase
      .from('invoices')
      .select(
        'id,invoice_number,customer_name,customer_company,customer_email,customer_phone,customer_address,customer_tax_registration_number,issue_date,due_date,currency,status,document_type,reference,notes,terms,verification_code,total_amount,balance_due,created_at,invoice_items(description,inventory_reference)'
      )
      .order('issue_date', { ascending: false })
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) return setMessage(error.message);
    setInvoices((data || []) as Invoice[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const currencyOptions = useMemo(
    () => listCurrencies(invoices.map((invoice) => invoice.currency)),
    [invoices]
  );

  const filtered = useMemo(() => invoices.filter((invoice) => {
    const currentStatus = effectiveStatus(invoice);
    if (fieldAgent && invoice.document_type !== 'proforma_invoice') return false;
    if (status !== 'all' && currentStatus !== status) return false;
    if (!fieldAgent && documentType !== 'all' && invoice.document_type !== documentType) return false;
    if (currencyFilter !== 'all' && normalizeCurrency(invoice.currency) !== currencyFilter) return false;
    const itemFields = (invoice.invoice_items || []).flatMap((item) => [item.description, item.inventory_reference]);
    return matchesQuery(query, [
      invoice.invoice_number,
      invoice.document_type,
      invoice.document_type.replaceAll('_', ' '),
      invoice.customer_name,
      invoice.customer_company,
      invoice.customer_email,
      invoice.customer_phone,
      invoice.customer_address,
      invoice.customer_tax_registration_number,
      invoice.status,
      currentStatus,
      currentStatus.replaceAll('_', ' '),
      invoice.currency,
      invoice.reference,
      invoice.notes,
      invoice.terms,
      invoice.verification_code,
      invoice.issue_date,
      invoice.due_date,
      invoice.total_amount,
      invoice.balance_due,
      ...itemFields,
    ]);
  }), [currencyFilter, documentType, fieldAgent, invoices, query, status]);

  /** Per-currency totals over the filtered set — never collapse mixed currencies into AED. */
  const totalsByCurrency = useMemo(() => {
    const issued: Record<string, number> = {};
    const outstanding: Record<string, number> = {};
    const overdue: Record<string, number> = {};
    for (const invoice of filtered) {
      addToCurrencyMap(issued, invoice.currency, Number(invoice.total_amount || 0));
      if (invoice.status !== 'cancelled') {
        addToCurrencyMap(outstanding, invoice.currency, Math.max(Number(invoice.balance_due || 0), 0));
      }
      if (effectiveStatus(invoice) === 'overdue') {
        addToCurrencyMap(overdue, invoice.currency, Math.max(Number(invoice.balance_due || 0), 0));
      }
    }
    return { issued, outstanding, overdue };
  }, [filtered]);

  const remove = async (invoice: Invoice, forceUnallocate = false): Promise<void> => {
    const confirmText = forceUnallocate
      ? `Delete ${invoice.invoice_number}? ${INVOICE_UNALLOCATE_DELETE_CONFIRM}`
      : `Delete ${invoice.invoice_number}? ${INVOICE_DELETE_CONFIRM}`;
    if (!window.confirm(confirmText)) return;
    const { error } = forceUnallocate
      ? await supabase.rpc('unallocate_and_delete_invoice', { p_invoice_id: invoice.id })
      : await supabase.rpc('delete_invoice_safely', { p_invoice_id: invoice.id });
    if (error) {
      if (!forceUnallocate && canFinance && needsUnallocateBeforeDelete(error.message)) {
        if (window.confirm(`${error.message}\n\nUnallocate remittance payments and delete now?`)) {
          return void remove(invoice, true);
        }
      }
      return setMessage(error.message);
    }
    setMessage(forceUnallocate ? 'Invoice unallocated and deleted. Linked stock set to available.' : 'Invoice deleted. Linked stock set to available.');
    void load();
  };

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold">{fieldAgent ? 'Draft proformas' : 'Invoice management'}</h1><p className="text-sm text-muted-foreground">{fieldAgent ? 'Your draft proforma invoices. Accounts will review and mark them sent.' : 'Delivery notes, quotations, proforma, tax, purchase and commercial invoices.'}</p></div><div className="flex flex-wrap gap-2">{canFinance ? <Button asChild variant="outline"><Link href="/admin/invoices/supplier"><FileText className="h-4 w-4" />Supplier invoices</Link></Button> : null}<Button asChild><Link href="/admin/invoices/new"><Plus className="h-4 w-4" />{fieldAgent ? 'Draft proforma' : 'Create document'}</Link></Button></div></div>

    {!fieldAgent ? <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total invoiced</CardTitle>
        </CardHeader>
        <CardContent>
          <MoneyBreakdown amounts={totalsByCurrency.issued} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
        </CardHeader>
        <CardContent>
          <MoneyBreakdown amounts={totalsByCurrency.outstanding} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
        </CardHeader>
        <CardContent>
          <MoneyBreakdown amounts={totalsByCurrency.overdue} className="text-destructive" />
        </CardContent>
      </Card>
    </div> : null}

    <Card><CardContent className="p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice, customer, reference, notes, VIN/stock…" className="pl-10" /></div><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:shrink-0">{fieldAgent ? null : <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto sm:min-w-[10rem]"><option value="all">All document types</option><option value="delivery_note">Delivery notes</option><option value="quotation">Quotations</option><option value="proforma_invoice">Proforma invoices</option><option value="tax_invoice">Tax invoices</option><option value="purchase_invoice">Purchase invoices</option><option value="commercial_invoice">Commercial invoices</option></select>}<select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto sm:min-w-[9rem]"><option value="all">All statuses</option><option value="draft">Draft</option>{fieldAgent ? null : <><option value="sent">Sent</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="cancelled">Cancelled</option></>}</select>{!fieldAgent && currencyOptions.length > 0 ? <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto sm:min-w-[8rem]" aria-label="Filter by currency"><option value="all">All currencies</option>{currencyOptions.map((code) => <option key={code} value={code}>{code}</option>)}</select> : null}</div></div></CardContent></Card>

    {message && <div role="status" className="rounded-lg border bg-secondary/30 p-3 text-sm">{message}</div>}
    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : filtered.length === 0 ? <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center"><FileText className="h-10 w-10 text-muted-foreground" /><div><p className="font-semibold">No invoices found</p><p className="text-sm text-muted-foreground">Create the first invoice or change the filters.</p></div></CardContent></Card> : <>
      <div className="grid gap-3 md:hidden">{filtered.map((invoice) => { const currentStatus = effectiveStatus(invoice); return <Card key={invoice.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><Link href={`/admin/invoices/${invoice.id}`} className="font-semibold text-primary hover:underline">{invoice.invoice_number}</Link><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{invoice.document_type.replaceAll('_', ' ')}</p><p className="text-sm">{invoice.customer_company || invoice.customer_name}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${statusClass[currentStatus]}`}>{currentStatus.replace('_', ' ')}</span></div><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Total</p><p className="font-medium">{money(invoice.total_amount, invoice.currency)}</p></div><div><p className="text-xs text-muted-foreground">Balance</p><p className="font-medium">{money(invoice.balance_due, invoice.currency)}</p></div><div><p className="text-xs text-muted-foreground">Issued</p><p>{invoice.issue_date}</p></div><div><p className="text-xs text-muted-foreground">Due</p><p>{invoice.due_date}</p></div></div><div className="flex gap-2"><Button asChild variant="outline" size="sm"><Link href={`/admin/invoices/new?edit=${invoice.id}`}><Pencil className="h-4 w-4" />Edit</Link></Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(invoice)}><Trash2 className="h-4 w-4" />Delete</Button></div></CardContent></Card>; })}</div>
      <Card className="hidden overflow-hidden md:block"><div className="admin-table-scroll"><table className="w-full text-sm"><thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-4">Invoice</th><th className="p-4">Customer</th><th className="p-4">Issued / Due</th><th className="p-4 text-right">Total</th><th className="p-4 text-right">Balance</th><th className="p-4">Status</th><th className="p-4" /></tr></thead><tbody>{filtered.map((invoice) => { const currentStatus = effectiveStatus(invoice); return <tr key={invoice.id} className="border-t hover:bg-secondary/20"><td className="p-4"><Link href={`/admin/invoices/${invoice.id}`} className="font-semibold text-primary hover:underline">{invoice.invoice_number}</Link></td><td className="p-4"><p className="font-medium">{invoice.customer_company || invoice.customer_name}</p>{invoice.customer_company && <p className="text-xs text-muted-foreground">{invoice.customer_name}</p>}</td><td className="p-4"><p>{invoice.issue_date}</p><p className="text-xs text-muted-foreground">Due {invoice.due_date}</p></td><td className="p-4 text-right font-medium">{money(invoice.total_amount, invoice.currency)}</td><td className="p-4 text-right">{money(invoice.balance_due, invoice.currency)}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusClass[currentStatus]}`}>{currentStatus.replace('_', ' ')}</span></td><td className="p-4"><div className="flex justify-end gap-1"><Button asChild variant="ghost" size="icon"><Link href={`/admin/invoices/new?edit=${invoice.id}`} aria-label={`Edit ${invoice.invoice_number}`}><Pencil className="h-4 w-4" /></Link></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(invoice)} aria-label={`Delete ${invoice.invoice_number}`}><Trash2 className="h-4 w-4" /></Button></div></td></tr>; })}</tbody></table></div></Card>
    </>}
  </div>;
}

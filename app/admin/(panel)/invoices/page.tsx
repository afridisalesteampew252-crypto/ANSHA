'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Invoice = {
  id: string; invoice_number: string; customer_name: string; customer_company: string | null;
  issue_date: string; due_date: string; currency: string; status: string;
  total_amount: number; balance_due: number; created_at: string;
};

const money = (value: number, currency: string) => new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(value || 0);
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
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('invoices').select('id,invoice_number,customer_name,customer_company,issue_date,due_date,currency,status,total_amount,balance_due,created_at').order('issue_date', { ascending: false }).order('created_at', { ascending: false });
    setLoading(false);
    if (error) return setMessage(error.message);
    setInvoices((data || []) as Invoice[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => invoices.filter((invoice) => {
    const haystack = `${invoice.invoice_number} ${invoice.customer_name} ${invoice.customer_company || ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (status === 'all' || effectiveStatus(invoice) === status);
  }), [invoices, query, status]);

  const totals = useMemo(() => ({
    issued: invoices.filter((invoice) => invoice.currency === 'AED').reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0),
    outstanding: invoices.filter((invoice) => invoice.currency === 'AED' && !['cancelled'].includes(invoice.status)).reduce((sum, invoice) => sum + Math.max(Number(invoice.balance_due || 0), 0), 0),
    overdue: invoices.filter((invoice) => invoice.currency === 'AED' && effectiveStatus(invoice) === 'overdue').reduce((sum, invoice) => sum + Math.max(Number(invoice.balance_due || 0), 0), 0),
  }), [invoices]);

  const remove = async (invoice: Invoice) => {
    if (!window.confirm(`Delete draft ${invoice.invoice_number}? This cannot be undone.`)) return;
    const { error } = await supabase.from('invoices').delete().eq('id', invoice.id);
    if (error) return setMessage(error.message);
    setMessage('Draft invoice deleted.'); void load();
  };

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold">Invoices</h1><p className="text-sm text-muted-foreground">Create UAE tax invoices, record payments, track balances, and print customer copies.</p></div><Button asChild><Link href="/admin/invoices/new"><Plus className="h-4 w-4" />New invoice</Link></Button></div>

    <div className="grid gap-4 sm:grid-cols-3">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total invoiced (AED)</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{money(totals.issued, 'AED')}</p></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Outstanding (AED)</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{money(totals.outstanding, 'AED')}</p></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Overdue (AED)</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-destructive">{money(totals.overdue, 'AED')}</p></CardContent></Card>
    </div>

    <Card><CardContent className="p-4"><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice or customer" className="pl-10" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">All statuses</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="cancelled">Cancelled</option></select></div></CardContent></Card>

    {message && <div role="status" className="rounded-lg border bg-secondary/30 p-3 text-sm">{message}</div>}
    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : filtered.length === 0 ? <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center"><FileText className="h-10 w-10 text-muted-foreground" /><div><p className="font-semibold">No invoices found</p><p className="text-sm text-muted-foreground">Create the first invoice or change the filters.</p></div></CardContent></Card> : <>
      <div className="grid gap-3 md:hidden">{filtered.map((invoice) => { const currentStatus = effectiveStatus(invoice); return <Card key={invoice.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><Link href={`/admin/invoices/${invoice.id}`} className="font-semibold text-primary hover:underline">{invoice.invoice_number}</Link><p className="text-sm">{invoice.customer_company || invoice.customer_name}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${statusClass[currentStatus]}`}>{currentStatus.replace('_', ' ')}</span></div><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Total</p><p className="font-medium">{money(invoice.total_amount, invoice.currency)}</p></div><div><p className="text-xs text-muted-foreground">Balance</p><p className="font-medium">{money(invoice.balance_due, invoice.currency)}</p></div><div><p className="text-xs text-muted-foreground">Issued</p><p>{invoice.issue_date}</p></div><div><p className="text-xs text-muted-foreground">Due</p><p>{invoice.due_date}</p></div></div>{invoice.status === 'draft' && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(invoice)}><Trash2 className="h-4 w-4" />Delete draft</Button>}</CardContent></Card>; })}</div>
      <Card className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-4">Invoice</th><th className="p-4">Customer</th><th className="p-4">Issued / Due</th><th className="p-4 text-right">Total</th><th className="p-4 text-right">Balance</th><th className="p-4">Status</th><th className="p-4" /></tr></thead><tbody>{filtered.map((invoice) => { const currentStatus = effectiveStatus(invoice); return <tr key={invoice.id} className="border-t hover:bg-secondary/20"><td className="p-4"><Link href={`/admin/invoices/${invoice.id}`} className="font-semibold text-primary hover:underline">{invoice.invoice_number}</Link></td><td className="p-4"><p className="font-medium">{invoice.customer_company || invoice.customer_name}</p>{invoice.customer_company && <p className="text-xs text-muted-foreground">{invoice.customer_name}</p>}</td><td className="p-4"><p>{invoice.issue_date}</p><p className="text-xs text-muted-foreground">Due {invoice.due_date}</p></td><td className="p-4 text-right font-medium">{money(invoice.total_amount, invoice.currency)}</td><td className="p-4 text-right">{money(invoice.balance_due, invoice.currency)}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusClass[currentStatus]}`}>{currentStatus.replace('_', ' ')}</span></td><td className="p-4 text-right">{invoice.status === 'draft' && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(invoice)} aria-label={`Delete ${invoice.invoice_number}`}><Trash2 className="h-4 w-4" /></Button>}</td></tr>; })}</tbody></table></div></Card>
    </>}
  </div>;
}

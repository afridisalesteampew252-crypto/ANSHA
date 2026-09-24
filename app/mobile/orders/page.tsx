'use client';

import Link from 'next/link';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type Invoice = { id: string; invoice_number: string; document_type: string; issue_date: string; currency: string; status: string; total_amount: number; amount_paid: number; balance_due: number };
function money(value: number, currency: string) { return new Intl.NumberFormat('en-AE', { style: 'currency', currency: currency || 'AED', maximumFractionDigits: 2 }).format(Number(value || 0)); }

export default function MobileOrdersPage() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void supabase.from('invoices').select('id,invoice_number,document_type,issue_date,currency,status,total_amount,amount_paid,balance_due').order('issue_date', { ascending: false }).then(({ data }) => { setRows((data || []) as Invoice[]); setLoading(false); }); }, []);
  return <section className="space-y-4"><Link href="/mobile/account" className="inline-flex items-center gap-1 text-sm font-black text-black/55"><ArrowLeft className="h-4 w-4" />Back to account</Link><div className="rounded-[2rem] bg-[#17191d] p-6 text-white"><FileText className="h-8 w-8 text-red-300" /><p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-red-300">Customer documents</p><h1 className="mt-2 text-3xl font-black">Invoices</h1><p className="mt-2 text-sm leading-6 text-white/60">View invoices and balances posted to your ANSHA account.</p></div>{loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#d21e1e]" /></div> : rows.length ? rows.map((row) => <article key={row.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="font-mono text-sm font-black">{row.invoice_number}</p><p className="mt-1 text-xs text-black/45">{new Date(row.issue_date).toLocaleDateString()} · {row.document_type.replaceAll('_', ' ')}</p></div><span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-black capitalize">{row.status.replaceAll('_', ' ')}</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-xs"><div><p className="text-black/40">Total</p><p className="mt-1 font-black">{money(row.total_amount, row.currency)}</p></div><div><p className="text-black/40">Paid</p><p className="mt-1 font-black">{money(row.amount_paid, row.currency)}</p></div><div><p className="text-black/40">Balance</p><p className="mt-1 font-black text-[#d21e1e]">{money(row.balance_due, row.currency)}</p></div></div></article>) : <div className="rounded-2xl bg-white p-8 text-center text-sm text-black/45 shadow-sm">No invoices have been posted to your account yet.</div>}</section>;
}

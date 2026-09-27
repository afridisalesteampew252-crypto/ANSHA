'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRight, Banknote, BookmarkCheck, Loader2, MessageCircle, PackageSearch, ReceiptText, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoneyBreakdown } from '@/components/money-breakdown';
import { addToCurrencyMap } from '@/lib/money';
import { supabase } from '@/lib/supabase/client';

type Invoice = { id: string; invoice_number: string; currency: string; balance_due: number; due_date: string | null; status: string; issue_date: string; document_type: string };
type Reservation = { id: string; kind: string; title: string; stock_status: string; reservation_eta: string | null };
type Inquiry = { id: string; message: string; status: string; created_at: string; part_id: string | null; vehicle_id: string | null };
type Proof = { id: string; status: string; created_at: string };
type Soa = { invoices: Invoice[] };
type Reservations = { vehicles: Reservation[]; parts: Reservation[] };

export default function PortalHomePage() {
  const [name, setName] = useState('Customer');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [unreadSupport, setUnreadSupport] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { setError('Please sign in again.'); setLoading(false); return; }
    const [profile, soa, reserved, inquiry, proof, support] = await Promise.all([
      supabase.from('customer_profiles').select('full_name,email').eq('id', user.id).eq('is_active', true).maybeSingle(),
      supabase.rpc('get_my_customer_soa'),
      supabase.rpc('get_my_reservations'),
      supabase.from('inquiries').select('id,message,status,created_at,part_id,vehicle_id').eq('customer_profile_id', user.id).order('created_at', { ascending: false }).limit(4),
      supabase.from('customer_payment_proofs').select('id,status,created_at').order('created_at', { ascending: false }).limit(10),
      supabase.from('support_messages').select('id', { count: 'exact', head: true }).eq('sender_kind', 'agent').is('read_at', null),
    ]);
    const issue = [profile.error, soa.error, reserved.error, inquiry.error, proof.error, support.error].find(Boolean);
    if (issue) { setError(issue.message); setLoading(false); return; }
    if (!profile.data) { setError('Your customer account is unavailable. Please contact support.'); setLoading(false); return; }
    setName(profile.data.full_name || profile.data.email || 'Customer');
    const books = (soa.data || {}) as Soa;
    setInvoices((books.invoices || []).filter((row) => row.document_type === 'tax_invoice' || row.document_type === 'commercial_invoice'));
    const stock = (reserved.data || { vehicles: [], parts: [] }) as Reservations;
    setReservations([...(stock.vehicles || []), ...(stock.parts || [])].filter((row) => row.stock_status === 'reserved'));
    setInquiries((inquiry.data || []) as Inquiry[]);
    setProofs((proof.data || []) as Proof[]);
    setUnreadSupport(support.count || 0);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const balances = useMemo(() => {
    const totals: Record<string, number> = {};
    invoices.filter((row) => row.status !== 'cancelled' && Number(row.balance_due) > 0)
      .forEach((row) => addToCurrencyMap(totals, row.currency, Number(row.balance_due)));
    return totals;
  }, [invoices]);
  const openInvoices = invoices.filter((row) => row.status !== 'cancelled' && Number(row.balance_due) > 0)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const pendingProofs = proofs.filter((row) => row.status === 'submitted').length;

  if (loading) return <div className="flex justify-center py-20" role="status"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="sr-only">Loading your account</span></div>;
  if (error) return <Card><CardContent className="space-y-3 p-6"><p role="alert">{error}</p><Button variant="outline" onClick={() => void load()}>Try again</Button></CardContent></Card>;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight">Welcome, {name}</h1><p className="text-sm text-muted-foreground">Your orders, payments, and messages in one place.</p></div>
      <Button asChild variant="accent"><Link href="/portal/catalog"><PackageSearch className="h-4 w-4" /> Browse stock</Link></Button>
    </header>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Link href="/portal/reservations" className="rounded-xl border bg-card p-4 hover:border-accent/50"><BookmarkCheck className="h-5 w-5 text-accent" /><p className="mt-3 text-2xl font-bold">{reservations.length}</p><p className="text-sm">Active reservations</p></Link>
      <Link href="/portal/invoices" className="rounded-xl border bg-card p-4 hover:border-accent/50"><ReceiptText className="h-5 w-5 text-accent" /><p className="mt-3 text-2xl font-bold">{openInvoices.length}</p><p className="text-sm">Invoices with balance</p></Link>
      <Link href="/portal/payments" className="rounded-xl border bg-card p-4 hover:border-accent/50"><Banknote className="h-5 w-5 text-accent" /><p className="mt-3 text-2xl font-bold">{pendingProofs}</p><p className="text-sm">TT copies awaiting review</p></Link>
      <Link href="/portal/support" className="rounded-xl border bg-card p-4 hover:border-accent/50"><MessageCircle className="h-5 w-5 text-accent" /><p className="mt-3 text-2xl font-bold">{unreadSupport}</p><p className="text-sm">Unread support replies</p></Link>
    </div>

    {openInvoices.length > 0 && <Card><CardHeader><CardTitle className="text-lg">Next payment action</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm text-muted-foreground">Outstanding balances</p><MoneyBreakdown amounts={balances} /></div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/portal/invoices/${openInvoices[0].id}`}>Review {openInvoices[0].invoice_number}</Link></Button><Button asChild><Link href="/portal/payments">Upload TT copy <ArrowRight className="h-4 w-4" /></Link></Button></div>
    </CardContent></Card>}

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BookmarkCheck className="h-5 w-5" /> Reserved stock</CardTitle></CardHeader><CardContent className="space-y-3">
        {reservations.length ? reservations.slice(0, 3).map((row) => <div key={row.kind + row.id} className="border-b pb-2 text-sm last:border-0"><p className="font-medium">{row.title}</p><p className="text-muted-foreground">{row.kind === 'vehicle' ? 'Vehicle' : 'Part'}{row.reservation_eta ? ` · ETA ${format(new Date(row.reservation_eta), 'dd MMM yyyy')}` : ''}</p></div>) : <p className="text-sm text-muted-foreground">No active reservations. Browse stock to find your next item.</p>}
        <Link href="/portal/reservations" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">All reservations <ArrowRight className="h-4 w-4" /></Link>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Send className="h-5 w-5" /> Your stock inquiries</CardTitle></CardHeader><CardContent className="space-y-3">
        {inquiries.length ? inquiries.map((row) => <div key={row.id} className="border-b pb-2 text-sm last:border-0"><p className="line-clamp-2 font-medium">{row.message}</p><p className="capitalize text-muted-foreground">{row.status.replaceAll('_', ' ')} · {format(new Date(row.created_at), 'dd MMM yyyy')}</p></div>) : <p className="text-sm text-muted-foreground">No account-linked inquiries yet. Ask about any vehicle or part from its stock page.</p>}
        <Link href="/portal/inquiries" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">All inquiries <ArrowRight className="h-4 w-4" /></Link>
      </CardContent></Card>
    </div>
    <div className="flex flex-wrap gap-3 text-sm"><Link className="font-semibold text-primary hover:underline" href="/portal/account">View account statement</Link><Link className="font-semibold text-primary hover:underline" href="/portal/support">Contact support</Link></div>
  </div>;
}

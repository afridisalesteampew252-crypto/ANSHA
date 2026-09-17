'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Car, CircleDollarSign, Inbox, Package, Plus, Users, WalletCards } from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { inquiryStatusLabels } from '@/lib/site-config';

type Invoice = { id: string; issue_date: string; currency: string; document_type: string; total_amount: number; amount_paid: number; balance_due: number; status: string };
type Remittance = { id: string; received_date: string; currency: string; amount: number; status: string };
type InventoryRow = { stock_status: string | null };

const COLORS = ['#dc2626', '#0f172a', '#10b981'];
const money = (value: number, currency = 'AED') => new Intl.NumberFormat('en-AE', { style: 'currency', currency, notation: value >= 1_000_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(Number(value || 0));
const isReceivable = (invoice: Invoice) => ['tax_invoice', 'commercial_invoice'].includes(invoice.document_type) && invoice.status !== 'cancelled';

export default function AdminDashboardPage() {
  const [counts, setCounts] = useState({ parts: 0, vehicles: 0, customers: 0, inquiries: 0, unreadChats: 0 });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [recentInquiries, setRecentInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const [partsRes, vehiclesRes, customersRes, inquiryRes, recentRes, invoiceRes, remittanceRes, partStockRes, vehicleStockRes, membershipRes] = await Promise.all([
        supabase.from('parts').select('id', { count: 'exact', head: true }),
        supabase.from('vehicles').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('inquiries').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('invoices').select('id,issue_date,currency,document_type,total_amount,amount_paid,balance_due,status').gte('issue_date', format(subMonths(new Date(), 6), 'yyyy-MM-dd')),
        supabase.from('remittances').select('id,received_date,currency,amount,status').gte('received_date', format(subMonths(new Date(), 6), 'yyyy-MM-dd')),
        supabase.from('parts').select('stock_status'),
        supabase.from('vehicles').select('stock_status'),
        user ? supabase.from('chat_participants').select('conversation_id,last_read_at').eq('user_id', user.id) : Promise.resolve({ data: [] as { conversation_id: string; last_read_at: string | null }[] }),
      ]);
      let unreadChats = 0;
      const memberships = membershipRes.data || [];
      if (user && memberships.length) {
        const readAt = new Map(memberships.map((row) => [row.conversation_id, row.last_read_at]));
        const { data: messageRows } = await supabase.from('chat_messages').select('conversation_id,sender_id,created_at').in('conversation_id', memberships.map((row) => row.conversation_id)).neq('sender_id', user.id).order('created_at', { ascending: false }).limit(1000);
        unreadChats = (messageRows || []).filter((message) => {
          const lastRead = readAt.get(message.conversation_id);
          return !lastRead || message.created_at > lastRead;
        }).length;
      }
      setCounts({ parts: partsRes.count || 0, vehicles: vehiclesRes.count || 0, customers: customersRes.count || 0, inquiries: inquiryRes.count || 0, unreadChats });
      setInvoices((invoiceRes.data || []) as Invoice[]);
      setRemittances((remittanceRes.data || []) as Remittance[]);
      setInventory([...(partStockRes.data || []), ...(vehicleStockRes.data || [])] as InventoryRow[]);
      setRecentInquiries(recentRes.data || []);
      setLoading(false);
    })();
  }, []);

  const receivables = useMemo(() => invoices.filter(isReceivable), [invoices]);
  const currency = receivables[0]?.currency || remittances[0]?.currency || 'AED';
  const totals = useMemo(() => ({
    invoiced: receivables.reduce((sum, row) => sum + Number(row.total_amount), 0),
    received: remittances.filter((row) => row.status === 'confirmed').reduce((sum, row) => sum + Number(row.amount), 0),
    outstanding: receivables.reduce((sum, row) => sum + Number(row.balance_due), 0),
  }), [receivables, remittances]);
  const monthly = useMemo(() => Array.from({ length: 6 }, (_, offset) => {
    const month = startOfMonth(subMonths(new Date(), 5 - offset));
    const key = format(month, 'yyyy-MM');
    return { month: format(month, 'MMM'), invoiced: receivables.filter((row) => row.issue_date.startsWith(key)).reduce((sum, row) => sum + Number(row.total_amount), 0), received: remittances.filter((row) => row.status === 'confirmed' && row.received_date.startsWith(key)).reduce((sum, row) => sum + Number(row.amount), 0) };
  }), [receivables, remittances]);
  const stockData = useMemo(() => ['available', 'reserved', 'sold'].map((status) => ({ name: status.charAt(0).toUpperCase() + status.slice(1), value: inventory.filter((row) => (row.stock_status || 'available') === status).length })), [inventory]);

  const operationalCards = [
    { label: 'Parts stock', value: counts.parts, icon: Package, href: '/admin/parts' },
    { label: 'Vehicle stock', value: counts.vehicles, icon: Car, href: '/admin/vehicles' },
    { label: 'Customers', value: counts.customers, icon: Users, href: '/admin/customers' },
    { label: 'New inquiries', value: counts.inquiries, icon: Inbox, href: '/admin/inquiries' },
  ];

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold tracking-tight">Operations dashboard</h1><p className="text-sm text-muted-foreground">Financial, customer, inventory, and inquiry performance in one view.</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link href="/admin/remittances"><WalletCards className="h-4 w-4" />Record funds</Link></Button><Button asChild><Link href="/admin/invoices/new"><Plus className="h-4 w-4" />New invoice</Link></Button></div></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label: 'Invoiced · 6 months', value: money(totals.invoiced,currency), icon: CircleDollarSign }, { label: 'Funds received', value: money(totals.received,currency), icon: WalletCards }, { label: 'Outstanding', value: money(totals.outstanding,currency), icon: CircleDollarSign }, { label: 'Unread team messages', value: String(counts.unreadChats), icon: Inbox }].map((card) => <Card key={card.label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{card.label}</p><p className="mt-1 text-2xl font-bold">{loading ? '—' : card.value}</p></div><span className="rounded-xl bg-primary/10 p-3 text-primary"><card.icon className="h-5 w-5" /></span></CardContent></Card>)}
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{operationalCards.map((card) => <Link key={card.label} href={card.href}><Card className="h-full transition-shadow hover:shadow-md"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{card.label}</p><p className="mt-1 text-3xl font-bold">{loading ? '—' : card.value}</p></div><card.icon className="h-7 w-7 text-primary" /></CardContent></Card></Link>)}</div>

    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <Card><CardHeader><CardTitle className="text-lg">Invoiced versus received</CardTitle><CardDescription>Six-month collection performance for customer receivables.</CardDescription></CardHeader><CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><Tooltip formatter={(value) => money(Number(value),currency)} /><Legend /><Bar dataKey="invoiced" name="Invoiced" fill="#dc2626" radius={[5,5,0,0]} /><Bar dataKey="received" name="Received" fill="#10b981" radius={[5,5,0,0]} /></BarChart></ResponsiveContainer></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-lg">Stock position</CardTitle><CardDescription>Parts and vehicles by operational status.</CardDescription></CardHeader><CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={stockData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={3}>{stockData.map((entry,index) => <Cell key={entry.name} fill={COLORS[index]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></CardContent></Card>
    </div>

    <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle className="text-lg">Recent inquiries</CardTitle><CardDescription>Latest customer messages requiring attention.</CardDescription></div><Button asChild variant="ghost" size="sm"><Link href="/admin/inquiries">View all<ArrowRight className="h-4 w-4" /></Link></Button></div></CardHeader><CardContent>{loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> : recentInquiries.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No inquiries yet.</p> : <div className="space-y-3">{recentInquiries.map((inquiry) => <div key={inquiry.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{inquiry.customer_name}</p><p className="truncate text-sm text-muted-foreground">{inquiry.message}</p></div><span className="ml-4 shrink-0 text-xs text-muted-foreground">{inquiryStatusLabels[inquiry.status] || inquiry.status}</span></div>)}</div>}</CardContent></Card>
  </div>;
}

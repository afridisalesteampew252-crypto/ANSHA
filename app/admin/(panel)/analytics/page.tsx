'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, subMonths } from 'date-fns';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { STOCK_ORIGINS } from '@/lib/stock';
import type { OpsAnalyticsSummary } from '@/lib/ops-analytics';

const ACCENT = 'hsl(0 75% 47%)';
const COLORS = [ACCENT, '#0f172a', '#10b981', '#c4a35a', '#2563eb', '#64748b'];
const money = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 1 }).format(Number(value || 0));

const defaultFrom = () => format(subMonths(new Date(), 5), 'yyyy-MM-01');
const defaultTo = () => format(new Date(), 'yyyy-MM-dd');

export default function AdminAnalyticsPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<OpsAnalyticsSummary | null>(null);

  const load = useCallback(async () => {
    if (!from || !to) return toast.error('Choose a from and to date');
    if (to < from) return toast.error('To date must be on or after from date');
    setBusy(true);
    const { data, error } = await supabase.rpc('get_ops_analytics_summary', { p_from: from, p_to: to });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSummary(data as OpsAnalyticsSummary);
  }, [from, to]);

  const currency = summary?.sales.totals.currency_focus || summary?.collections?.totals.currency_focus || 'AED';
  const isOps = summary?.viewer.is_ops ?? false;

  const monthly = useMemo(() => {
    if (!summary) return [];
    const keys = new Set([
      ...summary.sales.by_month.map((row) => row.month_key),
      ...(summary.collections?.by_month.map((row) => row.month_key) || []),
    ]);
    return Array.from(keys).sort().map((key) => {
      const salesRow = summary.sales.by_month.find((row) => row.month_key === key);
      const receivedRow = summary.collections?.by_month.find((row) => row.month_key === key);
      return {
        month: salesRow?.month_label || receivedRow?.month_label || key,
        invoiced: Number(salesRow?.invoiced_total || 0),
        received: Number(receivedRow?.received_total || 0),
        tax: Number(salesRow?.tax_invoice_count || 0),
        commercial: Number(salesRow?.commercial_invoice_count || 0),
      };
    });
  }, [summary]);

  const stockData = useMemo(() => {
    if (!summary) return [];
    return ['available', 'reserved', 'sold'].map((status) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: Number(summary.stock.by_status[status as keyof typeof summary.stock.by_status] || 0),
    }));
  }, [summary]);

  const originData = useMemo(() => {
    if (!summary) return [];
    return summary.stock.by_origin.map((row) => ({
      name: STOCK_ORIGINS.find((origin) => origin.value === row.origin)?.label.replace(' Stock', '') || row.origin,
      value: Number(row.count || 0),
    }));
  }, [summary]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operations analytics</h1>
          <p className="text-sm text-muted-foreground">
            Date-range KPIs from invoices, stock, purchase, and requests.{' '}
            <Link href="/admin/dashboard" className="text-primary underline">Back to dashboard</Link>
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Date range</CardTitle>
          <CardDescription>Uses `get_ops_analytics_summary`. Sales see own-book receivables only.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="analytics-from">From</Label>
            <Input id="analytics-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="analytics-to">To</Label>
            <Input id="analytics-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <Button onClick={() => void load()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Load summary
          </Button>
        </CardContent>
      </Card>

      {!summary ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <BarChart3 className="h-10 w-10 text-accent" />
            <p className="text-sm">Choose a range and load the summary to see KPIs and charts.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Invoiced ({summary.sales.scope})</p>
                <p className="mt-1 text-2xl font-bold">{money(summary.sales.totals.invoiced_total, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{summary.sales.totals.invoice_count} tax/commercial invoices</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Outstanding AR</p>
                <p className="mt-1 text-2xl font-bold">{money(summary.sales.outstanding_total, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Open balances as of today</p>
              </CardContent>
            </Card>
            {isOps && summary.collections ? (
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Funds received</p>
                  <p className="mt-1 text-2xl font-bold">{money(summary.collections.totals.received_total, currency)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{summary.collections.totals.remittance_count} confirmed remittances</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Open requests</p>
                  <p className="mt-1 text-2xl font-bold">{summary.requests.open}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{summary.requests.overdue} overdue</p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Stock available</p>
                <p className="mt-1 text-2xl font-bold">{summary.stock.by_status.available}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {summary.stock.by_status.reserved} reserved · {summary.stock.by_status.sold} sold
                </p>
              </CardContent>
            </Card>
          </div>

          {isOps && summary.purchase ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Open POs</p>
                  <p className="mt-1 text-2xl font-bold">{summary.purchase.open_pos}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Draft POs</p>
                  <p className="mt-1 text-2xl font-bold">{summary.purchase.draft_pos}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">GRNs in range</p>
                  <p className="mt-1 text-2xl font-bold">{summary.purchase.grn_in_range}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">GRNs total</p>
                  <p className="mt-1 text-2xl font-bold">{summary.purchase.grn_total}</p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Open requests</p>
                <p className="mt-1 text-2xl font-bold">{summary.requests.open}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Overdue requests</p>
                <p className="mt-1 text-2xl font-bold">{summary.requests.overdue}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{isOps ? 'Invoiced versus received' : 'Invoiced by month'}</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly.length ? monthly : [{ month: '—', invoiced: 0, received: 0 }]}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => money(Number(value), currency)} />
                    <Legend />
                    <Bar dataKey="invoiced" name="Invoiced" fill={ACCENT} radius={[5, 5, 0, 0]} />
                    {isOps ? <Bar dataKey="received" name="Received" fill="#10b981" radius={[5, 5, 0, 0]} /> : null}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Stock position</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stockData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={3}>
                      {stockData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Invoices by type</CardTitle>
              <CardDescription>Tax versus commercial counts in the selected range.</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly.length ? monthly : [{ month: '—', tax: 0, commercial: 0 }]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="tax" name="Tax invoices" fill={ACCENT} radius={[5, 5, 0, 0]} />
                  <Bar dataKey="commercial" name="Commercial" fill="#0f172a" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Stock by origin</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={originData.length ? originData : [{ name: 'No stock', value: 0 }]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="value" name="Units" fill={ACCENT} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

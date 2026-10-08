'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Bell, Car, CircleDollarSign, ClipboardList, Inbox, KeyRound, Megaphone, Package, PackagePlus, Plus, Truck, Users, WalletCards, BookmarkPlus, ReceiptText, MessageCircle,
} from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { inquiryStatusLabels } from '@/lib/site-config';
import { STOCK_ORIGINS } from '@/lib/stock';
import type { OpsAnalyticsSummary } from '@/lib/ops-analytics';
import { isFieldAgentRole } from '@/lib/admin-rbac';
import { cn } from '@/lib/utils';
import {
  activeCurrencies,
  addToCurrencyMap,
  listCurrencies,
  formatMoneyCompact,
  normalizeCurrency,
} from '@/lib/money';
import { MoneyBreakdown } from '@/components/money-breakdown';
import { TodaysWorkQueue } from '@/components/admin/todays-work-queue';
import { SystemHealthStatus } from '@/components/admin/system-health-status';
import { ChartErrorBoundary } from '@/components/charts/chart-error-boundary';
import { fetchDashboardData } from '@/lib/dashboard-data';

type Invoice = { id: string; issue_date: string; currency: string; document_type: string; total_amount: number; amount_paid: number; balance_due: number; status: string };
type Remittance = { id: string; received_date: string; currency: string; amount: number; status: string };
type InventoryRow = { stock_status: string | null; stock_origin: string | null };
type RecentInquiry = { id: string; customer_name: string; message: string; status: string };

const ACCENT = 'hsl(0 75% 47%)';
const COLORS = [ACCENT, '#0f172a', '#10b981', '#c4a35a', '#2563eb', '#64748b'];
const isReceivable = (invoice: Invoice) => ['tax_invoice', 'commercial_invoice', 'proforma_invoice'].includes(invoice.document_type) && invoice.status !== 'cancelled' && invoice.status !== 'draft';
const rangeFrom = () => format(subMonths(new Date(), 5), 'yyyy-MM-01');
const rangeTo = () => format(new Date(), 'yyyy-MM-dd');


function KpiCard({
  label,
  value,
  icon: Icon,
  loading,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  icon: typeof CircleDollarSign;
  loading: boolean;
  tone?: 'default' | 'accent' | 'ink';
}) {
  return (
    <Card className={cn(
      'border-border/80 shadow-sm',
      tone === 'accent' && 'border-accent/25 bg-gradient-to-br from-accent/[0.07] to-card',
      tone === 'ink' && 'border-[#101114]/15 bg-gradient-to-br from-[#101114]/[0.04] to-card dark:from-white/[0.04]'
    )}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <div className="mt-1.5">{loading ? <span className="text-2xl font-black tracking-tight">—</span> : value}</div>
        </div>
        <span className={cn(
          'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
          tone === 'accent' ? 'bg-accent text-white' : tone === 'ink' ? 'bg-[#101114] text-white dark:bg-white dark:text-[#101114]' : 'bg-accent/10 text-accent'
        )}>
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function StatLink({
  href,
  label,
  value,
  icon: Icon,
  loading,
  warn,
}: {
  href: string;
  label: string;
  value: string | number;
  icon: typeof Package;
  loading: boolean;
  warn?: boolean;
}) {
  return (
    <Link href={href} className="group block h-full">
      <Card className={cn(
        'h-full border-border/80 transition-all hover:border-accent/30 hover:shadow-md',
        warn && 'border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/20'
      )}>
        <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{loading ? '—' : value}</p>
          </div>
          <Icon className={cn('h-6 w-6 shrink-0 text-accent transition group-hover:scale-105', warn && 'text-amber-600')} />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const [role, setRole] = useState<string | null>(null);
  const [counts, setCounts] = useState({ parts: 0, vehicles: 0, customers: 0, inquiries: 0, unreadChats: 0, portalUsers: 0, pushSubscribers: 0, draftProformas: 0, reservations: 0 });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [recentInquiries, setRecentInquiries] = useState<RecentInquiry[]>([]);
  const [analytics, setAnalytics] = useState<OpsAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [moneyCurrency, setMoneyCurrency] = useState('all');
  const [enabledMoneyCurrencies, setEnabledMoneyCurrencies] = useState<string[]>([]);

  const [reloadKey, setReloadKey] = useState(0);
  const [analyticsWarning, setAnalyticsWarning] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    setAnalyticsWarning('');
    void fetchDashboardData(supabase, rangeFrom(), rangeTo(), controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRole(result.role);
        setCounts(result.counts);
        setInvoices(result.invoices);
        setRemittances(result.remittances);
        setInventory(result.inventory);
        setRecentInquiries(result.recentInquiries);
        setAnalytics(result.analytics);
        setEnabledMoneyCurrencies(result.currencies);
        setAnalyticsWarning(result.warning);
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Dashboard data could not be loaded. Please retry.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reloadKey]);

  const fieldAgent = isFieldAgentRole(role);
  const isOps = analytics?.viewer?.is_ops ?? (!fieldAgent && role !== 'manager');
  const receivables = useMemo(() => invoices.filter(isReceivable), [invoices]);

  const moneyByCurrency = useMemo(() => {
    const invoiced: Record<string, number> = {};
    const received: Record<string, number> = {};
    const outstanding: Record<string, number> = {};

    if (analytics?.sales.by_currency?.length) {
      for (const row of analytics.sales.by_currency) {
        addToCurrencyMap(invoiced, row.currency, Number(row.invoiced_total || 0));
      }
    } else {
      for (const row of receivables) {
        if (row.issue_date >= rangeFrom() && row.issue_date <= rangeTo()) addToCurrencyMap(invoiced, row.currency, Number(row.total_amount || 0));
      }
    }

    if (analytics?.sales.outstanding_as_of?.length) {
      for (const row of analytics.sales.outstanding_as_of) {
        addToCurrencyMap(outstanding, row.currency, Number(row.outstanding_ar || 0));
      }
    } else if (analytics?.sales.by_currency?.length) {
      for (const row of analytics.sales.by_currency) {
        addToCurrencyMap(outstanding, row.currency, Number(row.outstanding_ar || 0));
      }
    } else {
      for (const row of receivables) {
        addToCurrencyMap(outstanding, row.currency, Math.max(Number(row.balance_due || 0), 0));
      }
    }

    if (analytics?.collections?.by_currency?.length) {
      for (const row of analytics.collections.by_currency) {
        addToCurrencyMap(received, row.currency, Number(row.received_total || 0));
      }
    } else {
      for (const row of remittances) {
        if (row.status !== 'confirmed') continue;
        addToCurrencyMap(received, row.currency, Number(row.amount || 0));
      }
    }

    return { invoiced, received, outstanding };
  }, [analytics, receivables, remittances]);

  const moneyCurrencies = useMemo(
    () => listCurrencies([
      ...enabledMoneyCurrencies,
      ...activeCurrencies(moneyByCurrency.invoiced, moneyByCurrency.received, moneyByCurrency.outstanding),
    ]),
    [enabledMoneyCurrencies, moneyByCurrency]
  );

  const chartCurrency = moneyCurrency === 'all'
    ? (analytics?.sales.totals.currency_focus
      || analytics?.collections?.totals.currency_focus
      || moneyCurrencies[0]
      || 'AED')
    : moneyCurrency;

  const monthly = useMemo(() => {
    const useClientMonthly = moneyCurrency !== 'all' || !analytics?.sales.by_month?.length;

    if (!useClientMonthly && (analytics?.sales.by_month?.length || analytics?.collections?.by_month?.length)) {
      // Analytics monthly totals can mix currencies — only use them when a single currency dominates the focus filter.
      const multiCurrency = moneyCurrencies.length > 1;
      if (!multiCurrency) {
        return Array.from({ length: 6 }, (_, offset) => {
          const month = startOfMonth(subMonths(new Date(), 5 - offset));
          const key = format(month, 'yyyy-MM');
          const salesRow = analytics.sales.by_month.find((row) => row.month_key === key);
          const receivedRow = analytics.collections?.by_month.find((row) => row.month_key === key);
          return {
            month: format(month, 'MMM'),
            invoiced: Number(salesRow?.invoiced_total || 0),
            received: Number(receivedRow?.received_total || 0),
            tax: Number(salesRow?.tax_invoice_count || 0),
            commercial: Number(salesRow?.commercial_invoice_count || 0),
          };
        });
      }
    }

    return Array.from({ length: 6 }, (_, offset) => {
      const month = startOfMonth(subMonths(new Date(), 5 - offset));
      const key = format(month, 'yyyy-MM');
      const invRows = receivables.filter(
        (row) => row.issue_date.startsWith(key) && normalizeCurrency(row.currency) === normalizeCurrency(chartCurrency)
      );
      const remRows = remittances.filter(
        (row) =>
          row.status === 'confirmed'
          && row.received_date.startsWith(key)
          && normalizeCurrency(row.currency) === normalizeCurrency(chartCurrency)
      );
      return {
        month: format(month, 'MMM'),
        invoiced: invRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
        received: remRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
        tax: 0,
        commercial: 0,
      };
    });
  }, [analytics, chartCurrency, moneyCurrency, moneyCurrencies.length, receivables, remittances]);

  const stockData = useMemo(() => {
    if (analytics?.stock.by_status) {
      return ['available', 'reserved', 'sold'].map((status) => ({
        name: status.charAt(0).toUpperCase() + status.slice(1),
        value: Number(analytics.stock.by_status[status as keyof typeof analytics.stock.by_status] || 0),
      }));
    }
    return ['available', 'reserved', 'sold'].map((status) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: inventory.filter((row) => (row.stock_status || 'available') === status).length,
    }));
  }, [analytics, inventory]);

  const originData = useMemo(() => {
    if (analytics?.stock.by_origin?.length) {
      return analytics.stock.by_origin.map((row) => ({
        name: STOCK_ORIGINS.find((origin) => origin.value === row.origin)?.label.replace(' Stock', '') || row.origin,
        value: Number(row.count || 0),
      })).filter((row) => row.value > 0);
    }
    return STOCK_ORIGINS.map((origin) => ({
      name: origin.label.replace(' Stock', ''),
      value: inventory.filter((row) => (row.stock_origin || 'dubai') === origin.value).length,
    })).filter((row) => row.value > 0);
  }, [analytics, inventory]);

  const errorBanner = loadError ? (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span>{loadError}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => setReloadKey((value) => value + 1)}>Retry</Button>
    </div>
  ) : null;

  // A failed load must not turn unknown figures into zeros or expose stale totals.
  if (loadError) return <div className="mx-auto max-w-5xl space-y-4"><h1 className="text-2xl font-bold">Dashboard</h1>{errorBanner}</div>;
  if (loading) return <div role="status" className="p-6 text-sm text-muted-foreground">Loading dashboard…</div>;

  if (fieldAgent) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        {errorBanner}
        <section className="admin-dash-hero overflow-hidden rounded-2xl border border-border/80 px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Field agent</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Sales workspace</h2>
              <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                Browse catalog, manage your customers, reserve vehicles, and create draft proforma invoices for accounts to approve.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="accent" size="sm"><Link href="/admin/invoices/new"><Plus className="h-4 w-4" />Draft proforma</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/admin/reservations"><BookmarkPlus className="h-4 w-4" />Reserve</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/admin/customers"><Users className="h-4 w-4" />Customers</Link></Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatLink href="/admin/parts" label="Parts catalog" value={counts.parts} icon={Package} loading={loading} />
          <StatLink href="/admin/vehicles" label="Vehicle catalog" value={counts.vehicles} icon={Car} loading={loading} />
          <StatLink href="/admin/customers" label="Your customers" value={counts.customers} icon={Users} loading={loading} />
          <StatLink href="/admin/invoices?documentType=proforma_invoice&status=draft" label="Draft proformas" value={counts.draftProformas} icon={ReceiptText} loading={loading} />
          <StatLink href="/admin/reservations" label="Reserved stock" value={counts.reservations} icon={BookmarkPlus} loading={loading} />
          <StatLink href="/admin/chat" label="Unread team chat" value={counts.unreadChats} icon={MessageCircle} loading={loading} />
        </section>
      </div>
    );
  }

  const operationalCards = [
    { label: 'Parts stock', value: analytics?.stock.parts_total ?? counts.parts, icon: Package, href: '/admin/parts' },
    { label: 'Vehicle stock', value: analytics?.stock.vehicles_total ?? counts.vehicles, icon: Car, href: '/admin/vehicles' },
    { label: 'Customers', value: analytics?.counts.customers ?? counts.customers, icon: Users, href: '/admin/customers' },
    { label: 'Portal logins', value: analytics?.counts.portal_users ?? counts.portalUsers, icon: KeyRound, href: '/admin/customers' },
    { label: 'New inquiries', value: analytics?.counts.new_inquiries ?? counts.inquiries, icon: Inbox, href: '/admin/inquiries' },
    ...(isOps ? [{ label: 'PWA subscribers', value: counts.pushSubscribers, icon: Bell, href: '/admin/subscribers' }] : []),
  ].filter((card) => card.label !== 'Portal logins' || isOps || card.value != null);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {errorBanner}
      {analyticsWarning ? <p role="status" className="rounded-lg border p-3 text-sm text-muted-foreground">{analyticsWarning}</p> : null}
      <SystemHealthStatus />
      <section className="admin-dash-hero overflow-hidden rounded-2xl border border-border/80 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">At a glance</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Operations dashboard</h2>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              Finance, stock, and inbox signals in one place.
              {analytics?.sales.scope === 'own_book' ? ' Showing your customer book.' : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="accent" size="sm"><Link href="/admin/invoices/new"><Plus className="h-4 w-4" />New invoice</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/admin/analytics">Analytics</Link></Button>
            {isOps ? <Button asChild variant="outline" size="sm"><Link href="/admin/remittances"><WalletCards className="h-4 w-4" />Funds</Link></Button> : null}
            {isOps ? <Button asChild variant="outline" size="sm"><Link href="/admin/offers"><Megaphone className="h-4 w-4" />Deals</Link></Button> : null}
            {isOps ? <Button asChild variant="outline" size="sm"><Link href="/admin/subscribers"><Bell className="h-4 w-4" />Subscribers</Link></Button> : null}
            <Button asChild variant="outline" size="sm"><Link href="/admin/customers"><KeyRound className="h-4 w-4" />Portal</Link></Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Money · 6 months</h3>
          {moneyCurrencies.length > 0 ? (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Money currency filter">
              <button
                type="button"
                onClick={() => setMoneyCurrency('all')}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs font-semibold transition',
                  moneyCurrency === 'all'
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-background text-muted-foreground hover:border-accent/40'
                )}
              >
                All currencies
              </button>
              {moneyCurrencies.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setMoneyCurrency(code)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-semibold transition',
                    moneyCurrency === code
                      ? 'border-accent bg-accent text-white'
                      : 'border-border bg-background text-muted-foreground hover:border-accent/40'
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={analytics?.sales.scope === 'own_book' ? 'Your invoiced' : 'Invoiced'}
            value={<MoneyBreakdown amounts={moneyByCurrency.invoiced} currencyFilter={moneyCurrency} compact size="lg" />}
            icon={CircleDollarSign}
            loading={loading}
            tone="accent"
          />
          <KpiCard
            label={isOps ? 'Funds received' : 'Outstanding AR'}
            value={
              isOps
                ? <MoneyBreakdown amounts={moneyByCurrency.received} currencyFilter={moneyCurrency} compact size="lg" />
                : <MoneyBreakdown amounts={moneyByCurrency.outstanding} currencyFilter={moneyCurrency} compact size="lg" />
            }
            icon={isOps ? WalletCards : CircleDollarSign}
            loading={loading}
            tone="ink"
          />
          <KpiCard
            label={isOps ? 'Outstanding AR' : 'Open requests'}
            value={
              isOps
                ? <MoneyBreakdown amounts={moneyByCurrency.outstanding} currencyFilter={moneyCurrency} compact size="lg" />
                : <span className="text-2xl font-black tracking-tight">{String(analytics?.requests.open ?? '—')}</span>
            }
            icon={isOps ? CircleDollarSign : ClipboardList}
            loading={loading}
          />
          <KpiCard
            label="Unread team chat"
            value={<span className="text-2xl font-black tracking-tight">{String(counts.unreadChats)}</span>}
            icon={Inbox}
            loading={loading}
          />
        </div>
        {moneyCurrencies.length > 1 ? (
          <p className="text-xs text-muted-foreground">
            {moneyCurrency === 'all'
              ? `Totals are listed per currency — amounts are not converted. Chart below uses ${chartCurrency} only.`
              : `Showing ${moneyCurrency} only. Switch to All currencies for a stacked breakdown (no FX).`}
          </p>
        ) : null}
      </section>

      {(analytics?.requests || analytics?.purchase) ? (
        <section className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Workflow</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatLink href="/admin/requests" label="Open requests" value={analytics?.requests.open ?? 0} icon={ClipboardList} loading={loading} />
            <StatLink href="/admin/requests" label="Overdue requests" value={analytics?.requests.overdue ?? 0} icon={Inbox} loading={loading} warn={(analytics?.requests.overdue ?? 0) > 0} />
            {isOps && analytics?.purchase ? (
              <>
                <StatLink href="/admin/purchase-orders" label="Open POs" value={analytics.purchase.open_pos} icon={Truck} loading={loading} />
                <StatLink href="/admin/inventory/receive" label="GRNs · period" value={analytics.purchase.grn_in_range} icon={PackagePlus} loading={loading} />
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      <TodaysWorkQueue />

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Catalog &amp; people</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {operationalCards.map((card) => (
            <StatLink key={card.label} href={card.href} label={card.label} value={card.value} icon={card.icon} loading={loading} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{isOps ? 'Invoiced versus received' : 'Invoiced by month'}</CardTitle>
            <CardDescription>
              {isOps
                ? `Six-month collection performance (${chartCurrency} only — no FX conversion).`
                : `Tax and commercial invoices on your customer book (${chartCurrency}).`}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ChartErrorBoundary resetKey={`${reloadKey}:${chartCurrency}`}><ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => formatMoneyCompact(Number(value), chartCurrency)} />
                <Legend />
                <Bar dataKey="invoiced" name="Invoiced" fill={ACCENT} radius={[5, 5, 0, 0]} />
                {isOps ? <Bar dataKey="received" name="Received" fill="#10b981" radius={[5, 5, 0, 0]} /> : null}
              </BarChart>
            </ResponsiveContainer></ChartErrorBoundary>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Stock position</CardTitle>
            <CardDescription>Parts and vehicles by operational status.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ChartErrorBoundary resetKey={`${reloadKey}:${chartCurrency}`}><ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stockData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={100} startAngle={0} endAngle={360} minAngle={0} paddingAngle={3}>
                  {stockData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer></ChartErrorBoundary>
          </CardContent>
        </Card>
      </div>

      {analytics?.sales.by_month?.some((row) => row.tax_invoice_count || row.commercial_invoice_count) ? (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Invoices by type</CardTitle>
            <CardDescription>Tax versus commercial invoice counts by month.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ChartErrorBoundary resetKey={`${reloadKey}:${chartCurrency}`}><ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="tax" name="Tax invoices" fill={ACCENT} radius={[5, 5, 0, 0]} />
                <Bar dataKey="commercial" name="Commercial" fill="#0f172a" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer></ChartErrorBoundary>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Stock by origin</CardTitle>
          <CardDescription>Where inventory sits — Dubai (UAE), Japan, Singapore, China, Thailand, Taiwan.</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ChartErrorBoundary resetKey={`${reloadKey}:${chartCurrency}`}><ResponsiveContainer width="100%" height="100%">
            <BarChart data={originData.length ? originData : [{ name: 'No stock', value: 0 }]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="value" name="Units" fill={ACCENT} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></ChartErrorBoundary>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Recent inquiries</CardTitle>
              <CardDescription>Latest customer messages requiring attention.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/inquiries">View all<ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : recentInquiries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No inquiries yet.</p>
          ) : (
            <div className="divide-y divide-border/70">
              {recentInquiries.map((inquiry) => (
                <div key={inquiry.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{inquiry.customer_name}</p>
                    <p className="truncate text-sm text-muted-foreground">{inquiry.message}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {inquiryStatusLabels[inquiry.status] || inquiry.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

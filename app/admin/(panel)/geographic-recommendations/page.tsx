'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, subMonths } from 'date-fns';
import { Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Country = {
  country: string; currency: string; customer_count: number; invoice_count: number;
  invoiced: number; outstanding: number; settled_count: number; overdue_count: number;
  timed_count: number; on_time_count: number; reliability_score: number;
  confidence: 'enough_history' | 'limited_history';
};
type Seller = {
  seller_id: string; seller: string; country: string; currency: string;
  customer_count: number; invoice_count: number; invoiced: number;
  settled_count: number; overdue_count: number;
};
type Report = { from: string; to: string; countries: Country[]; sellers: Seller[] };
const percent = (part: number, total: number) => total ? `${Math.round(100 * part / total)}%` : '—';

export default function GeographicRecommendationsPage() {
  const [from, setFrom] = useState(() => format(subMonths(new Date(), 12), 'yyyy-MM-dd'));
  const [to, setTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [report, setReport] = useState<Report | null>(null);
  const [currency, setCurrency] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!from || !to || from > to || to > format(new Date(), 'yyyy-MM-dd')) {
      setError('Choose a valid date range ending today or earlier.');
      return;
    }
    setBusy(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('get_geographic_recommendations', { p_from: from, p_to: to });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); setReport(null); return; }
    const next = data as Report;
    setReport(next);
    setCurrency((current) => [ ...new Set(next.countries.map((row) => row.currency)) ].includes(current)
      ? current : (next.countries[0]?.currency || ''));
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);
  const currencies = useMemo(() => [...new Set(report?.countries.map((row) => row.currency) || [])], [report]);
  const countries = useMemo(() => report?.countries.filter((row) => row.currency === currency) || [], [report, currency]);
  const sellers = useMemo(() => report?.sellers.filter((row) => row.currency === currency) || [], [report, currency]);
  const reliable = countries.filter((row) => row.confidence === 'enough_history' && row.country !== 'Unknown');
  const leading = reliable[0];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Geographic recommendations</h1>
        <p className="text-sm text-muted-foreground">
          Customer countries and seller results from issued tax and commercial invoices. Figures stay in their original currency.
        </p>
      </header>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <label className="space-y-1 text-sm">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="space-y-1 text-sm">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <Button onClick={() => void load()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </Button>
          {currencies.length > 0 && <label className="space-y-1 text-sm">Currency
            <select aria-label="Currency" className="flex h-10 rounded-md border bg-background px-3" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>}
        </CardContent>
      </Card>
      {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm">{error}</p>}
      {busy && <p role="status" className="text-sm text-muted-foreground">Loading geographic evidence…</p>}
      {report && !busy && <>
        <Card><CardHeader><CardTitle>Where to focus</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
          {leading ? <p><strong>{leading.country}</strong> has the highest reliability score in {currency}: {leading.reliability_score}/100 across {leading.invoice_count} invoices and {leading.customer_count} customers. Review sales volume and outstanding balances before allocating resources.</p>
            : <p>There is not enough payment history to recommend a country in {currency || 'this period'} yet. At least 5 invoices, 3 customers, and 3 payments with dates are required.</p>}
          <p className="text-muted-foreground">Score: 50% settled invoices + 30% on-time payments among dated payments + 20% invoices without an overdue balance. It is a decision aid, not a prediction. Unknown countries are excluded from recommendations.</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Customer countries · {currency}</CardTitle></CardHeader><CardContent>
          {countries.length === 0 ? <p className="text-sm text-muted-foreground">No issued customer invoices in this range.</p> :
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr className="border-b text-muted-foreground"><th className="p-2">Country</th><th className="p-2">Customers</th><th className="p-2">Invoices</th><th className="p-2">Sales</th><th className="p-2">Outstanding</th><th className="p-2">Settled</th><th className="p-2">On time</th><th className="p-2">Overdue</th><th className="p-2">Evidence</th></tr></thead>
            <tbody>{countries.map((row) => <tr key={row.country + row.currency} className="border-b">
              <td className="p-2 font-medium">{row.country}</td><td className="p-2">{row.customer_count}</td><td className="p-2">{row.invoice_count}</td>
              <td className="p-2 whitespace-nowrap">{formatMoney(Number(row.invoiced), currency)}</td>
              <td className="p-2 whitespace-nowrap">{formatMoney(Number(row.outstanding), currency)}</td>
              <td className="p-2">{percent(row.settled_count, row.invoice_count)}</td>
              <td className="p-2">{percent(row.on_time_count, row.timed_count)} ({row.timed_count} dated)</td>
              <td className="p-2">{row.overdue_count}</td>
              <td className="p-2">{row.confidence === 'enough_history' ? `${row.reliability_score}/100` : 'Limited history'}</td>
            </tr>)}</tbody>
          </table></div>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Sellers by customer country · {currency}</CardTitle></CardHeader><CardContent>
          {sellers.length === 0 ? <p className="text-sm text-muted-foreground">No seller invoices in this range.</p> :
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm">
            <thead><tr className="border-b text-muted-foreground"><th className="p-2">Seller</th><th className="p-2">Customer country</th><th className="p-2">Customers</th><th className="p-2">Invoices</th><th className="p-2">Sales</th><th className="p-2">Settled</th><th className="p-2">Overdue</th></tr></thead>
            <tbody>{sellers.map((row) => <tr key={row.seller_id + row.country + row.currency} className="border-b">
              <td className="p-2 font-medium">{row.seller}</td><td className="p-2">{row.country}</td><td className="p-2">{row.customer_count}</td><td className="p-2">{row.invoice_count}</td>
              <td className="p-2 whitespace-nowrap">{formatMoney(Number(row.invoiced), currency)}</td><td className="p-2">{percent(row.settled_count, row.invoice_count)}</td><td className="p-2">{row.overdue_count}</td>
            </tr>)}</tbody>
          </table></div>}
          <p className="mt-3 text-sm text-muted-foreground">Seller is the staff member who created the invoice. Sales ranking is per country and currency; it does not imply delivery performance.</p>
        </CardContent></Card>
      </>}
    </div>
  );
}

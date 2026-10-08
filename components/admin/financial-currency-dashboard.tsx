'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchFinancialDashboard, type FinancialCurrencySummary } from '@/lib/financial-dashboard';
import { formatMoney } from '@/lib/money';
import { supabase } from '@/lib/supabase/client';
import { ChartErrorBoundary } from '@/components/charts/chart-error-boundary';

const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#64748b'];

type Props = {
  currencies: string[];
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
};

type DashboardState = {
  scope: string;
  status: 'loading' | 'ready' | 'error';
  summaries: FinancialCurrencySummary[];
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function CurrencySummary({ summary }: { summary: FinancialCurrencySummary }) {
  const positiveTotal = summary.expenseBreakdown.reduce((sum, account) => sum + account.value, 0);
  return (
    <Card className="min-w-0">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg">{summary.currency} financial summary</CardTitle>
        <CardDescription>Revenue, expenses and profit in {summary.currency}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
        <dl className="grid min-w-0 grid-cols-3 gap-2">
          {[
            { name: 'Revenue', amount: summary.revenue },
            { name: 'Expenses', amount: summary.expenses },
            { name: 'Net profit', amount: summary.profit },
          ].map((metric) => (
            <div key={metric.name} className="min-w-0 rounded-lg bg-muted/50 p-2 sm:p-3">
              <dt className="text-xs text-muted-foreground">{metric.name}</dt>
              <dd className={`mt-1 break-words text-sm font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-lg ${metric.name === 'Net profit' && metric.amount < 0 ? 'text-destructive' : ''}`}>
                {formatMoney(metric.amount, summary.currency)}
              </dd>
            </div>
          ))}
        </dl>

        <div>
          <h4 className="text-sm font-semibold">Expense account breakdown</h4>
          {positiveTotal > 0 ? (
            <>
              <div className="h-56 w-full min-w-0">
                <ChartErrorBoundary title={`${summary.currency} expense breakdown`} resetKey={JSON.stringify(summary.expenseBreakdown)}>
                  <div aria-hidden="true" className="h-full w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={100}>
                      <PieChart>
                        <Pie data={summary.expenseBreakdown} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" startAngle={0} endAngle={360} minAngle={0} paddingAngle={2} isAnimationActive={false}>
                          {summary.expenseBreakdown.map((account, index) => <Cell key={account.name} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value) => formatMoney(Number(value), summary.currency)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </ChartErrorBoundary>
              </div>
              <Table className="table-fixed">
                <caption className="sr-only">{summary.currency} expense account breakdown</caption>
                <TableHeader><TableRow><TableHead className="w-3/5 px-2">Account</TableHead><TableHead className="w-2/5 px-2 text-right">Amount ({summary.currency})</TableHead></TableRow></TableHeader>
                <TableBody>
                  {summary.expenseBreakdown.map((account, index) => (
                    <TableRow key={account.name}>
                      <TableCell className="break-words px-2 py-3 [overflow-wrap:anywhere]">
                        <span aria-hidden="true" className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />{account.name}
                      </TableCell>
                      <TableCell className="break-words px-2 py-3 text-right tabular-nums [overflow-wrap:anywhere]">{formatMoney(account.value, summary.currency)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow><TableCell className="px-2 py-3 font-medium">Positive expense balances</TableCell><TableCell className="break-words px-2 py-3 text-right font-medium tabular-nums [overflow-wrap:anywhere]">{formatMoney(positiveTotal, summary.currency)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No positive expense balances for {summary.currency} in this period.</p>
          )}
          {summary.expenseCredits > 0 && <p className="mt-3 text-xs leading-5 text-muted-foreground">Expense credits: {formatMoney(summary.expenseCredits, summary.currency)}. The pie shows positive expense balances; expense and profit totals include these credits.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function FinancialCurrencyDashboard({ currencies, from, to, onFromChange, onToChange }: Props) {
  const id = useId();
  const currenciesKey = JSON.stringify(Array.from(new Set(currencies.map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{3}$/.test(code)))).sort());
  const configuredCurrencies = useMemo<string[]>(() => JSON.parse(currenciesKey), [currenciesKey]);
  const scope = JSON.stringify([currenciesKey, from, to]);
  const [state, setState] = useState<DashboardState | null>(null);
  const requestIdRef = useRef(0);
  const autoLoadedCurrenciesRef = useRef<string | null>(null);
  const lastEffectScopeRef = useRef<string | null>(null);
  const periodError = !validDate(from) || !validDate(to)
    ? 'Enter valid From and To dates.'
    : from > to ? 'From date must be on or before To date.' : null;
  const current = state?.scope === scope ? state : null;
  const loading = !periodError && current?.status === 'loading';

  const load = useCallback(async () => {
    if (periodError) return;
    const requestId = ++requestIdRef.current;
    setState({ scope, status: 'loading', summaries: [] });
    try {
      const summaries = await fetchFinancialDashboard(supabase, configuredCurrencies, from, to);
      if (requestId !== requestIdRef.current) return;
      setState({ scope, status: 'ready', summaries });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState({ scope, status: 'error', summaries: [] });
    }
  }, [configuredCurrencies, from, periodError, scope, to]);

  useEffect(() => {
    // Date edits invalidate earlier requests immediately. Refresh explicitly for
    // the new period rather than requerying every date-picker edit.
    requestIdRef.current += 1;
    const autoLoad = autoLoadedCurrenciesRef.current !== currenciesKey || lastEffectScopeRef.current === scope;
    lastEffectScopeRef.current = scope;
    if (autoLoad) {
      autoLoadedCurrenciesRef.current = currenciesKey;
      void load();
    }
    return () => { requestIdRef.current += 1; };
  }, [currenciesKey, load, scope]);

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-4">
      <div>
        <h2 id={`${id}-title`} className="text-xl font-semibold">Financial dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">All configured and posted currencies, shown separately. Figures come from posted journals for the selected period.</p>
      </div>
      <div className="grid min-w-0 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="min-w-0 space-y-1.5"><Label htmlFor={`${id}-from`}>From date</Label><Input id={`${id}-from`} type="date" value={from} onChange={(event) => onFromChange(event.target.value)} aria-invalid={Boolean(periodError)} aria-describedby={periodError ? `${id}-period-error` : undefined} className="min-w-0" /></div>
        <div className="min-w-0 space-y-1.5"><Label htmlFor={`${id}-to`}>To date</Label><Input id={`${id}-to`} type="date" value={to} onChange={(event) => onToChange(event.target.value)} aria-invalid={Boolean(periodError)} aria-describedby={periodError ? `${id}-period-error` : undefined} className="min-w-0" /></div>
        <Button type="button" onClick={() => void load()} disabled={Boolean(periodError) || loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh dashboard</Button>
      </div>
      {periodError ? <p id={`${id}-period-error`} role="alert" className="text-sm text-destructive">{periodError}</p> : loading ? (
        <div role="status" aria-label="Loading financial dashboard">
          <p className="mb-3 text-sm text-muted-foreground">Loading financial dashboard…</p>
          <div aria-hidden="true" className="grid min-w-0 gap-4 md:grid-cols-2">{Array.from({ length: Math.max(1, configuredCurrencies.length) }).map((_, index) => <Skeleton key={index} className="h-96 min-w-0 rounded-lg" />)}</div>
        </div>
      ) : current?.status === 'error' ? (
        <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">Could not load the financial dashboard. Please try again.</p>
      ) : current?.status === 'ready' ? (
        <>
          <p className="text-sm text-muted-foreground">Period: {from} to {to}. Currencies are never added together.</p>
          {current.summaries.length ? <div className="grid min-w-0 gap-4 md:grid-cols-2">{current.summaries.map((summary) => <CurrencySummary key={summary.currency} summary={summary} />)}</div> : <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No configured currencies or posted journal currencies are available.</p>}
        </>
      ) : <p role="status" className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Refresh dashboard to load this period.</p>}
    </section>
  );
}

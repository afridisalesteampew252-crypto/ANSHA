'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileBarChart, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downloadRowsAsXlsx } from '@/lib/export-excel';
import { supabase } from '@/lib/supabase/client';
import type { GlBalanceSheetRow, GlProfitAndLossRow, GlTrialBalanceRow } from '@/lib/types';

const money = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getUTCFullYear()}-01-01`;

export default function ReportsPage() {
  const [busy, setBusy] = useState(false);
  const [asOf, setAsOf] = useState(today);
  const [pnlFrom, setPnlFrom] = useState(yearStart);
  const [pnlTo, setPnlTo] = useState(today);

  const [trial, setTrial] = useState<GlTrialBalanceRow[]>([]);
  const [pnl, setPnl] = useState<GlProfitAndLossRow[]>([]);
  const [bs, setBs] = useState<GlBalanceSheetRow[]>([]);

  const loadTrial = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('gl_trial_balance', { p_as_of: asOf });
    setBusy(false);
    if (error) return toast.error(error.message);
    setTrial((data || []) as GlTrialBalanceRow[]);
  }, [asOf]);

  const loadPnl = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('gl_profit_and_loss', { p_from: pnlFrom, p_to: pnlTo });
    setBusy(false);
    if (error) return toast.error(error.message);
    setPnl((data || []) as GlProfitAndLossRow[]);
  }, [pnlFrom, pnlTo]);

  const loadBs = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('gl_balance_sheet', { p_as_of: asOf });
    setBusy(false);
    if (error) return toast.error(error.message);
    setBs((data || []) as GlBalanceSheetRow[]);
  }, [asOf]);

  const trialTotals = useMemo(
    () => ({
      debit: trial.reduce((sum, row) => sum + Number(row.total_debit || 0), 0),
      credit: trial.reduce((sum, row) => sum + Number(row.total_credit || 0), 0),
    }),
    [trial]
  );

  const pnlTotals = useMemo(() => {
    const revenue = pnl.filter((r) => r.account_type === 'revenue').reduce((s, r) => s + Number(r.amount || 0), 0);
    const expense = pnl.filter((r) => r.account_type === 'expense').reduce((s, r) => s + Number(r.amount || 0), 0);
    return { revenue, expense, net: revenue - expense };
  }, [pnl]);

  const bsSections = useMemo(() => {
    const assets = bs.filter((r) => r.section === 'assets');
    const liabilities = bs.filter((r) => r.section === 'liabilities');
    const equity = bs.filter((r) => r.section === 'equity');
    const sum = (rows: GlBalanceSheetRow[]) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    return {
      assets,
      liabilities,
      equity,
      assetTotal: sum(assets),
      liabilityTotal: sum(liabilities),
      equityTotal: sum(equity),
    };
  }, [bs]);

  const downloadPnl = async () => {
    if (!pnl.length) return;
    await downloadRowsAsXlsx({
      filename: 'financial-pnl',
      sheetName: 'Profit and loss',
      columns: [
        { header: 'Code', key: 'account_code' },
        { header: 'Account', key: 'account_name' },
        { header: 'Type', key: 'account_type' },
        { header: 'Amount', key: 'amount' },
      ],
      rows: pnl.map((row) => ({
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        amount: Number(row.amount || 0),
      })),
    });
    toast.success('Excel downloaded');
  };

  const downloadBs = async () => {
    if (!bs.length) return;
    await downloadRowsAsXlsx({
      filename: 'financial-balance-sheet',
      sheetName: 'Balance sheet',
      columns: [
        { header: 'Section', key: 'section' },
        { header: 'Code', key: 'account_code' },
        { header: 'Account', key: 'account_name' },
        { header: 'Amount', key: 'amount' },
      ],
      rows: bs.map((row) => ({
        section: row.section,
        account_code: row.account_code,
        account_name: row.account_name,
        amount: Number(row.amount || 0),
      })),
    });
    toast.success('Excel downloaded');
  };

  const downloadTrial = async () => {
    if (!trial.length) return;
    await downloadRowsAsXlsx({
      filename: 'financial-trial-balance',
      sheetName: 'Trial balance',
      columns: [
        { header: 'Code', key: 'account_code' },
        { header: 'Account', key: 'account_name' },
        { header: 'Type', key: 'account_type' },
        { header: 'Debit', key: 'total_debit' },
        { header: 'Credit', key: 'total_credit' },
        { header: 'Balance', key: 'balance' },
      ],
      rows: trial.map((row) => ({
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        total_debit: Number(row.total_debit || 0),
        total_credit: Number(row.total_credit || 0),
        balance: Number(row.balance || 0),
      })),
    });
    toast.success('Excel downloaded');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Button asChild variant="ghost" className="-ml-3 mb-1">
            <Link href="/admin/reports">
              <ArrowLeft className="h-4 w-4" />
              All reports
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Financial statements</h1>
          <p className="text-sm text-muted-foreground">
            Trial balance, profit &amp; loss, and balance sheet from posted journals.{' '}
            <Link href="/admin/ledger" className="text-primary underline">
              Open ledger
            </Link>
          </p>
        </div>
      </div>

      <Tabs defaultValue="pnl">
        <TabsList>
          <TabsTrigger value="pnl">Profit &amp; loss</TabsTrigger>
          <TabsTrigger value="bs">Balance sheet</TabsTrigger>
          <TabsTrigger value="tb">Trial balance</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileBarChart className="h-4 w-4" />
                P&amp;L period
              </CardTitle>
              <CardDescription>Revenue and expense activity for posted journals in range.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input type="date" value={pnlFrom} onChange={(e) => setPnlFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input type="date" value={pnlTo} onChange={(e) => setPnlTo(e.target.value)} />
              </div>
              <Button disabled={busy} onClick={() => void loadPnl()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Run
              </Button>
              <Button variant="outline" disabled={busy || pnl.length === 0} onClick={() => void downloadPnl()}>
                <Download className="h-4 w-4" />
                Excel
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Code</th>
                    <th className="p-3">Account</th>
                    <th className="p-3">Type</th>
                    <th className="p-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pnl.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-muted-foreground">
                        Run the report to load results.
                      </td>
                    </tr>
                  ) : (
                    pnl.map((row) => (
                      <tr key={row.account_id} className="border-t">
                        <td className="p-3 font-medium">{row.account_code}</td>
                        <td className="p-3">{row.account_name}</td>
                        <td className="p-3 capitalize">{row.account_type}</td>
                        <td className="p-3 text-right">{money(row.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {pnl.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs uppercase text-muted-foreground">Revenue</p>
                  <p className="text-lg font-semibold">{money(pnlTotals.revenue)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs uppercase text-muted-foreground">Expenses</p>
                  <p className="text-lg font-semibold">{money(pnlTotals.expense)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs uppercase text-muted-foreground">Net income</p>
                  <p className="text-lg font-semibold">{money(pnlTotals.net)}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="bs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">As of date</CardTitle>
              <CardDescription>Assets, liabilities, equity plus cumulative net income plug.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label>As of</Label>
                <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              </div>
              <Button disabled={busy} onClick={() => void loadBs()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Run
              </Button>
              <Button variant="outline" disabled={busy || bs.length === 0} onClick={() => void downloadBs()}>
                <Download className="h-4 w-4" />
                Excel
              </Button>
            </CardContent>
          </Card>

          {(['assets', 'liabilities', 'equity'] as const).map((section) => {
            const rows =
              section === 'assets' ? bsSections.assets : section === 'liabilities' ? bsSections.liabilities : bsSections.equity;
            const total =
              section === 'assets'
                ? bsSections.assetTotal
                : section === 'liabilities'
                  ? bsSections.liabilityTotal
                  : bsSections.equityTotal;
            return (
              <Card key={section}>
                <CardHeader>
                  <CardTitle className="text-base capitalize">{section}</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-3">Code</th>
                        <th className="p-3">Account</th>
                        <th className="p-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-muted-foreground">
                            {bs.length === 0 ? 'Run the report to load results.' : 'No balances in this section.'}
                          </td>
                        </tr>
                      ) : (
                        rows.map((row) => (
                          <tr key={`${row.account_code}-${row.account_name}`} className="border-t">
                            <td className="p-3 font-medium">{row.account_code}</td>
                            <td className="p-3">{row.account_name}</td>
                            <td className="p-3 text-right">{money(row.amount)}</td>
                          </tr>
                        ))
                      )}
                      {rows.length > 0 && (
                        <tr className="border-t bg-secondary/30 font-semibold">
                          <td className="p-3" colSpan={2}>
                            Total {section}
                          </td>
                          <td className="p-3 text-right">{money(total)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}

          {bs.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Check: assets {money(bsSections.assetTotal)} vs liabilities + equity{' '}
              {money(bsSections.liabilityTotal + bsSections.equityTotal)}
            </p>
          )}
        </TabsContent>

        <TabsContent value="tb" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trial balance as of</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label>As of</Label>
                <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              </div>
              <Button disabled={busy} onClick={() => void loadTrial()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Run
              </Button>
              <Button variant="outline" disabled={busy || trial.length === 0} onClick={() => void downloadTrial()}>
                <Download className="h-4 w-4" />
                Excel
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Code</th>
                    <th className="p-3">Account</th>
                    <th className="p-3">Type</th>
                    <th className="p-3 text-right">Debit</th>
                    <th className="p-3 text-right">Credit</th>
                    <th className="p-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {trial.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-muted-foreground">
                        Run the report to load results.
                      </td>
                    </tr>
                  ) : (
                    trial.map((row) => (
                      <tr key={row.account_id} className="border-t">
                        <td className="p-3 font-medium">{row.account_code}</td>
                        <td className="p-3">{row.account_name}</td>
                        <td className="p-3 capitalize">{row.account_type}</td>
                        <td className="p-3 text-right">{money(row.total_debit)}</td>
                        <td className="p-3 text-right">{money(row.total_credit)}</td>
                        <td className="p-3 text-right">{money(row.balance)}</td>
                      </tr>
                    ))
                  )}
                  {trial.length > 0 && (
                    <tr className="border-t bg-secondary/30 font-semibold">
                      <td className="p-3" colSpan={3}>
                        Totals
                      </td>
                      <td className="p-3 text-right">{money(trialTotals.debit)}</td>
                      <td className="p-3 text-right">{money(trialTotals.credit)}</td>
                      <td className="p-3" />
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

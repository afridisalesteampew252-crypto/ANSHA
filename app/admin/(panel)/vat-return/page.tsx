'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import type {
  VatReturnCurrencyRollup,
  VatReturnLine,
  VatReturnPeriod,
  VatReturnSummary,
} from '@/lib/types';

const money = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

const csvEscape = (value: string | number | null | undefined) => {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
};

const quarterDefaults = () => {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const from = new Date(Date.UTC(now.getFullYear(), q * 3, 1));
  const to = new Date(Date.UTC(now.getFullYear(), q * 3 + 3, 0));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
};

export default function VatReturnPage() {
  const defaults = useMemo(() => quarterDefaults(), []);
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [summary, setSummary] = useState<VatReturnSummary | null>(null);
  const [periods, setPeriods] = useState<VatReturnPeriod[]>([]);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');

  const loadPeriods = useCallback(async () => {
    const { data, error } = await supabase
      .from('vat_return_periods')
      .select('id,period_from,period_to,label,notes,currency_focus,snapshot,created_by,created_at')
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) toast.error(error.message);
    setPeriods((data || []) as VatReturnPeriod[]);
  }, []);

  const runSummary = useCallback(async () => {
    if (!fromDate || !toDate) return toast.error('Choose a date range.');
    if (toDate < fromDate) return toast.error('End date must be on or after start date.');
    setBusy(true);
    const { data, error } = await supabase.rpc('get_vat_return_summary', {
      p_from: fromDate,
      p_to: toDate,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSummary(data as VatReturnSummary);
  }, [fromDate, toDate]);

  useEffect(() => {
    void loadPeriods();
    void runSummary();
  }, [loadPeriods, runSummary]);

  const kpis = summary?.kpis;
  const rollups: VatReturnCurrencyRollup[] = summary?.by_currency || [];
  const outputLines: VatReturnLine[] = summary?.output_lines || [];
  const inputLines: VatReturnLine[] = summary?.input_lines || [];

  const exportCsv = () => {
    if (!summary) return toast.error('Run a summary first.');
    const header = [
      'Side',
      'Source',
      'Date',
      'Reference',
      'Document type',
      'Party',
      'TRN',
      'Currency',
      'Taxable',
      'VAT',
      'Gross',
      'VAT rate',
      'Status',
    ];
    const rows = [...outputLines, ...inputLines].map((line) =>
      [
        line.side,
        line.source,
        line.doc_date,
        line.reference,
        line.document_type,
        line.party,
        line.trn || '',
        line.currency,
        line.taxable_amount,
        line.vat_amount,
        line.gross_amount,
        line.vat_rate,
        line.status || '',
      ]
        .map(csvEscape)
        .join(',')
    );
    const kpiRows = [
      '',
      'KPIs (AED focus)',
      `Output taxable,${kpis?.output_taxable ?? 0}`,
      `Output VAT,${kpis?.output_vat ?? 0}`,
      `Input taxable,${kpis?.input_taxable ?? 0}`,
      `Input VAT,${kpis?.input_vat ?? 0}`,
      `Net payable,${kpis?.net_payable ?? 0}`,
    ];
    const blob = new Blob([[header.join(','), ...rows, ...kpiRows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vat-return-${fromDate}_${toDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const savePeriod = async () => {
    if (!fromDate || !toDate) return toast.error('Choose a date range.');
    setBusy(true);
    const { error } = await supabase.rpc('save_vat_return_period', {
      p_from: fromDate,
      p_to: toDate,
      p_label: label.trim() || null,
      p_notes: notes.trim() || null,
      p_currency_focus: 'AED',
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('VAT period snapshot saved.');
    setLabel('');
    setNotes('');
    await loadPeriods();
  };

  const removePeriod = async (id: string) => {
    if (!window.confirm('Delete this saved VAT period snapshot?')) return;
    const { error } = await supabase.from('vat_return_periods').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Snapshot deleted.');
    await loadPeriods();
  };

  const loadSnapshot = (period: VatReturnPeriod) => {
    setFromDate(period.period_from);
    setToDate(period.period_to);
    if (period.snapshot && typeof period.snapshot === 'object' && 'kpis' in period.snapshot) {
      setSummary(period.snapshot as VatReturnSummary);
      toast.message('Loaded saved snapshot (re-run to refresh from live data).');
    } else {
      void runSummary();
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">VAT return pack</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          UAE-oriented output / input VAT from tax &amp; commercial invoices plus supplier invoices (reporting-first, no GL postings).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Period</CardTitle>
          <CardDescription>Defaults to the current calendar quarter. Ops only.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vat-from">From</Label>
              <Input id="vat-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vat-to">To</Label>
              <Input id="vat-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void runSummary()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Run summary
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!summary}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Output VAT (AED)</CardDescription>
            <CardTitle className="text-2xl">{money(kpis?.output_vat ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Taxable {money(kpis?.output_taxable ?? 0)} · {kpis?.output_line_count ?? 0} lines
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Input VAT (AED)</CardDescription>
            <CardTitle className="text-2xl">{money(kpis?.input_vat ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Taxable {money(kpis?.input_taxable ?? 0)} · {kpis?.input_line_count ?? 0} lines
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net payable (AED)</CardDescription>
            <CardTitle className="text-2xl">{money(kpis?.net_payable ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Output VAT − input VAT</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assumptions</CardDescription>
            <CardTitle className="text-base font-medium">
              Default {summary?.assumptions.default_vat_rate ?? 5}% · gross-inclusive purchases
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Output: tax_invoice, commercial_invoice. Input: purchase_invoice + supplier invoices. No FX.
          </CardContent>
        </Card>
      </div>

      {rollups.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">By currency</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Currency</th>
                  <th className="p-3 text-right">Output taxable</th>
                  <th className="p-3 text-right">Output VAT</th>
                  <th className="p-3 text-right">Input taxable</th>
                  <th className="p-3 text-right">Input VAT</th>
                  <th className="p-3 text-right">Net payable</th>
                </tr>
              </thead>
              <tbody>
                {rollups.map((row) => (
                  <tr key={row.currency} className="border-t">
                    <td className="p-3 font-medium">{row.currency}</td>
                    <td className="p-3 text-right">{money(row.output_taxable, row.currency)}</td>
                    <td className="p-3 text-right">{money(row.output_vat, row.currency)}</td>
                    <td className="p-3 text-right">{money(row.input_taxable, row.currency)}</td>
                    <td className="p-3 text-right">{money(row.input_vat, row.currency)}</td>
                    <td className="p-3 text-right font-medium">{money(row.net_payable, row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Output lines</CardTitle>
            <CardDescription>Customer tax / commercial invoices</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {outputLines.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No output VAT lines in this period.</p>
            ) : (
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Reference</th>
                    <th className="p-3">Party</th>
                    <th className="p-3 text-right">VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {outputLines.map((line) => (
                    <tr key={`out-${line.id}`} className="border-t">
                      <td className="p-3 whitespace-nowrap">{line.doc_date}</td>
                      <td className="p-3">
                        <div className="font-medium">{line.reference}</div>
                        <div className="text-xs capitalize text-muted-foreground">{line.document_type.replaceAll('_', ' ')}</div>
                      </td>
                      <td className="p-3">{line.party}</td>
                      <td className="p-3 text-right">{money(line.vat_amount, line.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Input lines</CardTitle>
            <CardDescription>Purchase invoices + supplier invoice files</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {inputLines.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No input VAT lines in this period.</p>
            ) : (
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Reference</th>
                    <th className="p-3">Party</th>
                    <th className="p-3 text-right">VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {inputLines.map((line) => (
                    <tr key={`in-${line.id}`} className="border-t">
                      <td className="p-3 whitespace-nowrap">{line.doc_date}</td>
                      <td className="p-3">
                        <div className="font-medium">{line.reference}</div>
                        <div className="text-xs capitalize text-muted-foreground">
                          {line.source.replaceAll('_', ' ')} · {Number(line.vat_rate)}%
                        </div>
                      </td>
                      <td className="p-3">{line.party}</td>
                      <td className="p-3 text-right">{money(line.vat_amount, line.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Save period snapshot</CardTitle>
            <CardDescription>Stores the current summary JSON for audit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="vat-label">Label</Label>
              <Input
                id="vat-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Q1 2026 draft"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vat-notes">Notes</Label>
              <Textarea id="vat-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={5000} />
            </div>
            <Button className="w-full" onClick={() => void savePeriod()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save snapshot
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Saved periods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {periods.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved snapshots yet.</p>
            ) : (
              periods.map((period) => (
                <div
                  key={period.id}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{period.label || `${period.period_from} → ${period.period_to}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {period.period_from} → {period.period_to} · saved {new Date(period.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => loadSnapshot(period)}>
                      Open
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void removePeriod(period.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

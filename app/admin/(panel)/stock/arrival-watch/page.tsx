'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Ship } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { matchesQuery } from '@/lib/matches-query';
import { loadStockOpsRows } from '@/lib/stock-ops-data';
import {
  ARRIVAL_HOLDING_LABELS,
  SHIPMENT_VIEW_STATUS_LABELS,
  STOCK_PAYMENT_STATUS_LABELS,
  arrivalHoldingReason,
  daysBetween,
  isArrivalWatchCandidate,
  type ArrivalHoldingReason,
  type StockOpsRow,
} from '@/lib/stock-ops';
import { cn } from '@/lib/utils';

type AgeBucket = 'arriving' | 'due_today' | 'd1_7' | 'd8_30' | 'd31_90' | 'd90_plus';

function ageBucket(eta: string | null, now = new Date()): AgeBucket | null {
  if (!eta) return null;
  const d = new Date(eta);
  if (Number.isNaN(d.getTime())) return null;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const etaDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((etaDay.getTime() - startToday.getTime()) / 86_400_000);
  if (diff > 0 && diff <= 7) return 'arriving';
  if (diff === 0) return 'due_today';
  if (diff < 0 && diff >= -7) return 'd1_7';
  if (diff < -7 && diff >= -30) return 'd8_30';
  if (diff < -30 && diff >= -90) return 'd31_90';
  if (diff < -90) return 'd90_plus';
  return 'arriving';
}

const AGE_COLS: { key: AgeBucket; label: string }[] = [
  { key: 'arriving', label: 'Arriving (7d)' },
  { key: 'due_today', label: 'Due today' },
  { key: 'd1_7', label: 'Overdue 1–7' },
  { key: 'd8_30', label: 'Overdue 8–30' },
  { key: 'd31_90', label: 'Overdue 31–90' },
  { key: 'd90_plus', label: 'Overdue 90+' },
];

const HOLDING_REASONS: ArrivalHoldingReason[] = ['release_pending', 'payment_pending', 'delivered_unpaid'];

export default function ArrivalWatchPage() {
  const [rows, setRows] = useState<StockOpsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [holding, setHolding] = useState<'all' | ArrivalHoldingReason>('all');
  const [age, setAge] = useState<'all' | AgeBucket>('all');
  const [etaFrom, setEtaFrom] = useState('');
  const [etaTo, setEtaTo] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { rows: data, error } = await loadStockOpsRows(1000);
    if (error) toast.error(error);
    setRows(data.filter((row) => isArrivalWatchCandidate(row)));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enriched = useMemo(
    () =>
      rows.map((row) => {
        const reason = arrivalHoldingReason(row);
        const eta = row.eta || row.reservation_eta;
        return {
          ...row,
          reason,
          eta,
          age: ageBucket(eta),
          lateDays: daysBetween(eta),
        };
      }).filter((row) => row.reason != null),
    [rows]
  );

  const matrix = useMemo(() => {
    const grid: Record<ArrivalHoldingReason, Record<AgeBucket, number>> = {
      release_pending: { arriving: 0, due_today: 0, d1_7: 0, d8_30: 0, d31_90: 0, d90_plus: 0 },
      payment_pending: { arriving: 0, due_today: 0, d1_7: 0, d8_30: 0, d31_90: 0, d90_plus: 0 },
      delivered_unpaid: { arriving: 0, due_today: 0, d1_7: 0, d8_30: 0, d31_90: 0, d90_plus: 0 },
    };
    for (const row of enriched) {
      if (!row.reason || !row.age) continue;
      grid[row.reason][row.age] += 1;
    }
    return grid;
  }, [enriched]);

  const paidStillOpen = enriched.filter((r) => r.stock_payment === 'paid').length;

  const filtered = useMemo(() => {
    return enriched.filter((row) => {
      if (holding !== 'all' && row.reason !== holding) return false;
      if (age !== 'all' && row.age !== age) return false;
      if (etaFrom && (!row.eta || row.eta < etaFrom)) return false;
      if (etaTo && (!row.eta || row.eta > etaTo)) return false;
      return matchesQuery(q, [
        row.stock_number,
        row.chassis_number,
        row.title,
        row.customer_name,
        row.bl_number,
        row.vessel_name,
        row.agent_name,
        row.destination_country,
      ]);
    });
  }, [age, enriched, etaFrom, etaTo, holding, q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <Button asChild variant="ghost" className="-ml-3 mb-1">
            <Link href="/admin/stock">
              <ArrowLeft className="h-4 w-4" />
              Stock management
            </Link>
          </Button>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Stock operations</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight">
            <Ship className="h-6 w-6" />
            Arrival Watch
          </h1>
          <p className="text-sm text-muted-foreground">
            Open units near/past ETA that are not yet PAID + DELIVERED. Done = paid and delivered.
          </p>
        </div>
        <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-right dark:bg-red-950/30">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-700">Paid ETA, still open</p>
          <p className="text-3xl font-black tabular-nums text-red-800">{paidStillOpen}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Holding reasons × age</CardTitle>
              <CardDescription>Click a cell conceptually via filters below.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Holding reason</th>
                    {AGE_COLS.map((col) => (
                      <th key={col.key} className="px-2 py-2 text-center">{col.label}</th>
                    ))}
                    <th className="px-2 py-2 text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {HOLDING_REASONS.map((reason) => {
                    const total = AGE_COLS.reduce((sum, col) => sum + matrix[reason][col.key], 0);
                    return (
                      <tr key={reason} className="border-b last:border-0">
                        <td className="py-2.5 pr-3 font-semibold">
                          <button type="button" className="hover:underline" onClick={() => setHolding(reason)}>
                            {ARRIVAL_HOLDING_LABELS[reason]}
                          </button>
                        </td>
                        {AGE_COLS.map((col) => (
                          <td key={col.key} className="px-2 py-2 text-center tabular-nums">
                            <button
                              type="button"
                              className={cn(
                                'min-w-[2.5rem] rounded px-1.5 py-0.5 font-semibold',
                                matrix[reason][col.key] > 0 && (col.key.startsWith('d') || col.key === 'due_today')
                                  ? 'bg-red-50 text-red-700'
                                  : 'hover:bg-secondary'
                              )}
                              onClick={() => {
                                setHolding(reason);
                                setAge(col.key);
                              }}
                            >
                              {matrix[reason][col.key]}
                            </button>
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center font-bold tabular-nums">{total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">Filters</CardTitle>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1">
                  <Label>ETA from</Label>
                  <Input type="date" value={etaFrom} onChange={(e) => setEtaFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>ETA to</Label>
                  <Input type="date" value={etaTo} onChange={(e) => setEtaTo(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Holding reason</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={holding} onChange={(e) => setHolding(e.target.value as 'all' | ArrivalHoldingReason)}>
                    <option value="all">All</option>
                    {HOLDING_REASONS.map((r) => (
                      <option key={r} value={r}>{ARRIVAL_HOLDING_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Age</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={age} onChange={(e) => setAge(e.target.value as 'all' | AgeBucket)}>
                    <option value="all">All</option>
                    {AGE_COLS.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Search</Label>
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Stock, chassis, customer, BL…" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No open arrivals match.</p>
              ) : (
                filtered.map((row) => {
                  const late = row.lateDays != null && row.eta && new Date(row.eta) < new Date();
                  return (
                    <div key={row.id} className="grid gap-2 rounded-lg border p-3 text-sm lg:grid-cols-[8rem_minmax(8rem,1fr)_5rem_6rem_8rem_7rem_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)]">
                      <div>
                        <Link href={`/admin/vehicles/${row.id}`} className="font-bold text-primary hover:underline">
                          {row.stock_number || row.id.slice(0, 8)}
                        </Link>
                        <p className="font-mono text-[11px] text-muted-foreground">{row.chassis_number || '—'}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{row.make} {row.model}</p>
                        <p className="text-xs text-muted-foreground">{row.title}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">ETA</p>
                        <p className="font-medium">{row.eta || '—'}</p>
                      </div>
                      <div>
                        <p className={cn('font-bold', late ? 'text-red-600' : 'text-muted-foreground')}>
                          {late && row.lateDays != null ? `${row.lateDays}d late` : row.lateDays != null ? `${row.lateDays}d` : '—'}
                        </p>
                      </div>
                      <div>
                        {row.reason ? (
                          <Badge
                            className={cn(
                              row.reason === 'release_pending' && 'bg-red-100 text-red-800',
                              row.reason === 'payment_pending' && 'bg-amber-100 text-amber-900',
                              row.reason === 'delivered_unpaid' && 'bg-sky-100 text-sky-900'
                            )}
                          >
                            {ARRIVAL_HOLDING_LABELS[row.reason]}
                          </Badge>
                        ) : null}
                        <p className="mt-1 text-[11px]">
                          Surrender: {row.has_surrendered ? <span className="font-semibold text-emerald-700">On file</span> : <span className="font-semibold text-red-600">Missing</span>}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Badge variant="outline">{STOCK_PAYMENT_STATUS_LABELS[row.stock_payment]}</Badge>
                        <Badge variant="secondary">{SHIPMENT_VIEW_STATUS_LABELS[row.shipment_view]}</Badge>
                      </div>
                      <div>
                        <p className={cn('font-semibold', (row.invoice_balance || 0) > 0 && 'text-red-600')}>
                          {row.invoice_balance != null
                            ? new Intl.NumberFormat('en', { style: 'currency', currency: row.invoice_currency || 'USD', maximumFractionDigits: 0 }).format(row.invoice_balance)
                            : '—'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{row.customer_name || '—'}</p>
                      </div>
                      <div className="text-xs">
                        <p className="font-medium">{row.agent_name || '—'}</p>
                        <p className="uppercase">{row.destination_country || '—'}</p>
                      </div>
                      <div className="text-xs">
                        <p className="truncate">{row.vessel_name || '—'}</p>
                        <p className="font-mono">{row.bl_number ? `BL ${row.bl_number}` : '—'}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

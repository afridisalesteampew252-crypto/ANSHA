'use client';

import { useMemo } from 'react';
import { AlertTriangle, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  SUMMARY_COLUMN_META,
  avgDays,
  summaryBucket,
  type StockOpsRow,
  type SummaryBucketKey,
} from '@/lib/stock-ops';
import { cn } from '@/lib/utils';

const THEME = {
  overall: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100',
  orange: 'border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-100',
  blue: 'border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
  purple: 'border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100',
};

const BAR = {
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  purple: 'bg-violet-500',
};

type Props = {
  rows: StockOpsRow[];
  onFilterBucket?: (shipment: 'available' | 'booked' | 'shipped' | 'delivered', payment?: string) => void;
};

export function StockInventorySummary({ rows, onFilterBucket }: Props) {
  const total = rows.length;

  const byShipment = useMemo(() => {
    const available = rows.filter((r) => r.shipment_view === 'not_booked').length;
    const booked = rows.filter((r) => r.shipment_view === 'booked').length;
    const shipped = rows.filter((r) => r.shipment_view === 'shipped').length;
    const delivered = rows.filter((r) => r.shipment_view === 'delivered').length;
    return { available, booked, shipped, delivered };
  }, [rows]);

  const buckets = useMemo(() => {
    const map = new Map<SummaryBucketKey, StockOpsRow[]>();
    for (const row of rows) {
      const key = summaryBucket(row);
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [rows]);

  const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : '0.0');

  const shippedUnpaid = rows.filter(
    (r) => r.shipment_view === 'shipped' && r.stock_payment !== 'paid'
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          className={THEME.overall}
          label="Overall total"
          value={total}
          hint="Grand total inventory count"
        />
        <SummaryCard
          className={THEME.orange}
          label="Available status"
          value={byShipment.available}
          hint={`${pct(byShipment.available, total)}% of total`}
          onClick={() => onFilterBucket?.('available')}
        />
        <SummaryCard
          className={THEME.blue}
          label="Booked status"
          value={byShipment.booked}
          hint={`${pct(byShipment.booked, total)}% of total`}
          onClick={() => onFilterBucket?.('booked')}
        />
        <SummaryCard
          className={THEME.green}
          label="Shipped status"
          value={byShipment.shipped}
          hint={`${pct(byShipment.shipped, total)}% of total`}
          onClick={() => onFilterBucket?.('shipped')}
        />
        <SummaryCard
          className={THEME.purple}
          label="Delivered status"
          value={byShipment.delivered}
          hint={`${pct(byShipment.delivered, total)}% of total`}
          onClick={() => onFilterBucket?.('delivered')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(SUMMARY_COLUMN_META) as Array<keyof typeof SUMMARY_COLUMN_META>).map((colKey) => {
          const meta = SUMMARY_COLUMN_META[colKey];
          const colTotal =
            colKey === 'available'
              ? byShipment.available
              : colKey === 'booked'
                ? byShipment.booked
                : colKey === 'shipped'
                  ? byShipment.shipped
                  : byShipment.delivered;

          return (
            <Card key={colKey} className={cn('overflow-hidden border-2', THEME[meta.color])}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold uppercase tracking-wide">{meta.title}</CardTitle>
                <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">{meta.action}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {meta.keys.map((key) => {
                  const list = buckets.get(key) || [];
                  const count = list.length;
                  const avg = avgDays(list.map((r) => r.aging_days));
                  const share = colTotal ? Math.round((count / colTotal) * 100) : 0;
                  const label = meta.labels[key] || key;
                  const warn = key.includes('unpaid') || key.includes('partial') || key.includes('reserved_');
                  return (
                    <button
                      key={key}
                      type="button"
                      className="w-full rounded-md border border-black/5 bg-white/60 p-2.5 text-left dark:bg-black/20"
                      onClick={() => onFilterBucket?.(colKey)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold">{label}</p>
                          <p className={cn('mt-0.5 text-[11px]', warn ? 'font-semibold text-red-600' : 'text-muted-foreground')}>
                            Avg {avg ?? '—'} {meta.agingHint}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black tabular-nums">{count}</p>
                          <p className="text-[10px] text-muted-foreground">{share}%</p>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                        <div className={cn('h-full rounded-full', BAR[meta.color])} style={{ width: `${share}%` }} />
                      </div>
                    </button>
                  );
                })}
                {colKey === 'shipped' && shippedUnpaid > 0 ? (
                  <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {shippedUnpaid} shipped without full payment
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  className,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border-2 p-4 text-left transition hover:shadow-sm',
        className,
        onClick && 'cursor-pointer'
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">
        <Package className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-2 text-3xl font-black tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs opacity-70">{hint}</p>
    </button>
  );
}

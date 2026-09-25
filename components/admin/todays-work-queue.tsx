'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Inbox, Loader2, ReceiptText, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type QueueSummary = {
  overdue_requests: number;
  due_today_requests: number;
  unassigned_requests: number;
  new_inquiries: number;
  overdue_invoices: number;
  total_items: number;
};

type QueueItem = {
  kind: string;
  record_id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  priority: 'critical' | 'high' | 'normal';
  due_at: string | null;
  href: string;
};

type QueueResponse = { summary?: Partial<QueueSummary>; items?: QueueItem[] };

const emptySummary: QueueSummary = {
  overdue_requests: 0,
  due_today_requests: 0,
  unassigned_requests: 0,
  new_inquiries: 0,
  overdue_invoices: 0,
  total_items: 0,
};

function itemLabel(kind: string) {
  if (kind === 'overdue_invoice') return 'Overdue invoice';
  if (kind === 'new_inquiry') return 'New inquiry';
  if (kind === 'overdue_request') return 'Overdue request';
  if (kind === 'due_today_request') return 'Due today';
  return 'Unassigned request';
}

function itemIcon(kind: string) {
  if (kind === 'overdue_invoice') return ReceiptText;
  if (kind === 'new_inquiry') return Inbox;
  if (kind === 'unassigned_request') return UserRound;
  return CalendarClock;
}

function dueLabel(value: string | null) {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function TodaysWorkQueue() {
  const [summary, setSummary] = useState(emptySummary);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: queueError } = await supabase.rpc('get_today_work_queue', { p_limit: 12 });
      if (!active) return;
      if (queueError) {
        setError('Work queue is temporarily unavailable.');
        setLoading(false);
        return;
      }
      const response = (data || {}) as QueueResponse;
      setSummary({ ...emptySummary, ...(response.summary || {}) });
      setItems(Array.isArray(response.items) ? response.items : []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5 text-accent" />Today’s Work Queue</CardTitle>
          <CardDescription>Prioritized work that needs an owner or action today.</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/admin/requests">Open requests <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { label: 'Overdue', value: summary.overdue_requests + summary.overdue_invoices, tone: 'text-destructive' },
            { label: 'Due today', value: summary.due_today_requests, tone: 'text-amber-700 dark:text-amber-300' },
            { label: 'Unassigned', value: summary.unassigned_requests, tone: 'text-primary' },
            { label: 'New inquiries', value: summary.new_inquiries, tone: 'text-accent' },
            { label: 'Total items', value: summary.total_items, tone: 'text-foreground' },
          ].map((metric) => (
            <div key={metric.label} className="rounded-lg border border-border/70 bg-secondary/25 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
              <p className={cn('mt-1 text-xl font-black tracking-tight', metric.tone)}>{loading ? '—' : metric.value}</p>
            </div>
          ))}
        </div>

        {error ? <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}
        {loading ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading queue…</div> : null}
        {!loading && !error && items.length === 0 ? <div className="rounded-lg border border-dashed border-border/80 px-4 py-8 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-2 text-sm font-semibold">Nothing urgent is waiting.</p><p className="mt-1 text-xs text-muted-foreground">The queue will surface new work as it arrives.</p></div> : null}
        {!loading && !error && items.length > 0 ? (
          <div className="divide-y divide-border/70 rounded-lg border border-border/70">
            {items.map((item) => {
              const Icon = itemIcon(item.kind);
              return (
                <Link key={`${item.kind}-${item.record_id}`} href={item.href} className="group flex items-center gap-3 p-3 transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none sm:p-4">
                  <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', item.priority === 'critical' ? 'bg-destructive/10 text-destructive' : item.priority === 'high' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-accent/10 text-accent')}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold">{item.title}</span><Badge variant="outline" className="text-[10px]">{itemLabel(item.kind)}</Badge></span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.subtitle || 'No additional details'}</span>
                  </span>
                  <span className="hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block"><span className="block font-medium">{item.kind === 'new_inquiry' ? 'Received' : 'Due'}</span>{dueLabel(item.due_at)}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Inbox, Loader2, MessageCircle, PackageCheck, ReceiptText, RefreshCw, Ship, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { workQueueLabel } from '@/lib/work-queue';

type QueueSummary = {
  overdue_requests: number;
  due_today_requests: number;
  unassigned_requests: number;
  new_inquiries: number;
  overdue_invoices: number;
  new_requests: number;
  payment_proofs: number;
  unknown_tt: number;
  invoice_issues: number;
  reservations: number;
  shipment_followups: number;
  support_replies: number;
  failed_tasks: number;
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
  new_requests: 0,
  payment_proofs: 0,
  unknown_tt: 0,
  invoice_issues: 0,
  reservations: 0,
  shipment_followups: 0,
  support_replies: 0,
  failed_tasks: 0,
  total_items: 0,
};

function itemIcon(kind: string) {
  if (['overdue_invoice', 'invoice_issue', 'payment_proof', 'unknown_tt'].includes(kind)) return ReceiptText;
  if (['new_inquiry', 'new_request', 'part_request'].includes(kind)) return Inbox;
  if (kind === 'reservation') return PackageCheck;
  if (kind === 'support_message') return MessageCircle;
  if (kind === 'shipment_followup') return Ship;
  if (kind.startsWith('failed_')) return AlertCircle;
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
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(false);
  const lastLoadedAt = useRef(0);
  const epoch = useRef(0);

  const load = useCallback(async (maxAgeMs = 0) => {
    if (!active.current || inFlight.current || (maxAgeMs && Date.now() - lastLoadedAt.current < maxAgeMs)) return;
    inFlight.current = true;
    const requestEpoch = epoch.current;
    setRefreshing(true);
    try {
      const { data, error: queueError } = await supabase.rpc('get_today_work_queue', { p_limit: 20 });
      if (!active.current || requestEpoch !== epoch.current) return;
      if (queueError) throw queueError;
      const response = (data || {}) as QueueResponse;
      setSummary({ ...emptySummary, ...(response.summary || {}) });
      setItems(Array.isArray(response.items) ? response.items : []);
      setError('');
      lastLoadedAt.current = Date.now();
    } catch {
      if (active.current && requestEpoch === epoch.current) setError('Work queue is temporarily unavailable.');
    } finally {
      if (requestEpoch === epoch.current) {
        inFlight.current = false;
        if (active.current) { setLoading(false); setRefreshing(false); }
      }
    }
  }, []);

  useEffect(() => {
    active.current = true;
    let debounce: number | undefined;
    const scheduleLoad = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void load(), 500);
    };
    const channel = supabase.channel('today-work-queue');
    for (const table of ['workspace_requests', 'inquiries', 'part_requests', 'invoices', 'customer_payment_proofs', 'remittances', 'vehicles', 'parts', 'export_shipments', 'support_threads', 'support_messages', 'import_jobs', 'outbound_email_log']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleLoad);
    }
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') scheduleLoad(); });
    const onVisible = () => { if (!document.hidden) void load(60_000); };
    const timer = window.setInterval(() => { if (!document.hidden) void load(295_000); }, 300_000);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_OUT' && event !== 'SIGNED_IN') return;
      epoch.current += 1;
      inFlight.current = false;
      lastLoadedAt.current = 0;
      setItems([]);
      setSummary(emptySummary);
      setError('');
      setLoading(Boolean(session));
      setRefreshing(false);
      if (session) scheduleLoad();
    });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('ansha:notification', scheduleLoad);
    void load();
    return () => {
      active.current = false;
      epoch.current += 1;
      inFlight.current = false;
      window.clearTimeout(debounce);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('ansha:notification', scheduleLoad);
      subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [load]);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5 text-accent" />Today’s Work Queue</CardTitle>
          <CardDescription>Prioritized work that needs an owner or action today.</CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={refreshing} onClick={() => void load()}><RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />Refresh</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Requests', value: summary.new_requests + summary.overdue_requests + summary.due_today_requests + summary.unassigned_requests, tone: 'text-primary' },
            { label: 'TT review', value: summary.payment_proofs + summary.unknown_tt, tone: 'text-amber-700 dark:text-amber-300' },
            { label: 'Invoice issues', value: summary.invoice_issues, tone: 'text-destructive' },
            { label: 'Stock & shipment', value: summary.reservations + summary.shipment_followups, tone: 'text-accent' },
            { label: 'Support & failures', value: summary.support_replies + summary.failed_tasks, tone: 'text-primary' },
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
                    <span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold">{item.title}</span><Badge variant="outline" className="text-[10px]">{workQueueLabel(item.kind)}</Badge></span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.subtitle || 'No additional details'}</span>
                  </span>
                  <span className="hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block"><span className="block font-medium">{['new_inquiry', 'part_request', 'payment_proof', 'unknown_tt', 'support_message', 'failed_import', 'failed_email'].includes(item.kind) ? 'Received' : 'Due'}</span>{dueLabel(item.due_at)}</span>
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

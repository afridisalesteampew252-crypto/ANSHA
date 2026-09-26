'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, CalendarDays, CheckCircle2, ClipboardList, FileText, Loader2, PackageCheck, ReceiptText, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type LifecycleSummary = {
  events: number;
  invoices: number;
  payments: number;
  requests: number;
  active_reservations: number;
};

type LifecycleEvent = {
  event_type: string;
  record_id: string;
  occurred_at: string | null;
  title: string;
  subtitle: string | null;
  status: string | null;
  href: string;
};

type LifecycleResponse = { summary?: Partial<LifecycleSummary>; events?: LifecycleEvent[] };

const emptySummary: LifecycleSummary = { events: 0, invoices: 0, payments: 0, requests: 0, active_reservations: 0 };

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    customer_created: 'Account',
    inquiry_request: 'Inquiry request',
    workspace_request: 'Work request',
    reservation_proforma: 'Reservation proforma',
    invoice: 'Invoice',
    remittance: 'Remittance',
    invoice_payment: 'Payment',
    payment_proof: 'Payment proof',
    active_reservation: 'Active reservation',
  };
  return labels[type] || 'Lifecycle event';
}

function EventIcon({ type }: { type: string }) {
  const Icon = type === 'customer_created' ? UserRound
    : type.includes('request') ? ClipboardList
      : type.includes('reservation') ? PackageCheck
        : type.includes('payment') || type === 'remittance' ? Banknote
          : type === 'payment_proof' ? ReceiptText
            : type === 'invoice' || type === 'reservation_proforma' ? FileText
              : CalendarDays;
  return <Icon className="h-4 w-4" aria-hidden />;
}

function eventDate(value: string | null) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function CustomerLifecycleTimeline({ customerId }: { customerId: string }) {
  const [summary, setSummary] = useState(emptySummary);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: timelineError } = await supabase.rpc('get_customer_lifecycle_timeline', {
        p_customer_id: customerId,
        p_limit: 50,
      });
      if (!active) return;
      if (timelineError) {
        setError('Lifecycle history is temporarily unavailable.');
        setLoading(false);
        return;
      }
      const response = (data || {}) as LifecycleResponse;
      setSummary({ ...emptySummary, ...(response.summary || {}) });
      setEvents(Array.isArray(response.events) ? response.events : []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [customerId]);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-accent" />Customer lifecycle</CardTitle>
          <CardDescription>One chronological view of requests, reservations, invoices, and payments.</CardDescription>
        </div>
        <Badge variant="outline" className="w-fit">{loading ? 'Loading…' : `${summary.events} events`}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ['Requests', summary.requests],
            ['Invoices', summary.invoices],
            ['Payments', summary.payments],
            ['Reservations', summary.active_reservations],
            ['Events', summary.events],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/70 bg-secondary/25 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-black tracking-tight">{loading ? '—' : value}</p>
            </div>
          ))}
        </div>
        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        {loading ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading lifecycle…</div> : null}
        {!loading && !error && events.length === 0 ? <div className="rounded-lg border border-dashed border-border/80 px-4 py-8 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-2 text-sm font-semibold">No lifecycle events yet.</p><p className="mt-1 text-xs text-muted-foreground">New customer activity will appear here.</p></div> : null}
        {!loading && !error && events.length > 0 ? (
          <div className="relative space-y-0 pl-1">
            <div className="absolute bottom-5 left-[1.05rem] top-5 w-px bg-border" aria-hidden />
            {events.map((event) => (
              <Link key={`${event.event_type}-${event.record_id}`} href={event.href} className="group relative flex gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-secondary/35 focus-visible:bg-secondary/35 focus-visible:outline-none sm:gap-4 sm:px-2">
                <span className={cn('relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-4 border-card', event.status === 'overdue' || event.status === 'rejected' ? 'bg-destructive/15 text-destructive' : event.event_type === 'active_reservation' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-accent/10 text-accent')}><EventIcon type={event.event_type} /></span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold">{event.title}</span><Badge variant="outline" className="text-[10px]">{eventLabel(event.event_type)}</Badge></span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{event.subtitle || 'No additional details'}</span>
                </span>
                <span className="hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block">{eventDate(event.occurred_at)}</span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        ) : null}
        {!loading && events.length >= 50 ? <Button asChild variant="ghost" size="sm" className="w-full"><Link href="#soa">Timeline capped at 50 events · review the SOA below <ArrowRight className="h-3.5 w-3.5" /></Link></Button> : null}
      </CardContent>
    </Card>
  );
}

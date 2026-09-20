'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Check,
  ExternalLink,
  Headphones,
  Loader2,
  Maximize2,
  MessageSquare,
  RefreshCw,
  Ticket,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { TawkChatSession, TawkTicketEvent } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DEFAULT_DASHBOARD_URL = 'https://dashboard.tawk.to';
const POLL_MS = 20_000;

function resolveDashboardUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_TAWK_DASHBOARD_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return DEFAULT_DASHBOARD_URL;
}

function openPopup(url: string) {
  const width = Math.min(1280, Math.max(960, Math.round(window.screen.availWidth * 0.72)));
  const height = Math.min(900, Math.max(720, Math.round(window.screen.availHeight * 0.82)));
  const left = Math.round((window.screen.availWidth - width) / 2);
  const top = Math.round((window.screen.availHeight - height) / 2);
  window.open(
    url,
    'ansha-tawk-inbox',
    `popup=yes,noopener,noreferrer,width=${width},height=${height},left=${left},top=${top}`
  );
}

function visitorLabel(session: TawkChatSession) {
  return session.visitor_name || session.visitor_email || 'Website visitor';
}

function locationLabel(session: TawkChatSession) {
  const parts = [session.visitor_city, session.visitor_country].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Admin + manager Live chat surface: webhook “Needs attention” list + Tawk open shortcuts.
 * Reply always happens in the Tawk dashboard (iframe is blocked by Tawk).
 */
export function AdminTawkInbox() {
  const dashboardUrl = resolveDashboardUrl();
  const [sessions, setSessions] = useState<TawkChatSession[]>([]);
  const [tickets, setTickets] = useState<TawkTicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [sessionRes, ticketRes] = await Promise.all([
      supabase
        .from('tawk_chat_sessions')
        .select('*')
        .eq('status', 'open')
        .is('dismissed_at', null)
        .order('last_event_at', { ascending: false })
        .limit(50),
      supabase
        .from('tawk_ticket_events')
        .select('*')
        .is('dismissed_at', null)
        .order('event_time', { ascending: false })
        .limit(30),
    ]);

    if (sessionRes.error || ticketRes.error) {
      setError(sessionRes.error?.message || ticketRes.error?.message || 'Failed to load live chat.');
    } else {
      setSessions((sessionRes.data || []) as TawkChatSession[]);
      setTickets((ticketRes.data || []) as TawkTicketEvent[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const openCount = useMemo(() => sessions.length + tickets.length, [sessions.length, tickets.length]);

  const dismissSession = async (id: string) => {
    setDismissing(`session:${id}`);
    const now = new Date().toISOString();
    setSessions((current) => current.filter((row) => row.id !== id));
    const { error: updateError } = await supabase
      .from('tawk_chat_sessions')
      .update({ dismissed_at: now, updated_at: now })
      .eq('id', id);
    if (updateError) {
      setError(updateError.message);
      void load();
    }
    setDismissing(null);
  };

  const dismissTicket = async (id: string) => {
    setDismissing(`ticket:${id}`);
    setTickets((current) => current.filter((row) => row.id !== id));
    const { error: updateError } = await supabase
      .from('tawk_ticket_events')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      setError(updateError.message);
      void load();
    }
    setDismissing(null);
  };

  return (
    <div className="-m-4 flex h-[calc(100dvh-7.5rem)] min-h-[560px] flex-col overflow-hidden border-y border-border/80 bg-background md:-m-8 md:h-[calc(100dvh-4.75rem)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/80 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
            <Headphones className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">Website live chat</p>
              {openCount > 0 ? (
                <Badge variant="secondary" className="rounded-md px-1.5 py-0 text-[11px]">
                  {openCount} open
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Needs attention from the public site. Reply in the Tawk agent inbox — dismiss here when handled.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => openPopup(dashboardUrl)}>
            <Maximize2 className="h-4 w-4" />
            Open popup
          </Button>
          <Button type="button" size="sm" asChild>
            <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open Tawk inbox
            </a>
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border/80 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight">Needs attention</h2>
          <p className="text-xs text-muted-foreground">
            Open chats and new tickets mirrored from Tawk webhooks. Dismiss only clears ANSHA — it does not end the chat in Tawk.
          </p>
        </div>

        {error ? (
          <div className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:mx-5">
            {error}
          </div>
        ) : null}

        {loading && sessions.length === 0 && tickets.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Loading live chats…
          </div>
        ) : openCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Nothing needs attention</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                New visitor chats and tickets appear here automatically. Use Open Tawk inbox when you need to reply.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {sessions.map((session) => {
              const place = locationLabel(session);
              return (
                <li key={`chat-${session.id}`} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
                    <MessageSquare className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{visitorLabel(session)}</p>
                      <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide">
                        Chat
                      </Badge>
                    </div>
                    {session.visitor_email ? (
                      <p className="truncate text-xs text-muted-foreground">{session.visitor_email}</p>
                    ) : null}
                    {place || session.domain ? (
                      <p className="text-xs text-muted-foreground">
                        {[place, session.domain].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    {session.first_message ? (
                      <p className="line-clamp-2 text-sm text-foreground/90">{session.first_message}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Visitor started a chat</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(session.last_event_at || session.started_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                    <Button type="button" size="sm" asChild>
                      <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Reply in Tawk
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={dismissing === `session:${session.id}`}
                      onClick={() => void dismissSession(session.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Dismiss
                    </Button>
                  </div>
                </li>
              );
            })}

            {tickets.map((ticket) => (
              <li key={`ticket-${ticket.id}`} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Ticket className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      {ticket.subject || (ticket.human_id != null ? `Ticket #${ticket.human_id}` : 'New ticket')}
                    </p>
                    <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide">
                      Ticket
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[ticket.requester_name, ticket.requester_email].filter(Boolean).join(' · ') || 'Requester unknown'}
                  </p>
                  {ticket.message_preview ? (
                    <p className="line-clamp-2 text-sm text-foreground/90">{ticket.message_preview}</p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(ticket.event_time), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                  <Button type="button" size="sm" asChild>
                    <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in Tawk
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={dismissing === `ticket:${ticket.id}`}
                    onClick={() => void dismissTicket(ticket.id)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

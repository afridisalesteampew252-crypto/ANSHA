'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase/client';

type SupportReply = { id: string; thread_id: string; body: string | null; created_at: string };

export function PortalSupportNotificationBell() {
  const [userId, setUserId] = useState('');
  const [replies, setReplies] = useState<SupportReply[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data: threads, error: threadError } = await supabase
      .from('support_threads')
      .select('id')
      .eq('customer_profile_id', userId);
    if (threadError || !threads?.length) {
      setReplies([]);
      setUnread(0);
      return;
    }
    const { data, count, error } = await supabase
      .from('support_messages')
      .select('id,thread_id,body,created_at', { count: 'exact' })
      .in('thread_id', threads.map((thread) => thread.id))
      .eq('sender_kind', 'agent')
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) return;
    setReplies((data || []) as SupportReply[]);
    setUnread(count || 0);
  }, [userId]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id || ''));
  }, []);

  useEffect(() => {
    if (!userId) return;
    void load();
    const channel = supabase.channel(`portal-support-notifications-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, () => void load())
      .subscribe();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      void supabase.removeChannel(channel);
    };
  }, [load, userId]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-9 w-9 shrink-0 rounded-lg p-0 sm:w-auto sm:gap-2 sm:px-3" aria-label={unread ? `${unread} unread support replies` : 'Support notifications'}>
          <Bell className="h-4 w-4" />
          <span className="hidden text-xs font-medium sm:inline">Alerts</span>
          {unread > 0 ? (
            <>
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[9px] font-bold text-destructive-foreground sm:hidden">
                {unread > 99 ? '99+' : unread}
              </span>
              <span className="ml-1 hidden h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground sm:inline-flex">
                {unread > 99 ? '99+' : unread}
              </span>
            </>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,22rem)] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <DropdownMenuLabel className="p-0">Support replies</DropdownMenuLabel>
          {unread > 0 ? <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">{unread} new</span> : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[min(65vh,28rem)] overflow-y-auto">
          {replies.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No unread support replies.</p>
          ) : replies.map((reply) => (
            <Link key={reply.id} href="/portal/support" className="flex gap-3 border-b px-4 py-3 transition-colors hover:bg-accent">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><MessageCircle className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">New reply from ANSHA Support</span>
                <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{reply.body || 'Your support team sent a reply.'}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}</span>
              </span>
            </Link>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

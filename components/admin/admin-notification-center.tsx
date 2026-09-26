'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Bell, CalendarClock, CheckCheck, CircleAlert, Inbox, Mail, MessageCircle, PackageSearch, ReceiptText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type Notification = {
  id: string;
  recipient_id: string;
  notification_type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

const iconByType = {
  chat_message: MessageCircle,
  internal_mail: Mail,
  inquiry: Inbox,
  part_request: PackageSearch,
  invoice: ReceiptText,
  remittance: ReceiptText,
  system: CircleAlert,
  request_due: CalendarClock,
} as const;

export function AdminNotificationCenter({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const instanceId = useId().replace(/[^a-zA-Z0-9-]/g, '');

  const load = useCallback(async () => {
    const [list, count] = await Promise.all([
      supabase.from('admin_notifications')
        .select('id,recipient_id,notification_type,title,body,href,read_at,created_at')
        .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(30),
      supabase.from('admin_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId).is('read_at', null),
    ]);
    if (list.error || count.error) {
      toast.error('Notifications could not be loaded.');
      return;
    }
    setItems((list.data || []) as Notification[]);
    setUnread(count.count || 0);
  }, [userId]);

  useEffect(() => {
    void load();
    // The header renders separate mobile and desktop bells. Each needs its own channel.
    const channel = supabase.channel(`admin-notifications-${userId}-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_notifications', filter: `recipient_id=eq.${userId}` }, () => void load())
      .subscribe();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      void supabase.removeChannel(channel);
    };
  }, [load, userId, instanceId]);

  const markRead = async (id: string) => {
    const { error } = await supabase.from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id).eq('recipient_id', userId).is('read_at', null);
    if (error) { toast.error('Could not mark notification as read.'); return; }
    await load();
  };

  const markAllRead = async () => {
    const { error } = await supabase.from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId).is('read_at', null);
    if (error) { toast.error('Could not mark notifications as read.'); return; }
    await load();
  };

  return <DropdownMenu open={open} onOpenChange={(value) => { setOpen(value); if (value) void load(); }}>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="relative" aria-label={`${unread} unread notifications`}>
        <Bell className="h-5 w-5" />
        {unread > 0 ? <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">{unread > 99 ? '99+' : unread}</span> : null}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-[min(92vw,24rem)] p-0">
      <div className="flex items-center justify-between px-4 py-3">
        <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
        {unread > 0 ? <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void markAllRead()}><CheckCheck className="h-3.5 w-3.5" />Mark all read</Button> : null}
      </div>
      <DropdownMenuSeparator className="m-0" />
      <div className="max-h-[min(70vh,32rem)] overflow-y-auto">
        {items.length === 0 ? <div className="px-4 py-10 text-center"><Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" /><p className="text-sm font-medium">You are all caught up</p><p className="text-xs text-muted-foreground">New chats, mail, inquiries, and requests will appear here.</p></div> : items.map((item) => {
          const Icon = iconByType[item.notification_type as keyof typeof iconByType] || CircleAlert;
          const content = <div className={cn('flex gap-3 px-4 py-3 transition-colors hover:bg-accent', !item.read_at && 'bg-primary/5')}>
            <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', item.read_at ? 'bg-secondary text-muted-foreground' : 'bg-primary/10 text-primary')}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><span className="text-sm font-semibold leading-tight">{item.title}</span>{!item.read_at ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}</span>{item.body ? <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{item.body}</span> : null}<span className="mt-1.5 block text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span></span>
          </div>;
          return item.href?.startsWith('/admin/') ? <Link key={item.id} href={item.href} onClick={() => { void markRead(item.id); setOpen(false); }}>{content}</Link> : <button key={item.id} className="w-full text-left" onClick={() => void markRead(item.id)}>{content}</button>;
        })}
      </div>
    </DropdownMenuContent>
  </DropdownMenu>;
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, CalendarClock, CheckCheck, CircleAlert, Inbox, Loader2, Mail, MessageCircle, PackageSearch, ReceiptText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useRecipientNotifications } from '@/hooks/use-recipient-notifications';
import { notificationHref, type NotificationAudience } from '@/lib/notifications';
import { cn } from '@/lib/utils';

const iconByType = {
  chat_message: MessageCircle, internal_mail: Mail, inquiry: Inbox, part_request: PackageSearch,
  invoice: ReceiptText, remittance: ReceiptText, payment_proof: ReceiptText, system: CircleAlert,
  request_due: CalendarClock, support_message: MessageCircle,
} as const;

export function RecipientNotificationCenter({ audience, userId }: { audience: NotificationAudience; userId: string }) {
  const { items, unread, loading, error, reload, markRead } = useRecipientNotifications(audience, userId);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const read = async (id?: string) => {
    setMarking(true);
    try { await markRead(id); } catch { toast.error('Could not mark notifications as read.'); }
    finally { setMarking(false); }
  };

  return <DropdownMenu open={open} onOpenChange={(value) => { setOpen(value); if (value) void reload(15_000); }}>
    <DropdownMenuTrigger asChild>
      <Button variant={audience === 'portal' ? 'outline' : 'ghost'} size="icon" className={cn('relative', audience === 'portal' && 'h-9 w-9 shrink-0 rounded-lg p-0 sm:w-auto sm:gap-2 sm:px-3')} aria-label={`${unread} unread notifications`}>
        <Bell className="h-5 w-5" />{audience === 'portal' ? <span className="hidden text-xs font-medium sm:inline">Alerts</span> : null}
        {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">{unread > 99 ? '99+' : unread}</span> : null}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-[min(92vw,24rem)] p-0">
      <div className="flex items-center justify-between px-4 py-3">
        <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
        {unread > 0 ? <Button variant="ghost" size="sm" disabled={marking} className="h-8 text-xs" onClick={() => void read()}><CheckCheck className="h-3.5 w-3.5" />Mark all read</Button> : null}
      </div>
      <DropdownMenuSeparator className="m-0" />
      {error ? <div role="status" className="px-4 py-3 text-xs text-destructive">{error}<Button size="sm" variant="ghost" onClick={() => void reload()}>Retry</Button></div> : null}
      <div className="max-h-[min(70vh,32rem)] overflow-y-auto">
        {loading ? <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading notifications…</div> : null}
        {!loading && !error && items.length === 0 ? <div className="px-4 py-10 text-center"><Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" /><p className="text-sm font-medium">You are all caught up</p><p className="text-xs text-muted-foreground">{audience === 'portal' ? 'Invoice updates, TT copy reviews, and support replies will appear here.' : 'New chats, inquiries, TT copies, support messages, and requests will appear here.'}</p></div> : null}
        {items.map((item) => {
          const Icon = iconByType[item.notification_type as keyof typeof iconByType] || CircleAlert;
          const href = notificationHref(item.href, audience);
          const content = <div className={cn('flex gap-3 px-4 py-3 transition-colors hover:bg-accent', !item.read_at && 'bg-primary/5')}>
            <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', item.read_at ? 'bg-secondary text-muted-foreground' : 'bg-primary/10 text-primary')}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><span className="text-sm font-semibold leading-tight">{item.title}</span>{!item.read_at ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}</span>{item.body ? <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{item.body}</span> : null}<span className="mt-1.5 block text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span></span>
          </div>;
          return href ? <Link key={item.id} href={href} onClick={() => { if (!item.read_at) void read(item.id); setOpen(false); }}>{content}</Link> : <button key={item.id} className="w-full text-left" onClick={() => void read(item.id)}>{content}</button>;
        })}
      </div>
    </DropdownMenuContent>
  </DropdownMenu>;
}

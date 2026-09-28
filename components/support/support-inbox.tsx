'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { CheckCheck, Circle, FileText, Loader2, Paperclip, RefreshCw, Send, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NotificationSettings } from '@/components/pwa/notification-settings';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Mode = 'customer' | 'agent';
type Thread = {
  id: string;
  customer_profile_id: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved';
  assigned_to: string | null;
  last_message_at: string | null;
  created_at: string;
};
type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_kind: 'customer' | 'agent';
  body: string | null;
  read_at: string | null;
  created_at: string;
};
type Attachment = {
  id: string;
  message_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  url?: string;
};
type CustomerLabel = { full_name: string | null; email: string };

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function cleanFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'attachment';
}

export function SupportInbox({ mode }: { mode: Mode }) {
  const [userId, setUserId] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [customers, setCustomers] = useState<Record<string, CustomerLabel>>({});
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [teamOnline, setTeamOnline] = useState(false);
  const [teamLastSeen, setTeamLastSeen] = useState<string | null>(null);
  const [unreadByThread, setUnreadByThread] = useState<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async (uid?: string) => {
    const id = uid || userId;
    if (!id) return;
    let query = supabase
      .from('support_threads')
      .select('id,customer_profile_id,subject,status,assigned_to,last_message_at,created_at')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (mode === 'customer') query = query.eq('customer_profile_id', id);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []) as Thread[];
    setThreads(rows);
    if (mode === 'customer') setSelectedId(rows[0]?.id || null);
    else {
      const requestedId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('thread') : null;
      setSelectedId((current) => requestedId && rows.some((row) => row.id === requestedId)
        ? requestedId
        : current && rows.some((row) => row.id === current) ? current : rows[0]?.id || null);
    }

    if (mode === 'agent' && rows.length) {
      const { data: unreadMessages } = await supabase.from('support_messages')
        .select('thread_id')
        .in('thread_id', rows.map((row) => row.id))
        .eq('sender_kind', 'customer')
        .is('read_at', null);
      const unreadCounts: Record<string, number> = {};
      for (const message of unreadMessages || []) unreadCounts[message.thread_id] = (unreadCounts[message.thread_id] || 0) + 1;
      setUnreadByThread(unreadCounts);
      const ids = Array.from(new Set(rows.map((row) => row.customer_profile_id)));
      const { data: profiles } = await supabase.from('customer_profiles').select('id,full_name,email').in('id', ids);
      const labels: Record<string, CustomerLabel> = {};
      for (const profile of profiles || []) labels[profile.id] = { full_name: profile.full_name, email: profile.email };
      setCustomers(labels);
    } else if (mode === 'agent') {
      setUnreadByThread({});
    }
  }, [mode, userId]);

  const loadMessages = useCallback(async (threadId: string) => {
    const { data, error } = await supabase
      .from('support_messages')
      .select('id,thread_id,sender_id,sender_kind,body,read_at,created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const rows = (data || []) as Message[];
    setMessages(rows);

    const messageIds = rows.map((row) => row.id);
    if (!messageIds.length) {
      setAttachments({});
    } else {
      const { data: fileRows } = await supabase
        .from('support_attachments')
        .select('id,message_id,file_name,mime_type,size_bytes,storage_path')
        .in('message_id', messageIds);
      const grouped: Record<string, Attachment[]> = {};
      for (const file of (fileRows || []) as Attachment[]) {
        const { data: signed } = await supabase.storage.from('support-files').createSignedUrl(file.storage_path, 3600);
        (grouped[file.message_id] ||= []).push({ ...file, url: signed?.signedUrl });
      }
      setAttachments(grouped);
    }
    const { error: readError } = await supabase.rpc('mark_support_thread_read', { p_thread_id: threadId });
    if (!readError) {
      const readAt = new Date().toISOString();
      setMessages((current) => current.map((message) =>
        message.sender_kind !== mode && !message.read_at ? { ...message, read_at: readAt } : message
      ));
      if (mode === 'agent') setUnreadByThread((current) => ({ ...current, [threadId]: 0 }));
    }
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const loadPresence = useCallback(async () => {
    if (mode !== 'customer') return;
    const { data } = await supabase.rpc('get_support_presence');
    const row = Array.isArray(data) ? data[0] : data;
    setTeamOnline(Boolean(row?.online));
    setTeamLastSeen(row?.last_seen_at || null);
  }, [mode]);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserId(session.user.id);
      try {
        await loadThreads(session.user.id);
        await loadPresence();
        if (mode === 'customer') await supabase.rpc('touch_customer_last_seen');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not load support inbox.');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadPresence, loadThreads, mode]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
  }, [loadMessages, selectedId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`support-inbox-${mode}-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_threads' }, () => void loadThreads())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        const incoming = payload.new as Message;
        if (incoming.thread_id === selectedId) void loadMessages(incoming.thread_id);
        void loadThreads();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_messages' }, () => void loadThreads())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadMessages, loadThreads, mode, selectedId, userId]);

  useEffect(() => {
    if (mode !== 'customer' || !userId) return;
    const timer = window.setInterval(() => {
      void supabase.rpc('touch_customer_last_seen');
      void loadPresence();
    }, 45000);
    return () => window.clearInterval(timer);
  }, [loadPresence, mode, userId]);

  const onFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Array.from(event.target.files || []);
    for (const file of next) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} is larger than 10 MB.`);
        continue;
      }
      if (!ACCEPTED.has(file.type)) {
        toast.error(`${file.name} is not a supported file type.`);
        continue;
      }
      setFiles((current) => [...current, file].slice(0, 5));
    }
    event.target.value = '';
  };

  const ensureCustomerThread = async () => {
    if (selectedId) return selectedId;
    const { data, error } = await supabase
      .from('support_threads')
      .insert({ customer_profile_id: userId, subject: 'Portal support' })
      .select('id')
      .single();
    if (error) throw error;
    await loadThreads();
    setSelectedId(data.id);
    return data.id as string;
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body && files.length === 0) return;
    setSending(true);
    try {
      const threadId = mode === 'customer' ? await ensureCustomerThread() : selectedId;
      if (!threadId) throw new Error('Choose a customer conversation.');
      const { data: message, error } = await supabase
        .from('support_messages')
        .insert({ thread_id: threadId, sender_id: userId, sender_kind: mode, body: body || null })
        .select('id')
        .single();
      if (error) throw error;

      for (const file of files) {
        const path = `${threadId}/${userId}/${message.id}/${crypto.randomUUID()}-${cleanFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from('support-files').upload(path, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        const { error: attachmentError } = await supabase.from('support_attachments').insert({
          message_id: message.id,
          uploaded_by: userId,
          storage_path: path,
          file_name: file.name.slice(0, 255),
          mime_type: file.type,
          size_bytes: file.size,
        });
        if (attachmentError) throw attachmentError;
      }

      setText('');
      setFiles([]);
      await loadMessages(threadId);
      await loadThreads();
      const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-support-push', {
        body: { message_id: message.id },
      });
      if (pushError) {
        toast.message('Message sent, but push notification delivery failed. The recipient can still read it in the portal.');
      } else if (!pushResult?.sent) {
        toast.message('Message sent, but no support notification reached a device. Check notification settings.');
      } else if (pushResult.failed > 0) {
        toast.message(`Message sent. Notification reached ${pushResult.sent} device(s); ${pushResult.failed} failed.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (status: Thread['status']) => {
    if (!selectedId) return;
    const { error } = await supabase.from('support_threads').update({ status }).eq('id', selectedId);
    if (error) toast.error(error.message);
    else await loadThreads();
  };

  const selected = threads.find((thread) => thread.id === selectedId) || null;
  const title = selected && customers[selected.customer_profile_id]
    ? customers[selected.customer_profile_id].full_name || customers[selected.customer_profile_id].email
    : mode === 'agent' ? 'Customer support' : 'ANSHA Support';
  const unread = useMemo(() => messages.filter((message) =>
    !message.read_at && message.sender_kind !== mode
  ).length, [messages, mode]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-accent" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{mode === 'agent' ? 'Portal Support Inbox' : 'Support Inbox'}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'agent' ? 'Reply to signed-in customers and review their attachments.' : 'Message our team, attach documents or images, and receive replies here.'}
          </p>
        </div>
        {mode === 'customer' ? (
          <div className="flex items-center gap-2 text-sm">
            <Circle className={cn('h-3 w-3 fill-current', teamOnline ? 'text-emerald-500' : 'text-muted-foreground')} />
            <Badge variant="outline" className={cn('gap-1.5 rounded-full px-3 py-1', teamOnline ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-secondary/70')}><span>{teamOnline ? 'Team online' : teamLastSeen ? `Last active ${formatDistanceToNow(new Date(teamLastSeen), { addSuffix: true })}` : 'Team offline — leave a message'}</span></Badge>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => void loadThreads()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        )}
      </div>

      <NotificationSettings compact={mode === 'agent'} />

      <div className={cn('grid min-h-[560px] overflow-hidden rounded-3xl border border-white/50 bg-background/75 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10', mode === 'agent' && 'lg:grid-cols-[300px_1fr]')}>
        {mode === 'agent' ? (
          <aside className="border-b lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-white/40 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-violet-500/10 p-3 text-sm font-semibold dark:border-white/10">
              <span>Customers ({threads.length})</span>
              {Object.values(unreadByThread).reduce((sum, count) => sum + count, 0) > 0 ? (
                <Badge variant="destructive" className="min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[10px]">
                  {Object.values(unreadByThread).reduce((sum, count) => sum + count, 0)}
                </Badge>
              ) : null}
            </div>
            <div className="max-h-[240px] overflow-y-auto lg:max-h-[620px]">
              {threads.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No support conversations yet.</p> : threads.map((thread) => {
                const customer = customers[thread.customer_profile_id];
                return (
                  <button key={thread.id} type="button" onClick={() => setSelectedId(thread.id)}
                    className={cn('w-full border-b border-white/40 p-3 text-left transition hover:bg-white/60 dark:border-white/10 dark:hover:bg-white/5', selectedId === thread.id && 'bg-gradient-to-r from-cyan-500/15 to-blue-500/10')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{customer?.full_name || customer?.email || 'Customer'}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {unreadByThread[thread.id] ? <Badge variant="destructive" className="min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[10px]">{unreadByThread[thread.id]}</Badge> : null}
                        <Badge variant={thread.status === 'open' ? 'default' : 'outline'} className="text-[10px] capitalize">{thread.status}</Badge>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {thread.last_message_at ? formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true }) : 'No messages'}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>
        ) : null}

        <section className="flex min-h-[560px] min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/40 bg-gradient-to-r from-blue-500/10 via-cyan-500/5 to-transparent p-3 backdrop-blur-xl dark:border-white/10">
            <div>
              <p className="font-semibold">{title}</p>
              {unread ? <p className="text-xs text-accent">{unread} unread</p> : <p className="text-xs text-muted-foreground">Messages stay inside your secure account</p>}
            </div>
            {mode === 'agent' && selected ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void updateStatus('pending')}>Pending</Button>
                <Button size="sm" variant="outline" onClick={() => void updateStatus(selected.status === 'resolved' ? 'open' : 'resolved')}>
                  {selected.status === 'resolved' ? 'Reopen' : 'Resolve'}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-br from-slate-50/80 via-cyan-50/40 to-blue-50/50 p-3 dark:from-slate-950/70 dark:via-cyan-950/20 dark:to-blue-950/20 sm:p-5">
            {messages.length === 0 ? (
              <div className="mx-auto max-w-md py-20 text-center">
                <UserRound className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-medium">{mode === 'agent' && !selected ? 'Select a conversation' : 'Start a conversation'}</p>
                <p className="mt-1 text-sm text-muted-foreground">{mode === 'customer' ? 'Tell us what you need and the online team will reply.' : 'Customer messages appear here in real time.'}</p>
              </div>
            ) : messages.map((message) => {
              const mine = message.sender_kind === mode;
              return (
                <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[88%] rounded-2xl px-3 py-2 sm:max-w-[72%]', mine ? 'bg-gradient-to-br from-blue-600 to-cyan-600 text-white shadow-lg shadow-cyan-900/10' : 'border border-white/70 bg-white/80 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80')}>
                    {message.body ? <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p> : null}
                    {(attachments[message.id] || []).map((file) => (
                      <a key={file.id} href={file.url} target="_blank" rel="noreferrer"
                        className={cn('mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs', mine ? 'border-white/30' : 'border-border')}>
                        {file.mime_type?.startsWith('image/') && file.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={file.url} alt="" className="h-12 w-12 rounded object-cover" />
                        ) : <FileText className="h-5 w-5" />}
                        <span className="min-w-0 truncate">{file.file_name}</span>
                      </a>
                    ))}
                    <div className={cn('mt-1 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-accent-foreground/70' : 'text-muted-foreground')}>
                      {format(new Date(message.created_at), 'dd MMM, HH:mm')}
                      {mine && message.read_at ? <CheckCheck className="h-3 w-3" /> : null}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {(mode === 'customer' || selected) ? (
            <form onSubmit={(event) => void send(event)} className="border-t border-white/40 bg-background/70 p-3 backdrop-blur-xl dark:border-white/10">
              {files.length ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs">
                      <span className="max-w-48 truncate">{file.name}</span>
                      <button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-md border hover:bg-secondary" aria-label="Attach files">
                  <Paperclip className="h-4 w-4" />
                  <input type="file" multiple className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,.doc,.docx" onChange={onFiles} />
                </label>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  maxLength={4000}
                  rows={1}
                  placeholder="Type your message…"
                  aria-label="Message"
                  className="min-h-10 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <Button type="submit" size="icon" disabled={sending || (!text.trim() && files.length === 0)} aria-label="Send message">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">Enter to send · Shift+Enter for a new line · Up to 5 files, 10 MB each</p>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}

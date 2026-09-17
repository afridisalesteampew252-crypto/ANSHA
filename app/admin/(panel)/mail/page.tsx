'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Download,
  FileText,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { format, isToday } from 'date-fns';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Folder = 'inbox' | 'sent' | 'archive';

type MailRecord = {
  id: string;
  sender_id: string;
  subject: string;
  body: string;
  created_at: string;
};

type Recipient = {
  mail_id: string;
  recipient_id: string;
  recipient_type: 'to' | 'cc' | 'bcc';
  read_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
};

type Attachment = {
  id: string;
  mail_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

type MailItem = MailRecord & {
  recipients: Recipient[];
  attachments: Attachment[];
  ownRecipient: Recipient | null;
};

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function personName(profile?: AdminProfile) {
  return profile?.full_name || profile?.email || 'ANSHA colleague';
}

function formatMailTime(value: string) {
  const date = new Date(value);
  return isToday(date) ? format(date, 'h:mm a') : format(date, 'MMM d, yyyy');
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment';
}

function formatBytes(value: number | null) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function InternalMailPage() {
  const [currentUserId, setCurrentUserId] = useState('');
  const [profiles, setProfiles] = useState<Record<string, AdminProfile>>({});
  const [items, setItems] = useState<MailItem[]>([]);
  const [folder, setFolder] = useState<Folder>('inbox');
  const [activeId, setActiveId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [toIds, setToIds] = useState<string[]>([]);
  const [ccIds, setCcIds] = useState<string[]>([]);
  const [bccIds, setBccIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  const loadMail = useCallback(async (userId: string) => {
    const [{ data: ownRecipientData, error: recipientError }, { data: sentData, error: sentError }] = await Promise.all([
      supabase.from('internal_mail_recipients').select('*').eq('recipient_id', userId),
      supabase.from('internal_mail').select('*').eq('sender_id', userId).order('created_at', { ascending: false }),
    ]);
    if (recipientError) throw recipientError;
    if (sentError) throw sentError;
    const ownRecipients = (ownRecipientData || []) as Recipient[];
    const sent = (sentData || []) as MailRecord[];
    const receivedIds = ownRecipients.map((recipient) => recipient.mail_id);
    let received: MailRecord[] = [];
    if (receivedIds.length) {
      const { data, error } = await supabase.from('internal_mail').select('*').in('id', receivedIds).order('created_at', { ascending: false });
      if (error) throw error;
      received = (data || []) as MailRecord[];
    }
    const records = [...received, ...sent.filter((mail) => !received.some((receivedMail) => receivedMail.id === mail.id))];
    const mailIds = records.map((mail) => mail.id);
    let recipients: Recipient[] = ownRecipients;
    let attachments: Attachment[] = [];
    if (mailIds.length) {
      const [{ data: recipientData }, { data: attachmentData }] = await Promise.all([
        supabase.from('internal_mail_recipients').select('*').in('mail_id', mailIds),
        supabase.from('internal_mail_attachments').select('*').in('mail_id', mailIds),
      ]);
      recipients = (recipientData || []) as Recipient[];
      attachments = (attachmentData || []) as Attachment[];
    }
    setItems(records.map((mail) => ({
      ...mail,
      recipients: recipients.filter((recipient) => recipient.mail_id === mail.id),
      attachments: attachments.filter((attachment) => attachment.mail_id === mail.id),
      ownRecipient: ownRecipients.find((recipient) => recipient.mail_id === mail.id) || null,
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !active) return;
        setCurrentUserId(session.user.id);
        const { data: profileData, error } = await supabase.from('admin_profiles').select('*').order('full_name');
        if (error) throw error;
        if (!active) return;
        setProfiles(Object.fromEntries(((profileData || []) as AdminProfile[]).map((profile) => [profile.id, profile])));
        await loadMail(session.user.id);
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : 'Unable to load internal mail.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadMail]);

  useEffect(() => {
    if (!currentUserId) return;

    const topic = `workspace-mail-${currentUserId}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
    if (existing) {
      void supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(topic)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_mail' }, () => void loadMail(currentUserId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_mail_recipients' }, () => void loadMail(currentUserId))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, loadMail]);

  const folderItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const inFolder = folder === 'sent'
        ? item.sender_id === currentUserId
        : folder === 'archive'
          ? Boolean(item.ownRecipient?.archived_at && !item.ownRecipient?.deleted_at)
          : Boolean(item.ownRecipient && !item.ownRecipient.archived_at && !item.ownRecipient.deleted_at);
      if (!inFolder) return false;
      if (!query) return true;
      return item.subject.toLowerCase().includes(query)
        || item.body.toLowerCase().includes(query)
        || personName(profiles[item.sender_id]).toLowerCase().includes(query);
    });
  }, [currentUserId, folder, items, profiles, search]);

  useEffect(() => {
    setActiveId((current) => current && folderItems.some((item) => item.id === current) ? current : '');
  }, [folderItems]);

  const activeMail = items.find((item) => item.id === activeId) || null;
  const unreadCount = items.filter((item) => item.ownRecipient && !item.ownRecipient.read_at && !item.ownRecipient.archived_at && !item.ownRecipient.deleted_at).length;

  async function openMail(item: MailItem) {
    setActiveId(item.id);
    if (item.ownRecipient && !item.ownRecipient.read_at) {
      const { error } = await supabase.from('internal_mail_recipients').update({ read_at: new Date().toISOString() }).eq('mail_id', item.id).eq('recipient_id', currentUserId);
      if (!error) await loadMail(currentUserId);
    }
  }

  function assignRecipient(id: string, type: 'to' | 'cc' | 'bcc') {
    const values = { to: toIds, cc: ccIds, bcc: bccIds };
    const selected = values[type].includes(id);
    setToIds((current) => type === 'to' ? (selected ? current.filter((value) => value !== id) : [...current, id]) : current.filter((value) => value !== id));
    setCcIds((current) => type === 'cc' ? (selected ? current.filter((value) => value !== id) : [...current, id]) : current.filter((value) => value !== id));
    setBccIds((current) => type === 'bcc' ? (selected ? current.filter((value) => value !== id) : [...current, id]) : current.filter((value) => value !== id));
  }

  function resetCompose() {
    setSubject('');
    setMessageBody('');
    setToIds([]);
    setCcIds([]);
    setBccIds([]);
    setFiles([]);
  }

  async function sendMail() {
    if (sending || !subject.trim() || !messageBody.trim() || !toIds.length) return;
    const invalidFile = files.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (invalidFile) {
      setNotice(`${invalidFile.name} is larger than 25 MB.`);
      return;
    }
    setSending(true);
    setNotice('');
    try {
      const { data, error } = await supabase.rpc('send_internal_mail', {
        mail_subject: subject,
        mail_body: messageBody,
        to_ids: toIds,
        cc_ids: ccIds,
        bcc_ids: bccIds,
      });
      if (error) throw error;
      const mailId = data as string;
      for (const file of files) {
        const path = `mail/${mailId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from('internal-files').upload(path, file, { cacheControl: '3600' });
        if (uploadError) throw uploadError;
        const { error: attachmentError } = await supabase.from('internal_mail_attachments').insert({
          mail_id: mailId,
          uploaded_by: currentUserId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (attachmentError) throw attachmentError;
      }
      resetCompose();
      setComposeOpen(false);
      setFolder('sent');
      await loadMail(currentUserId);
      setActiveId(mailId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send mail.');
    } finally {
      setSending(false);
    }
  }

  async function updateMailbox(item: MailItem, values: Partial<Pick<Recipient, 'read_at' | 'archived_at' | 'deleted_at'>>) {
    const { error } = await supabase.from('internal_mail_recipients').update(values).eq('mail_id', item.id).eq('recipient_id', currentUserId);
    if (error) setNotice(error.message);
    else {
      setActiveId('');
      await loadMail(currentUserId);
    }
  }

  async function openAttachment(attachment: Attachment) {
    const { data, error } = await supabase.storage.from('internal-files').createSignedUrl(attachment.storage_path, 60);
    if (error || !data?.signedUrl) setNotice(error?.message || 'Unable to open attachment.');
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  function beginReply(item: MailItem) {
    setToIds([item.sender_id]);
    setCcIds([]);
    setBccIds([]);
    setSubject(item.subject.toLowerCase().startsWith('re:') ? item.subject : `Re: ${item.subject}`);
    setMessageBody(`\n\n--- Previous message ---\n${item.body}`);
    setFiles([]);
    setComposeOpen(true);
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  const colleagues = Object.values(profiles).filter((profile) => profile.id !== currentUserId);
  const folders: { id: Folder; label: string; icon: typeof Inbox; count?: number }[] = [
    { id: 'inbox', label: 'Inbox', icon: Inbox, count: unreadCount },
    { id: 'sent', label: 'Sent', icon: Send },
    { id: 'archive', label: 'Archive', icon: Archive },
  ];

  return (
    <div className="-m-4 flex h-[calc(100vh-8rem)] min-h-[620px] overflow-hidden border-y bg-card md:-m-8 md:h-[calc(100vh-5rem)]">
      <aside className={cn('w-full shrink-0 border-r md:w-56', activeId && 'hidden md:block')}>
        <div className="border-b p-4"><Button className="w-full" onClick={() => setComposeOpen(true)}><Plus className="h-4 w-4" />Compose</Button></div>
        <nav className="space-y-1 p-3">{folders.map((item) => <button type="button" key={item.id} onClick={() => { setFolder(item.id); setActiveId(''); }} className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium', folder === item.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}><item.icon className="h-4 w-4" />{item.label}{item.count ? <Badge className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5">{item.count}</Badge> : null}</button>)}</nav>
      </aside>

      <section className={cn('w-full shrink-0 border-r md:w-80 lg:w-96', activeId && 'hidden md:block')}>
        <div className="space-y-3 border-b p-4"><div><h1 className="text-xl font-bold">Internal mail</h1><p className="text-xs text-muted-foreground">{folders.find((item) => item.id === folder)?.label}</p></div><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mail" className="pl-9" /></div></div>
        <ScrollArea className="h-[calc(100%-7.5rem)]">{folderItems.length ? folderItems.map((item) => {
          const unread = Boolean(item.ownRecipient && !item.ownRecipient.read_at);
          const correspondent = folder === 'sent' ? item.recipients.map((row) => personName(profiles[row.recipient_id])).join(', ') || 'Recipients' : personName(profiles[item.sender_id]);
          return <button type="button" key={item.id} onClick={() => void openMail(item)} className={cn('w-full border-b p-4 text-left hover:bg-accent', unread && 'bg-primary/5')}><span className="flex items-start justify-between gap-2"><span className={cn('truncate text-sm', unread ? 'font-bold' : 'font-medium')}>{correspondent}</span><span className="shrink-0 text-[10px] text-muted-foreground">{formatMailTime(item.created_at)}</span></span><span className={cn('mt-1 block truncate text-sm', unread && 'font-semibold')}>{item.subject}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.body}</span>{item.attachments.length ? <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Paperclip className="h-3 w-3" />{item.attachments.length}</span> : null}</button>;
        }) : <div className="px-6 py-16 text-center"><Mail className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><p className="font-medium">No mail here</p><p className="mt-1 text-sm text-muted-foreground">Messages in this folder will appear here.</p></div>}</ScrollArea>
      </section>

      <section className={cn('min-w-0 flex-1', !activeId && 'hidden md:block')}>
        {activeMail ? <div className="flex h-full flex-col">
          <header className="flex min-h-16 items-center justify-between gap-3 border-b px-4 py-3"><div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" className="md:hidden" onClick={() => setActiveId('')}><X className="h-4 w-4" /></Button><div className="min-w-0"><h2 className="truncate font-semibold">{activeMail.subject}</h2><p className="truncate text-xs text-muted-foreground">From {personName(profiles[activeMail.sender_id])}</p></div></div><div className="flex items-center gap-1">{activeMail.ownRecipient ? <><Button variant="ghost" size="icon" title={activeMail.ownRecipient.read_at ? 'Mark unread' : 'Mark read'} onClick={() => void updateMailbox(activeMail, { read_at: activeMail.ownRecipient?.read_at ? null : new Date().toISOString() })}>{activeMail.ownRecipient.read_at ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" title={activeMail.ownRecipient.archived_at ? 'Restore' : 'Archive'} onClick={() => void updateMailbox(activeMail, { archived_at: activeMail.ownRecipient?.archived_at ? null : new Date().toISOString() })}>{activeMail.ownRecipient.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" className="text-destructive" title="Remove from inbox" onClick={() => void updateMailbox(activeMail, { deleted_at: new Date().toISOString() })}><Trash2 className="h-4 w-4" /></Button></> : null}</div></header>
          <ScrollArea className="flex-1"><article className="mx-auto max-w-4xl space-y-6 p-5 sm:p-8"><div className="flex flex-col gap-2 border-b pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{personName(profiles[activeMail.sender_id])}</p><p className="text-sm text-muted-foreground">{profiles[activeMail.sender_id]?.email}</p><p className="mt-2 text-xs text-muted-foreground">To: {activeMail.recipients.filter((recipient) => recipient.recipient_type === 'to').map((recipient) => personName(profiles[recipient.recipient_id])).join(', ') || 'You'}</p>{activeMail.recipients.some((recipient) => recipient.recipient_type === 'cc') ? <p className="text-xs text-muted-foreground">CC: {activeMail.recipients.filter((recipient) => recipient.recipient_type === 'cc').map((recipient) => personName(profiles[recipient.recipient_id])).join(', ')}</p> : null}</div><time className="text-xs text-muted-foreground">{format(new Date(activeMail.created_at), 'PPpp')}</time></div><div className="whitespace-pre-wrap text-sm leading-7">{activeMail.body}</div>{activeMail.attachments.length ? <div className="space-y-2 border-t pt-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attachments</p><div className="grid gap-2 sm:grid-cols-2">{activeMail.attachments.map((attachment) => <button type="button" key={attachment.id} onClick={() => void openAttachment(attachment)} className="flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-accent"><FileText className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{attachment.file_name}</span><span className="text-xs text-muted-foreground">{formatBytes(attachment.size_bytes)}</span></span><Download className="h-4 w-4" /></button>)}</div></div> : null}{activeMail.sender_id !== currentUserId ? <Button onClick={() => beginReply(activeMail)}><Send className="h-4 w-4" />Reply</Button> : null}</article></ScrollArea>
        </div> : <div className="flex h-full items-center justify-center p-8 text-center"><div><MailOpen className="mx-auto mb-4 h-12 w-12 text-primary/40" /><h2 className="text-lg font-semibold">ANSHA Internal Mail</h2><p className="mt-1 text-sm text-muted-foreground">Select a message to read it.</p></div></div>}
      </section>

      <Dialog open={composeOpen} onOpenChange={(open) => { setComposeOpen(open); if (!open) resetCompose(); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>New internal mail</DialogTitle><DialogDescription>Send a secure internal message to ANSHA team members.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            {(['to', 'cc', 'bcc'] as const).map((type) => {
              const selected = type === 'to' ? toIds : type === 'cc' ? ccIds : bccIds;
              return <div key={type} className="space-y-2"><Label className="uppercase">{type}</Label><div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-lg border p-2">{colleagues.map((profile) => <label key={profile.id} className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs', selected.includes(profile.id) && 'border-primary bg-primary/5 text-primary')}><Checkbox checked={selected.includes(profile.id)} onCheckedChange={() => assignRecipient(profile.id, type)} />{personName(profile)}</label>)}</div></div>;
            })}
            <div className="space-y-1.5"><Label htmlFor="mail-subject">Subject</Label><Input id="mail-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={250} /></div>
            <div className="space-y-1.5"><Label htmlFor="mail-body">Message</Label><Textarea id="mail-body" value={messageBody} onChange={(event) => setMessageBody(event.target.value)} rows={10} maxLength={50000} /></div>
            <div className="space-y-2"><Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"><Paperclip className="h-4 w-4" />Attach files<Input type="file" multiple className="hidden" onChange={(event) => setFiles(Array.from(event.target.files || []))} /></Label>{files.length ? <div className="flex flex-wrap gap-2">{files.map((file, index) => <Badge key={`${file.name}-${index}`} variant="secondary" className="gap-1 py-1">{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-3 w-3" /></button></Badge>)}</div> : null}</div>
          </div>
          {notice ? <p className="text-sm text-destructive">{notice}</p> : null}
          <DialogFooter><Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button><Button disabled={sending || !toIds.length || !subject.trim() || !messageBody.trim()} onClick={() => void sendMail()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send mail</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  Save,
  Search,
  Send,
  Settings,
  Trash2,
  Users,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Conversation = {
  id: string;
  conversation_type: 'direct' | 'group';
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type Participant = {
  conversation_id: string;
  user_id: string;
  is_manager: boolean;
  joined_at: string;
  last_read_at: string | null;
};

type Attachment = {
  id: string;
  message_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  attachments: Attachment[];
};

type ConversationSummary = Conversation & {
  participants: Participant[];
  lastMessage: Omit<Message, 'attachments'> | null;
  unread: number;
};

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function personName(profile?: AdminProfile) {
  return profile?.full_name || profile?.email || 'ANSHA colleague';
}

function initials(profile?: AdminProfile) {
  return personName(profile)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment';
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  return isToday(date) ? format(date, 'h:mm a') : format(date, 'MMM d, h:mm a');
}

function formatBytes(value: number | null) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatPage() {
  const [currentUserId, setCurrentUserId] = useState('');
  const [profiles, setProfiles] = useState<Record<string, AdminProfile>>({});
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<'direct' | 'group'>('direct');
  const [groupName, setGroupName] = useState('');
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageName, setManageName] = useState('');
  const [managePeople, setManagePeople] = useState<string[]>([]);
  const [managing, setManaging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async (userId: string) => {
    const { data: membershipData, error: membershipError } = await supabase
      .from('chat_participants')
      .select('*')
      .eq('user_id', userId);
    if (membershipError) throw membershipError;
    const memberships = (membershipData || []) as Participant[];
    const ids = memberships.map((row) => row.conversation_id);
    if (!ids.length) {
      setConversations([]);
      return;
    }

    const [{ data: conversationData, error: conversationError }, { data: participantData }, { data: recentData }] = await Promise.all([
      supabase.from('chat_conversations').select('*').in('id', ids),
      supabase.from('chat_participants').select('*').in('conversation_id', ids),
      supabase.from('chat_messages').select('id,conversation_id,sender_id,body,reply_to_id,created_at,edited_at,deleted_at').in('conversation_id', ids).order('created_at', { ascending: false }).limit(500),
    ]);
    if (conversationError) throw conversationError;

    const allParticipants = (participantData || []) as Participant[];
    const recent = (recentData || []) as Omit<Message, 'attachments'>[];
    const summaries = ((conversationData || []) as Conversation[]).map((conversation) => {
      const ownMembership = memberships.find((row) => row.conversation_id === conversation.id);
      const conversationMessages = recent.filter((message) => message.conversation_id === conversation.id);
      const unread = conversationMessages.filter((message) =>
        message.sender_id !== userId && (!ownMembership?.last_read_at || message.created_at > ownMembership.last_read_at)
      ).length;
      return {
        ...conversation,
        participants: allParticipants.filter((row) => row.conversation_id === conversation.id),
        lastMessage: conversationMessages[0] || null,
        unread,
      };
    }).sort((a, b) => {
      const aTime = a.lastMessage?.created_at || a.updated_at;
      const bTime = b.lastMessage?.created_at || b.updated_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
    setConversations(summaries);
    setActiveId((current) => current && summaries.some((item) => item.id === current) ? current : summaries[0]?.id || '');
  }, []);

  const loadMessages = useCallback(async (conversationId: string, userId: string) => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(300);
    if (error) {
      setNotice(error.message);
      setLoadingMessages(false);
      return;
    }
    const rows = (data || []) as Omit<Message, 'attachments'>[];
    const messageIds = rows.map((row) => row.id);
    let attachments: Attachment[] = [];
    if (messageIds.length) {
      const { data: attachmentData } = await supabase.from('chat_attachments').select('*').in('message_id', messageIds);
      attachments = (attachmentData || []) as Attachment[];
    }
    setMessages(rows.map((row) => ({
      ...row,
      attachments: attachments.filter((attachment) => attachment.message_id === row.id),
    })));
    await supabase
      .from('chat_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    setLoadingMessages(false);
    window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !active) return;
        setCurrentUserId(session.user.id);
        const { data: profileData, error: profileError } = await supabase.from('admin_profiles').select('*').order('full_name');
        if (profileError) throw profileError;
        if (!active) return;
        const profileMap = Object.fromEntries(((profileData || []) as AdminProfile[]).map((profile) => [profile.id, profile]));
        setProfiles(profileMap);
        await loadConversations(session.user.id);
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : 'Unable to load chat.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId || !currentUserId) return;
    void loadMessages(activeId, currentUserId);
  }, [activeId, currentUserId, loadMessages]);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`workspace-chat-${currentUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload) => {
        const changed = (payload.new || payload.old) as { conversation_id?: string };
        void loadConversations(currentUserId);
        if (changed.conversation_id === activeId) void loadMessages(activeId, currentUserId);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeId, currentUserId, loadConversations, loadMessages]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) || null;
  const activeTitle = useCallback((conversation: ConversationSummary) => {
    if (conversation.conversation_type === 'group') return conversation.name || 'Group conversation';
    const other = conversation.participants.find((participant) => participant.user_id !== currentUserId);
    return personName(other ? profiles[other.user_id] : undefined);
  }, [currentUserId, profiles]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => activeTitle(conversation).toLowerCase().includes(query));
  }, [activeTitle, conversations, search]);

  async function sendMessage() {
    if (!activeId || !currentUserId || sending || (!body.trim() && !files.length)) return;
    const invalidFile = files.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (invalidFile) {
      setNotice(`${invalidFile.name} is larger than 25 MB.`);
      return;
    }
    setSending(true);
    setNotice('');
    try {
      if (editing) {
        const { error } = await supabase.from('chat_messages').update({ body: body.trim(), edited_at: new Date().toISOString() }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('chat_messages').insert({
          conversation_id: activeId,
          sender_id: currentUserId,
          body: body.trim() || null,
          reply_to_id: replyTo?.id || null,
        }).select().single();
        if (error) throw error;
        const messageId = (data as { id: string }).id;
        for (const file of files) {
          const path = `chat/${activeId}/${messageId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
          const { error: uploadError } = await supabase.storage.from('internal-files').upload(path, file, { cacheControl: '3600' });
          if (uploadError) throw uploadError;
          const { error: attachmentError } = await supabase.from('chat_attachments').insert({
            message_id: messageId,
            uploaded_by: currentUserId,
            storage_path: path,
            file_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
          });
          if (attachmentError) throw attachmentError;
        }
      }
      setBody('');
      setFiles([]);
      setReplyTo(null);
      setEditing(null);
      await Promise.all([loadMessages(activeId, currentUserId), loadConversations(currentUserId)]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send the message.');
    } finally {
      setSending(false);
    }
  }

  async function softDeleteMessage(message: Message) {
    const { error } = await supabase.from('chat_messages').update({ body: null, deleted_at: new Date().toISOString() }).eq('id', message.id);
    if (error) setNotice(error.message);
    else await loadMessages(activeId, currentUserId);
  }

  async function openAttachment(attachment: Attachment) {
    const { data, error } = await supabase.storage.from('internal-files').createSignedUrl(attachment.storage_path, 60);
    if (error || !data?.signedUrl) setNotice(error?.message || 'Unable to open attachment.');
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function createConversation() {
    if (creating) return;
    setCreating(true);
    setNotice('');
    try {
      const { data, error } = await supabase.rpc('create_chat_conversation', {
        requested_type: createType,
        requested_name: groupName,
        requested_participants: selectedPeople,
      });
      if (error) throw error;
      setCreateOpen(false);
      setGroupName('');
      setSelectedPeople([]);
      await loadConversations(currentUserId);
      setActiveId(data as string);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to create conversation.');
    } finally {
      setCreating(false);
    }
  }

  function togglePerson(id: string) {
    setSelectedPeople((current) => {
      if (createType === 'direct') return current.includes(id) ? [] : [id];
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  }

  function openGroupManager() {
    if (!activeConversation) return;
    setManageName(activeConversation.name || '');
    setManagePeople(activeConversation.participants.map((participant) => participant.user_id));
    setManageOpen(true);
  }

  async function saveGroup() {
    if (!activeConversation || !manageName.trim() || managing) return;
    setManaging(true);
    setNotice('');
    try {
      const existing = activeConversation.participants.map((participant) => participant.user_id);
      const additions = managePeople.filter((id) => !existing.includes(id));
      const removals = existing.filter((id) => id !== currentUserId && !managePeople.includes(id));
      const { error: conversationError } = await supabase.from('chat_conversations').update({ name: manageName.trim(), updated_at: new Date().toISOString() }).eq('id', activeConversation.id);
      if (conversationError) throw conversationError;
      if (additions.length) {
        const { error } = await supabase.from('chat_participants').insert(additions.map((userId) => ({ conversation_id: activeConversation.id, user_id: userId })));
        if (error) throw error;
      }
      if (removals.length) {
        const { error } = await supabase.from('chat_participants').delete().eq('conversation_id', activeConversation.id).in('user_id', removals);
        if (error) throw error;
      }
      setManageOpen(false);
      await loadConversations(currentUserId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update the group.');
    } finally {
      setManaging(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }

  const colleagues = Object.values(profiles).filter((profile) => profile.id !== currentUserId);
  const replyMessage = replyTo || editing;
  const canManageGroup = Boolean(activeConversation
    && activeConversation.conversation_type === 'group'
    && (activeConversation.created_by === currentUserId || activeConversation.participants.some((participant) => participant.user_id === currentUserId && participant.is_manager)));

  return (
    <div className="-m-4 flex h-[calc(100vh-8rem)] min-h-[620px] overflow-hidden border-y bg-card md:-m-8 md:h-[calc(100vh-5rem)]">
      <section className={cn('w-full shrink-0 border-r md:w-80 lg:w-96', activeId && 'hidden md:block')}>
        <div className="space-y-3 border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Team chat</h1>
              <p className="text-xs text-muted-foreground">Direct and group conversations</p>
            </div>
            <Button size="icon" onClick={() => setCreateOpen(true)} aria-label="New conversation"><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" className="pl-9" /></div>
        </div>
        <ScrollArea className="h-[calc(100%-7.5rem)]">
          {filteredConversations.length ? filteredConversations.map((conversation) => {
            const other = conversation.participants.find((participant) => participant.user_id !== currentUserId);
            const profile = other ? profiles[other.user_id] : undefined;
            return (
              <button key={conversation.id} type="button" onClick={() => setActiveId(conversation.id)} className={cn('flex w-full items-center gap-3 border-b p-4 text-left transition-colors hover:bg-accent', activeId === conversation.id && 'bg-primary/5')}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{conversation.conversation_type === 'group' ? <Users className="h-5 w-5" /> : initials(profile)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{activeTitle(conversation)}</span>{conversation.lastMessage ? <span className="shrink-0 text-[10px] text-muted-foreground">{formatMessageTime(conversation.lastMessage.created_at)}</span> : null}</span>
                  <span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-muted-foreground">{conversation.lastMessage?.deleted_at ? 'Message removed' : conversation.lastMessage?.body || (conversation.lastMessage ? 'Attachment' : 'Start the conversation')}</span>{conversation.unread ? <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5">{conversation.unread}</Badge> : null}</span>
                </span>
              </button>
            );
          }) : <div className="px-6 py-16 text-center"><MessageCircle className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><p className="font-medium">No conversations yet</p><p className="mt-1 text-sm text-muted-foreground">Start a direct chat or create a group.</p></div>}
        </ScrollArea>
      </section>

      <section className={cn('flex min-w-0 flex-1 flex-col', !activeId && 'hidden md:flex')}>
        {activeConversation ? (
          <>
            <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setActiveId('')} aria-label="Back to conversations"><X className="h-4 w-4" /></Button>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">{activeConversation.conversation_type === 'group' ? <Users className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}</span>
              <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{activeTitle(activeConversation)}</h2><p className="text-xs text-muted-foreground">{activeConversation.participants.length} participant{activeConversation.participants.length === 1 ? '' : 's'}</p></div>
              {canManageGroup ? <Button variant="ghost" size="icon" onClick={openGroupManager} aria-label="Manage group"><Settings className="h-4 w-4" /></Button> : null}
            </header>
            <ScrollArea className="flex-1 bg-secondary/10 p-4">
              {loadingMessages ? <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
                <div className="mx-auto max-w-3xl space-y-3 pb-4">
                  {messages.map((message) => {
                    const mine = message.sender_id === currentUserId;
                    const sender = profiles[message.sender_id];
                    const quoted = message.reply_to_id ? messages.find((item) => item.id === message.reply_to_id) : null;
                    return (
                      <div key={message.id} className={cn('group flex gap-2', mine ? 'justify-end' : 'justify-start')}>
                        {!mine ? <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">{initials(sender)}</span> : null}
                        <div className={cn('max-w-[84%] rounded-2xl px-4 py-2.5 shadow-sm', mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card')}>
                          {!mine ? <p className="mb-1 text-xs font-semibold text-primary">{personName(sender)}</p> : null}
                          {quoted ? <div className={cn('mb-2 rounded-lg border-l-2 px-2 py-1 text-xs', mine ? 'border-primary-foreground/50 bg-black/10' : 'border-primary bg-secondary')}>{quoted.deleted_at ? 'Removed message' : quoted.body || 'Attachment'}</div> : null}
                          {message.deleted_at ? <p className="text-sm italic opacity-70">Message removed</p> : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>}
                          {!message.deleted_at && message.attachments.map((attachment) => <button type="button" key={attachment.id} onClick={() => void openAttachment(attachment)} className={cn('mt-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs', mine ? 'border-white/20 bg-black/10 hover:bg-black/20' : 'bg-secondary hover:bg-accent')}><FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{attachment.file_name}</span><span className="opacity-70">{formatBytes(attachment.size_bytes)}</span><Download className="h-3.5 w-3.5" /></button>)}
                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70"><span>{formatMessageTime(message.created_at)}</span>{message.edited_at ? <span>edited</span> : null}{mine ? <Check className="h-3 w-3" /> : null}</div>
                        </div>
                        {!message.deleted_at ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mt-1 h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align={mine ? 'end' : 'start'}><DropdownMenuItem onClick={() => { setReplyTo(message); setEditing(null); setBody(''); }}><Reply className="mr-2 h-4 w-4" />Reply</DropdownMenuItem>{mine ? <><DropdownMenuItem onClick={() => { setEditing(message); setReplyTo(null); setBody(message.body || ''); }}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void softDeleteMessage(message)}><Trash2 className="mr-2 h-4 w-4" />Remove</DropdownMenuItem></> : null}</DropdownMenuContent></DropdownMenu> : null}
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              )}
            </ScrollArea>
            <footer className="shrink-0 border-t bg-card p-3 sm:p-4">
              <div className="mx-auto max-w-3xl space-y-2">
                {replyMessage ? <div className="flex items-center justify-between rounded-lg border-l-4 border-primary bg-secondary px-3 py-2 text-xs"><span className="min-w-0"><strong>{editing ? 'Editing message' : `Replying to ${personName(profiles[replyMessage.sender_id])}`}</strong><span className="ml-2 truncate text-muted-foreground">{replyMessage.body || 'Attachment'}</span></span><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setReplyTo(null); setEditing(null); setBody(''); }}><X className="h-3.5 w-3.5" /></Button></div> : null}
                {files.length ? <div className="flex flex-wrap gap-2">{files.map((file, index) => <Badge key={`${file.name}-${index}`} variant="secondary" className="gap-1 py-1"><Paperclip className="h-3 w-3" />{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}><X className="h-3 w-3" /></button></Badge>)}</div> : null}
                <div className="flex items-end gap-2">
                  {!editing ? <Label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border hover:bg-accent" aria-label="Attach files"><Paperclip className="h-4 w-4" /><Input type="file" multiple className="hidden" onChange={(event) => setFiles(Array.from(event.target.files || []))} /></Label> : null}
                  <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={editing ? 'Edit your message' : 'Write a message…'} className="min-h-10 resize-none" rows={1} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} />
                  <Button size="icon" className="h-10 w-10 shrink-0" disabled={sending || (!body.trim() && !files.length)} onClick={() => void sendMessage()} aria-label={editing ? 'Save message' : 'Send message'}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}</Button>
                </div>
                {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
              </div>
            </footer>
          </>
        ) : <div className="flex flex-1 items-center justify-center p-8 text-center"><div><MessageCircle className="mx-auto mb-4 h-12 w-12 text-primary/40" /><h2 className="text-lg font-semibold">ANSHA Team Chat</h2><p className="mt-1 text-sm text-muted-foreground">Choose a conversation or start a new one.</p><Button className="mt-4" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New conversation</Button></div></div>}
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New conversation</DialogTitle><DialogDescription>Talk privately with one colleague or create an operations group.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-2"><Button type="button" variant={createType === 'direct' ? 'default' : 'outline'} onClick={() => { setCreateType('direct'); setSelectedPeople([]); }}><MessageCircle className="h-4 w-4" />Direct</Button><Button type="button" variant={createType === 'group' ? 'default' : 'outline'} onClick={() => { setCreateType('group'); setSelectedPeople([]); }}><Users className="h-4 w-4" />Group</Button></div>
          {createType === 'group' ? <div className="space-y-1.5"><Label htmlFor="group-name">Group name</Label><Input id="group-name" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Shipping Operations" maxLength={120} /></div> : null}
          <div className="space-y-2"><Label>Select {createType === 'direct' ? 'a colleague' : 'participants'}</Label><ScrollArea className="h-64 rounded-lg border">{colleagues.map((profile) => <label key={profile.id} className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-0 hover:bg-accent"><Checkbox checked={selectedPeople.includes(profile.id)} onCheckedChange={() => togglePerson(profile.id)} /><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials(profile)}</span><span><span className="block text-sm font-medium">{personName(profile)}</span><span className="block text-xs text-muted-foreground">{profile.email}</span></span></label>)}</ScrollArea></div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={creating || !selectedPeople.length || (createType === 'group' && !groupName.trim())} onClick={() => void createConversation()}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Manage group</DialogTitle><DialogDescription>Rename the group and choose who can participate.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="manage-group-name">Group name</Label><Input id="manage-group-name" value={manageName} onChange={(event) => setManageName(event.target.value)} maxLength={120} /></div>
          <div className="space-y-2"><Label>Participants</Label><ScrollArea className="h-64 rounded-lg border">{colleagues.map((profile) => <label key={profile.id} className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-0 hover:bg-accent"><Checkbox checked={managePeople.includes(profile.id)} onCheckedChange={() => setManagePeople((current) => current.includes(profile.id) ? current.filter((id) => id !== profile.id) : [...current, profile.id])} /><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials(profile)}</span><span><span className="block text-sm font-medium">{personName(profile)}</span><span className="block text-xs text-muted-foreground">{profile.email}</span></span></label>)}</ScrollArea><p className="text-xs text-muted-foreground">You remain in groups that you manage.</p></div>
          <DialogFooter><Button variant="outline" onClick={() => setManageOpen(false)}>Cancel</Button><Button disabled={managing || !manageName.trim()} onClick={() => void saveGroup()}>{managing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save group</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

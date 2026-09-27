'use client';
/* eslint-disable @next/next/no-img-element */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  FileText,
  Link2,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Phone,
  Video,
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
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile, ChatConversationLink, ChatLinkEntityType } from '@/lib/types';
import {
  CHAT_LINK_ENTITY_TYPES,
  chatLinkEntityLabel,
  chatLinkHref,
} from '@/lib/chat-links';
import { useAdminPresence } from '@/components/admin/admin-presence-provider';
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
  last_message_at: string | null;
  last_message_preview: string | null;
};

type Participant = {
  conversation_id: string;
  user_id: string;
  is_manager: boolean;
  joined_at: string;
  last_read_at: string | null;
  last_delivered_at: string | null;
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
  links: ChatConversationLink[];
};

type EntityOption = { id: string; label: string; detail?: string };

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function VoiceAttachment({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    void supabase.storage.from('internal-files').createSignedUrl(attachment.storage_path, 3600).then(({ data }) => {
      if (active) setUrl(data?.signedUrl || '');
    });
    return () => { active = false; };
  }, [attachment.storage_path]);
  return url ? <audio controls preload="none" src={url} className="mt-2 w-full max-w-xs" aria-label={attachment.file_name} /> : <span className="mt-2 block text-xs">Loading voice message…</span>;
}

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

function ProfileAvatar({
  profile,
  url,
  className,
  online,
}: {
  profile?: AdminProfile;
  url?: string;
  className?: string;
  online?: boolean;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-primary/10 font-bold text-primary">
        {url ? <img src={url} alt={personName(profile)} className="h-full w-full object-cover" /> : initials(profile)}
      </span>
      {online ? (
        <span
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500"
          aria-label="Online"
          title="Online"
        />
      ) : null}
    </span>
  );
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment';
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  return isToday(date) ? format(date, 'h:mm a') : format(date, 'MMM d, h:mm a');
}

function formatDayLabel(value: string) {
  const date = new Date(value);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMM d');
}

function formatListTime(value: string) {
  const date = new Date(value);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d');
}

function formatBytes(value: number | null) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function messageReceipt(message: Message, participants: Participant[]) {
  const recipients = participants.filter((participant) => participant.user_id !== message.sender_id);
  if (!recipients.length) return { state: 'sent', label: 'Sent' } as const;
  const read = recipients.every((participant) => participant.last_read_at && participant.last_read_at >= message.created_at);
  if (read) return { state: 'read', label: 'Read by everyone' } as const;
  const delivered = recipients.every((participant) => participant.last_delivered_at && participant.last_delivered_at >= message.created_at);
  if (delivered) return { state: 'delivered', label: 'Delivered to everyone' } as const;
  return { state: 'sent', label: 'Sent' } as const;
}

async function searchLinkTargets(entityType: ChatLinkEntityType, query: string): Promise<EntityOption[]> {
  const q = query.trim();
  if (entityType === 'vehicle') {
    let request = supabase.from('vehicles').select('id, title, stock_number, chassis_number').order('created_at', { ascending: false }).limit(20);
    if (q) request = request.or(`title.ilike.%${q}%,stock_number.ilike.%${q}%,chassis_number.ilike.%${q}%`);
    const { data } = await request;
    return (data || []).map((row) => ({
      id: row.id as string,
      label: row.title as string,
      detail: (row.stock_number || row.chassis_number || undefined) as string | undefined,
    }));
  }
  if (entityType === 'customer') {
    let request = supabase.from('customers').select('id, full_name, company_name, customer_code').order('full_name').limit(20);
    if (q) request = request.or(`full_name.ilike.%${q}%,company_name.ilike.%${q}%,customer_code.ilike.%${q}%`);
    const { data } = await request;
    return (data || []).map((row) => ({
      id: row.id as string,
      label: (row.company_name || row.full_name) as string,
      detail: row.customer_code as string,
    }));
  }
  if (entityType === 'inquiry') {
    let request = supabase.from('inquiries').select('id, customer_name, message, created_at').order('created_at', { ascending: false }).limit(20);
    if (q) request = request.or(`customer_name.ilike.%${q}%,message.ilike.%${q}%`);
    const { data } = await request;
    return (data || []).map((row) => ({
      id: row.id as string,
      label: `Inquiry: ${row.customer_name}`,
      detail: String(row.message || '').slice(0, 80),
    }));
  }
  if (entityType === 'invoice') {
    let request = supabase.from('invoices').select('id, invoice_number, customer_name').order('created_at', { ascending: false }).limit(20);
    if (q) request = request.or(`invoice_number.ilike.%${q}%,customer_name.ilike.%${q}%`);
    const { data } = await request;
    return (data || []).map((row) => ({
      id: row.id as string,
      label: row.invoice_number as string,
      detail: (row.customer_name || undefined) as string | undefined,
    }));
  }
  let request = supabase.from('workspace_requests').select('id, title, request_type, status').order('created_at', { ascending: false }).limit(20);
  if (q) request = request.ilike('title', `%${q}%`);
  const { data } = await request;
  return (data || []).map((row) => ({
    id: row.id as string,
    label: row.title as string,
    detail: `${row.request_type} · ${row.status}`,
  }));
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const { isOnline, presenceLabel, setKnownLastSeen } = useAdminPresence();
  const entityFilter = useMemo(() => {
    for (const item of CHAT_LINK_ENTITY_TYPES) {
      const id = searchParams.get(item.value);
      if (id) return { type: item.value, id } as const;
    }
    return null;
  }, [searchParams]);

  const [currentUserId, setCurrentUserId] = useState('');
  const [profiles, setProfiles] = useState<Record<string, AdminProfile>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
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
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkType, setLinkType] = useState<ChatLinkEntityType>(entityFilter?.type || 'vehicle');
  const [linkQuery, setLinkQuery] = useState('');
  const [linkOptions, setLinkOptions] = useState<EntityOption[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialConversationRef = useRef<string | null>(typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('conversation'));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  useEffect(() => () => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); }, []);

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

    const [{ data: conversationData, error: conversationError }, { data: participantData }, { data: recentData }, { data: linkData }] = await Promise.all([
      supabase.from('chat_conversations').select('*').in('id', ids),
      supabase.from('chat_participants').select('*').in('conversation_id', ids),
      supabase.from('chat_messages').select('id,conversation_id,sender_id,body,reply_to_id,created_at,edited_at,deleted_at').in('conversation_id', ids).order('created_at', { ascending: false }).limit(500),
      supabase.from('chat_conversation_links').select('*').in('conversation_id', ids),
    ]);
    if (conversationError) throw conversationError;

    const allParticipants = (participantData || []) as Participant[];
    const recent = (recentData || []) as Omit<Message, 'attachments'>[];
    const links = (linkData || []) as ChatConversationLink[];
    const summaries = ((conversationData || []) as Conversation[]).map((conversation) => {
      const ownMembership = memberships.find((row) => row.conversation_id === conversation.id);
      const conversationMessages = recent.filter((message) => message.conversation_id === conversation.id);
      const unread = conversationMessages.filter((message) =>
        message.sender_id !== userId && (!ownMembership?.last_read_at || message.created_at > ownMembership.last_read_at)
      ).length;
      const latest = conversationMessages[0] || null;
      const previewBody = conversation.last_message_preview
        ?? (latest?.deleted_at ? 'Message removed' : latest?.body || (latest ? 'Attachment' : null));
      return {
        ...conversation,
        participants: allParticipants.filter((row) => row.conversation_id === conversation.id),
        lastMessage: latest || (previewBody ? {
          id: `${conversation.id}-preview`,
          conversation_id: conversation.id,
          sender_id: '',
          body: previewBody,
          reply_to_id: null,
          created_at: conversation.last_message_at || conversation.updated_at,
          edited_at: null,
          deleted_at: null,
        } : null),
        unread,
        links: links.filter((link) => link.conversation_id === conversation.id),
      };
    }).sort((a, b) => {
      const aTime = a.last_message_at || a.lastMessage?.created_at || a.updated_at;
      const bTime = b.last_message_at || b.lastMessage?.created_at || b.updated_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
    setConversations(summaries);
    const requested = initialConversationRef.current;
    initialConversationRef.current = null;
    setActiveId((current) => requested && summaries.some((item) => item.id === requested)
      ? requested
      : current && summaries.some((item) => item.id === current) ? current : summaries[0]?.id || '');
    const deliveryUpdates = summaries.flatMap((conversation) => {
      const membership = memberships.find((row) => row.conversation_id === conversation.id);
      const latestIncoming = recent.find((message) => message.conversation_id === conversation.id && message.sender_id !== userId);
      if (!latestIncoming || (membership?.last_delivered_at && membership.last_delivered_at >= latestIncoming.created_at)) return [];
      return [supabase.from('chat_participants').update({ last_delivered_at: latestIncoming.created_at }).eq('conversation_id', conversation.id).eq('user_id', userId)];
    });
    if (deliveryUpdates.length) await Promise.all(deliveryUpdates);
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
    const latestMessageAt = rows.at(-1)?.created_at || new Date().toISOString();
    await supabase
      .from('chat_participants')
      .update({ last_delivered_at: latestMessageAt, last_read_at: latestMessageAt })
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
        const profileList = (profileData || []) as AdminProfile[];
        setProfiles(Object.fromEntries(profileList.map((profile) => [profile.id, profile])));
        for (const profile of profileList) {
          setKnownLastSeen(profile.id, profile.last_seen_at ?? null);
        }
        const signed = await Promise.all(profileList.filter((profile) => profile.avatar_url).map(async (profile) => {
          const { data } = await supabase.storage.from('profile-images').createSignedUrl(profile.avatar_url!, 3600);
          return [profile.id, data?.signedUrl || ''] as const;
        }));
        if (active) setAvatarUrls(Object.fromEntries(signed.filter(([, url]) => Boolean(url))));
        await loadConversations(session.user.id);
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : 'Unable to load chat.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadConversations, setKnownLastSeen]);

  useEffect(() => {
    if (!activeId || !currentUserId) return;
    void loadMessages(activeId, currentUserId);
  }, [activeId, currentUserId, loadMessages]);

  useEffect(() => {
    if (!currentUserId) return;
    const topic = `workspace-chat-${currentUserId}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
    if (existing) void supabase.removeChannel(existing);

    const channel = supabase
      .channel(topic)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload) => {
        const changed = (payload.new || payload.old) as { conversation_id?: string };
        void loadConversations(currentUserId);
        if (changed.conversation_id === activeId) void loadMessages(activeId, currentUserId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_participants' }, () => {
        void loadConversations(currentUserId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => {
        void loadConversations(currentUserId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversation_links' }, () => {
        void loadConversations(currentUserId);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeId, currentUserId, loadConversations, loadMessages]);

  useEffect(() => {
    if (!linkOpen) return;
    let active = true;
    setLinkSearching(true);
    const timer = window.setTimeout(() => {
      void searchLinkTargets(linkType, linkQuery).then((options) => {
        if (active) {
          setLinkOptions(options);
          setLinkSearching(false);
        }
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [linkOpen, linkQuery, linkType]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) || null;
  const activeTitle = useCallback((conversation: ConversationSummary) => {
    if (conversation.conversation_type === 'group') return conversation.name || 'Group conversation';
    const other = conversation.participants.find((participant) => participant.user_id !== currentUserId);
    return personName(other ? profiles[other.user_id] : undefined);
  }, [currentUserId, profiles]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const entityMatch = !entityFilter
        || conversation.links.some((link) => link.entity_type === entityFilter.type && link.entity_id === entityFilter.id);
      const searchMatch = !query
        || activeTitle(conversation).toLowerCase().includes(query)
        || conversation.links.some((link) => chatLinkEntityLabel(link.entity_type).toLowerCase().includes(query));
      return entityMatch && searchMatch;
    });
  }, [activeTitle, conversations, entityFilter, search]);

  useEffect(() => {
    if (!entityFilter || !filteredConversations.length) return;
    if (!filteredConversations.some((item) => item.id === activeId)) {
      setActiveId(filteredConversations[0].id);
    }
  }, [activeId, entityFilter, filteredConversations]);

  async function shareLocation() {
    if (!navigator.geolocation) return setNotice('Location is unavailable.');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const latitude = coords.latitude.toFixed(6);
      const longitude = coords.longitude.toFixed(6);
      const { error } = await supabase.from('chat_messages').insert({
        conversation_id: activeId, sender_id: currentUserId,
        body: `📍 Location: https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`,
      });
      if (error) setNotice(error.message);
      else await loadMessages(activeId, currentUserId);
    }, (error) => setNotice(error.message), { timeout: 15000, maximumAge: 60000 });
  }

  async function toggleRecording() {
    if (recorderRef.current) { recorderRef.current.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        const type = recorder.mimeType || 'audio/webm';
        const file = new File(chunks, `voice-${Date.now()}.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type });
        if (file.size > MAX_ATTACHMENT_BYTES) setNotice('Voice message exceeds 25 MB.');
        else if (file.size) setFiles((current) => [...current, file]);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Microphone access failed.'); }
  }

  async function inviteToCall(kind: 'voice' | 'video') {
    if (!activeOther) return;
    const room = `ANSHA-${crypto.randomUUID().replaceAll('-', '')}`;
    const base = process.env.NEXT_PUBLIC_TEAM_MEETING_BASE_URL || 'https://meet.jit.si';
    const url = `${base.replace(/\/$/, '')}/${room}#config.startWithVideoMuted=${kind === 'voice'}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    const { error } = await supabase.from('chat_messages').insert({
      conversation_id: activeId, sender_id: currentUserId,
      body: `${kind === 'voice' ? '📞 Voice' : '🎥 Video'} call invitation: ${url}`,
    });
    if (error) return setNotice(error.message);
    await loadMessages(activeId, currentUserId);
  }

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
      const conversationId = data as string;
      if (entityFilter) {
        const { error: linkError } = await supabase.rpc('link_chat_conversation', {
          p_conversation_id: conversationId,
          p_entity_type: entityFilter.type,
          p_entity_id: entityFilter.id,
        });
        if (linkError) setNotice(linkError.message);
      }
      setCreateOpen(false);
      setGroupName('');
      setSelectedPeople([]);
      await loadConversations(currentUserId);
      setActiveId(conversationId);
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

  async function addLink(entityId: string) {
    if (!activeConversation || linking) return;
    setLinking(true);
    setNotice('');
    try {
      const { error } = await supabase.rpc('link_chat_conversation', {
        p_conversation_id: activeConversation.id,
        p_entity_type: linkType,
        p_entity_id: entityId,
      });
      if (error) throw error;
      setLinkOpen(false);
      setLinkQuery('');
      await loadConversations(currentUserId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to link record.');
    } finally {
      setLinking(false);
    }
  }

  async function removeLink(linkId: string) {
    const { error } = await supabase.rpc('unlink_chat_conversation', { p_link_id: linkId });
    if (error) setNotice(error.message);
    else await loadConversations(currentUserId);
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }

  const colleagues = Object.values(profiles).filter((profile) => profile.id !== currentUserId);
  const replyMessage = replyTo || editing;
  const canManageGroup = Boolean(activeConversation
    && activeConversation.conversation_type === 'group'
    && (activeConversation.created_by === currentUserId || activeConversation.participants.some((participant) => participant.user_id === currentUserId && participant.is_manager)));

  const activeOther = activeConversation?.conversation_type === 'direct'
    ? activeConversation.participants.find((participant) => participant.user_id !== currentUserId)
    : undefined;
  const activeOtherProfile = activeOther ? profiles[activeOther.user_id] : undefined;
  const hasSearch = Boolean(search.trim());

  return (
    <div className="-m-4 flex h-[calc(100dvh-7.5rem)] min-h-[560px] overflow-hidden border-y border-border/80 bg-background md:-m-8 md:h-[calc(100dvh-4.75rem)]">
      <section className={cn('flex w-full shrink-0 flex-col border-r border-border/80 bg-card md:w-[22rem] lg:w-[26rem]', activeId && 'hidden md:flex')}>
        <div className="shrink-0 space-y-3 border-b border-border/80 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Team chat</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {conversations.length
                  ? `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`
                  : 'Direct messages and ops groups'}
              </p>
            </div>
            <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>
          {entityFilter ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-accent/20 bg-accent/5 px-3 py-2 text-xs">
              <span className="font-medium text-foreground">Linked to {chatLinkEntityLabel(entityFilter.type)}</span>
              <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-accent hover:text-accent">
                <Link href="/admin/chat">Clear</Link>
              </Button>
            </div>
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or link…"
              className="h-10 bg-background pl-9"
            />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {filteredConversations.length ? filteredConversations.map((conversation) => {
            const other = conversation.participants.find((participant) => participant.user_id !== currentUserId);
            const profile = other ? profiles[other.user_id] : undefined;
            const mine = conversation.lastMessage?.sender_id === currentUserId;
            const previewText = conversation.last_message_preview
              || (conversation.lastMessage?.deleted_at ? 'Message removed' : conversation.lastMessage?.body)
              || (conversation.lastMessage ? 'Attachment' : 'No messages yet');
            const preview = mine && conversation.lastMessage ? `You: ${previewText}` : previewText;
            const previewTime = conversation.last_message_at || conversation.lastMessage?.created_at;
            const selected = activeId === conversation.id;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveId(conversation.id)}
                className={cn(
                  'relative flex w-full items-start gap-3 border-b border-border/60 px-4 py-3.5 text-left transition-colors',
                  'hover:bg-secondary/60',
                  selected && 'bg-secondary/80',
                  conversation.unread > 0 && !selected && 'bg-accent/[0.04]'
                )}
              >
                {conversation.unread > 0 ? (
                  <span className="absolute inset-y-3 left-0 w-0.5 rounded-r bg-accent" aria-hidden />
                ) : null}
                <span className="shrink-0">
                  {conversation.conversation_type === 'group' ? (
                    <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Users className="h-5 w-5" />
                      {conversation.participants.some(
                        (participant) => participant.user_id !== currentUserId && isOnline(participant.user_id)
                      ) ? (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" aria-hidden />
                      ) : null}
                    </span>
                  ) : (
                    <ProfileAvatar
                      profile={profile}
                      url={profile ? avatarUrls[profile.id] : ''}
                      className="h-11 w-11 text-xs"
                      online={Boolean(profile && isOnline(profile.id))}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn('truncate text-sm', conversation.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>
                      {activeTitle(conversation)}
                    </span>
                    {previewTime ? (
                      <span className={cn('shrink-0 text-[11px] tabular-nums', conversation.unread ? 'font-medium text-accent' : 'text-muted-foreground')}>
                        {formatListTime(previewTime)}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className={cn('truncate text-[13px] leading-snug', conversation.unread ? 'text-foreground/90' : 'text-muted-foreground')}>
                      {preview}
                    </span>
                    {conversation.unread ? (
                      <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-md bg-accent px-1.5 text-[11px] font-semibold text-white">
                        {conversation.unread > 99 ? '99+' : conversation.unread}
                      </Badge>
                    ) : null}
                  </span>
                  {conversation.links.length ? (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {conversation.links.slice(0, 2).map((link) => (
                        <Badge key={link.id} variant="outline" className="border-border/80 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                          {chatLinkEntityLabel(link.entity_type)}
                        </Badge>
                      ))}
                      {conversation.links.length > 2 ? (
                        <Badge variant="outline" className="border-border/80 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                          +{conversation.links.length - 2}
                        </Badge>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          }) : (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <MessageCircle className="h-7 w-7" />
              </span>
              <p className="font-display text-base font-semibold text-foreground">
                {hasSearch || entityFilter ? 'No matching chats' : 'No conversations yet'}
              </p>
              <p className="mt-1.5 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
                {entityFilter
                  ? 'Nothing is linked to this record yet. Start a chat to attach it.'
                  : hasSearch
                    ? 'Try another name, or clear the search.'
                    : 'Message a colleague or create a group for shipping, sales, or ops.'}
              </p>
              {!hasSearch ? (
                <Button className="mt-5" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  New conversation
                </Button>
              ) : (
                <Button className="mt-5" size="sm" variant="outline" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              )}
            </div>
          )}
        </ScrollArea>
      </section>

      <section className={cn('flex min-w-0 flex-1 flex-col bg-background', !activeId && 'hidden md:flex')}>
        {activeConversation ? (
          <>
            <header className="flex shrink-0 flex-col gap-2 border-b border-border/80 bg-card px-3 py-3 sm:px-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 md:hidden" onClick={() => setActiveId('')} aria-label="Back to conversations">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                {activeConversation.conversation_type === 'group' ? (
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Users className="h-5 w-5" />
                    {activeConversation.participants.some(
                      (participant) => participant.user_id !== currentUserId && isOnline(participant.user_id)
                    ) ? (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" aria-hidden />
                    ) : null}
                  </span>
                ) : (
                  <ProfileAvatar
                    profile={activeOtherProfile}
                    url={activeOtherProfile ? avatarUrls[activeOtherProfile.id] : ''}
                    className="h-10 w-10 shrink-0 text-xs"
                    online={Boolean(activeOtherProfile && isOnline(activeOtherProfile.id))}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-base font-semibold tracking-tight">{activeTitle(activeConversation)}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {activeConversation.conversation_type === 'group'
                      ? (() => {
                          const onlineCount = activeConversation.participants.filter(
                            (participant) => participant.user_id !== currentUserId && isOnline(participant.user_id)
                          ).length;
                          const total = activeConversation.participants.length;
                          return onlineCount
                            ? `${total} participants · ${onlineCount} online`
                            : `${total} participants`;
                        })()
                      : presenceLabel(activeOtherProfile?.id, activeOtherProfile?.last_seen_at ?? null)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {activeOther ? <>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => void inviteToCall('voice')} aria-label="Start voice call"><Phone className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => void inviteToCall('video')} aria-label="Start video call"><Video className="h-4 w-4" /></Button>
                  </> : null}
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setLinkType(entityFilter?.type || 'vehicle'); setLinkOpen(true); }} aria-label="Link record">
                    <Link2 className="h-4 w-4" />
                  </Button>
                  {canManageGroup ? (
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={openGroupManager} aria-label="Manage group">
                      <Settings className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              {activeConversation.links.length ? (
                <div className="flex flex-wrap gap-1.5 pl-11 md:pl-0">
                  {activeConversation.links.map((link) => (
                    <Badge key={link.id} variant="secondary" className="gap-1.5 py-1 pl-2 pr-1 font-normal">
                      <Link href={chatLinkHref(link.entity_type, link.entity_id)} className="hover:underline">
                        {chatLinkEntityLabel(link.entity_type)}
                      </Link>
                      <button
                        type="button"
                        className="rounded p-0.5 hover:bg-background/80"
                        onClick={() => void removeLink(link.id)}
                        aria-label={`Unlink ${chatLinkEntityLabel(link.entity_type)}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </header>
            <ScrollArea className="min-h-0 flex-1 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border)/0.7)_1px,transparent_0)] [background-size:20px_20px]">
              {loadingMessages ? (
                <div className="flex h-full min-h-[12rem] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full min-h-[14rem] flex-col items-center justify-center px-6 py-12 text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border/80">
                    <MessageCircle className="h-6 w-6" />
                  </span>
                  <p className="font-display text-base font-semibold">Start the conversation</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Say hello, share a file, or link a vehicle, invoice, or request from the header.
                  </p>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-1 px-3 py-4 sm:px-5 sm:py-5">
                  {messages.map((message, index) => {
                    const mine = message.sender_id === currentUserId;
                    const sender = profiles[message.sender_id];
                    const quoted = message.reply_to_id ? messages.find((item) => item.id === message.reply_to_id) : null;
                    const receipt = mine ? messageReceipt(message, activeConversation.participants) : null;
                    const prev = messages[index - 1];
                    const showDay = !prev || !isSameDay(new Date(prev.created_at), new Date(message.created_at));
                    const showAvatar = !mine && (!prev || prev.sender_id !== message.sender_id || showDay);
                    return (
                      <div key={message.id}>
                        {showDay ? (
                          <div className="flex items-center justify-center py-3">
                            <span className="rounded-md border border-border/70 bg-card/95 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                              {formatDayLabel(message.created_at)}
                            </span>
                          </div>
                        ) : null}
                        <div className={cn('group flex gap-2', mine ? 'justify-end' : 'justify-start', !showDay && 'mt-1.5')}>
                          {!mine ? (
                            showAvatar ? (
                              <ProfileAvatar profile={sender} url={sender ? avatarUrls[sender.id] : ''} className="mt-1 h-8 w-8 text-[10px]" />
                            ) : (
                              <span className="w-8 shrink-0" aria-hidden />
                            )
                          ) : null}
                          <div
                            className={cn(
                              'max-w-[min(84%,28rem)] px-3.5 py-2 shadow-sm',
                              mine
                                ? 'rounded-2xl rounded-br-md bg-accent text-white'
                                : 'rounded-2xl rounded-bl-md border border-border/80 bg-card text-foreground'
                            )}
                          >
                            {!mine && showAvatar ? (
                              <p className="mb-1 text-xs font-semibold text-accent">{personName(sender)}</p>
                            ) : null}
                            {quoted ? (
                              <div className={cn('mb-2 rounded-md border-l-2 px-2 py-1 text-xs', mine ? 'border-white/50 bg-black/10' : 'border-accent/70 bg-secondary/80')}>
                                {quoted.deleted_at ? 'Removed message' : quoted.body || 'Attachment'}
                              </div>
                            ) : null}
                            {message.deleted_at ? (
                              <p className="text-sm italic opacity-70">Message removed</p>
                            ) : message.body?.startsWith('📍 Location: https://www.openstreetmap.org/') ? (
                              <a href={message.body.slice('📍 Location: '.length)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm underline"><MapPin className="h-4 w-4" /> View shared location</a>
                            ) : /^(📞 Voice|🎥 Video) call invitation: https:\/\//.test(message.body || '') ? (
                              <a href={(message.body || '').split('call invitation: ')[1]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm underline">{message.body?.startsWith('📞') ? <Phone className="h-4 w-4" /> : <Video className="h-4 w-4" />} Join call</a>
                            ) : (
                              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{message.body}</p>
                            )}
                            {!message.deleted_at && message.attachments.map((attachment) => (
                              attachment.mime_type?.startsWith('audio/') ? <VoiceAttachment key={attachment.id} attachment={attachment} /> : <button
                                type="button"
                                key={attachment.id}
                                onClick={() => void openAttachment(attachment)}
                                className={cn(
                                  'mt-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs',
                                  mine ? 'border-white/20 bg-black/10 hover:bg-black/20' : 'border-border/70 bg-secondary/70 hover:bg-secondary'
                                )}
                              >
                                <FileText className="h-4 w-4 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{attachment.file_name}</span>
                                <span className="opacity-70">{formatBytes(attachment.size_bytes)}</span>
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            ))}
                            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80">
                              <span>{formatMessageTime(message.created_at)}</span>
                              {message.edited_at ? <span>edited</span> : null}
                              {receipt?.state === 'sent' ? (
                                <Check className="h-3 w-3" aria-label={receipt.label} />
                              ) : receipt ? (
                                <CheckCheck className={cn('h-3.5 w-3.5', receipt.state === 'read' && 'text-sky-200')} aria-label={receipt.label} />
                              ) : null}
                            </div>
                          </div>
                          {!message.deleted_at ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="mt-1 h-8 w-8 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align={mine ? 'end' : 'start'}>
                                <DropdownMenuItem onClick={() => { setReplyTo(message); setEditing(null); setBody(''); }}>
                                  <Reply className="mr-2 h-4 w-4" />Reply
                                </DropdownMenuItem>
                                {mine ? (
                                  <>
                                    <DropdownMenuItem onClick={() => { setEditing(message); setReplyTo(null); setBody(message.body || ''); }}>
                                      <Pencil className="mr-2 h-4 w-4" />Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void softDeleteMessage(message)}>
                                      <Trash2 className="mr-2 h-4 w-4" />Remove
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              )}
            </ScrollArea>
            <footer className="shrink-0 border-t border-border/80 bg-card px-3 py-3 sm:px-4">
              <div className="mx-auto max-w-3xl space-y-2">
                {replyMessage ? (
                  <div className="flex items-start justify-between gap-2 rounded-md border border-border/80 border-l-4 border-l-accent bg-secondary/50 px-3 py-2 text-xs">
                    <span className="min-w-0">
                      <strong className="block text-foreground">{editing ? 'Editing message' : `Replying to ${personName(profiles[replyMessage.sender_id])}`}</strong>
                      <span className="mt-0.5 line-clamp-2 text-muted-foreground">{replyMessage.body || 'Attachment'}</span>
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setReplyTo(null); setEditing(null); setBody(''); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
                {files.length ? (
                  <div className="flex flex-wrap gap-2">
                    {files.map((file, index) => (
                      <Badge key={`${file.name}-${index}`} variant="secondary" className="gap-1.5 py-1.5 font-normal">
                        <Paperclip className="h-3 w-3" />
                        <span className="max-w-[10rem] truncate">{file.name}</span>
                        <button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-end gap-2 rounded-xl border border-border/80 bg-background p-2 shadow-sm focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/15">
                  {!editing ? (
                    <Label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="Attach files">
                      <Paperclip className="h-4 w-4" />
                      <Input type="file" multiple className="hidden" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
                    </Label>
                  ) : null}
                  {!editing ? <>
                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => void toggleRecording()} aria-label={recording ? 'Stop voice recording' : 'Record voice message'}>{recording ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4" />}</Button>
                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => void shareLocation()} aria-label="Share current location"><MapPin className="h-4 w-4" /></Button>
                  </> : null}
                  <Textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder={editing ? 'Edit your message…' : 'Write a message…'}
                    className="max-h-36 min-h-[2.5rem] flex-1 resize-none border-0 bg-transparent px-1 py-2.5 text-[15px] shadow-none focus-visible:ring-0"
                    rows={1}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-lg bg-accent text-white hover:bg-accent/90"
                    disabled={sending || (!body.trim() && !files.length)}
                    onClick={() => void sendMessage()}
                    aria-label={editing ? 'Save message' : 'Send message'}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
              </div>
            </footer>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-card/40 p-8 text-center">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/5 text-primary ring-1 ring-border/80">
              <MessageCircle className="h-8 w-8" />
            </span>
            <h2 className="font-display text-xl font-semibold tracking-tight">ANSHA Team Chat</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Pick a conversation from the list, or start a new direct message or group.
            </p>
            <Button className="mt-5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New conversation
            </Button>
          </div>
        )}
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New conversation</DialogTitle>
            <DialogDescription>
              Talk privately with one colleague or create an operations group.
              {entityFilter ? ` New chats will also link to this ${chatLinkEntityLabel(entityFilter.type).toLowerCase()}.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={createType === 'direct' ? 'default' : 'outline'} onClick={() => { setCreateType('direct'); setSelectedPeople([]); }}><MessageCircle className="h-4 w-4" />Direct</Button>
            <Button type="button" variant={createType === 'group' ? 'default' : 'outline'} onClick={() => { setCreateType('group'); setSelectedPeople([]); }}><Users className="h-4 w-4" />Group</Button>
          </div>
          {createType === 'group' ? (
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Group name</Label>
              <Input id="group-name" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Shipping Operations" maxLength={120} />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Select {createType === 'direct' ? 'a colleague' : 'participants'}</Label>
            <ScrollArea className="h-64 rounded-lg border">
              {colleagues.map((profile) => (
                <label key={profile.id} className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-0 hover:bg-accent">
                  <Checkbox checked={selectedPeople.includes(profile.id)} onCheckedChange={() => togglePerson(profile.id)} />
                  <ProfileAvatar
                    profile={profile}
                    url={avatarUrls[profile.id]}
                    className="h-9 w-9 text-xs"
                    online={isOnline(profile.id)}
                  />
                  <span>
                    <span className="block text-sm font-medium">{personName(profile)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {presenceLabel(profile.id, profile.last_seen_at ?? null)}
                      {profile.email ? ` · ${profile.email}` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={creating || !selectedPeople.length || (createType === 'group' && !groupName.trim())} onClick={() => void createConversation()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Manage group</DialogTitle>
            <DialogDescription>Rename the group and choose who can participate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="manage-group-name">Group name</Label>
            <Input id="manage-group-name" value={manageName} onChange={(event) => setManageName(event.target.value)} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label>Participants</Label>
            <ScrollArea className="h-64 rounded-lg border">
              {colleagues.map((profile) => (
                <label key={profile.id} className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-0 hover:bg-accent">
                  <Checkbox checked={managePeople.includes(profile.id)} onCheckedChange={() => setManagePeople((current) => (current.includes(profile.id) ? current.filter((id) => id !== profile.id) : [...current, profile.id]))} />
                  <ProfileAvatar
                    profile={profile}
                    url={avatarUrls[profile.id]}
                    className="h-9 w-9 text-xs"
                    online={isOnline(profile.id)}
                  />
                  <span>
                    <span className="block text-sm font-medium">{personName(profile)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {presenceLabel(profile.id, profile.last_seen_at ?? null)}
                      {profile.email ? ` · ${profile.email}` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </ScrollArea>
            <p className="text-xs text-muted-foreground">You remain in groups that you manage.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>Cancel</Button>
            <Button disabled={managing || !manageName.trim()} onClick={() => void saveGroup()}>
              {managing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Link record</DialogTitle>
            <DialogDescription>Attach this conversation to a vehicle, customer, inquiry, invoice, or request. Messaging stays in Team Chat.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="link-type">Record type</Label>
            <select
              id="link-type"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={linkType}
              onChange={(event) => {
                setLinkType(event.target.value as ChatLinkEntityType);
                setLinkQuery('');
              }}
            >
              {CHAT_LINK_ENTITY_TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={linkQuery} onChange={(event) => setLinkQuery(event.target.value)} placeholder={`Search ${chatLinkEntityLabel(linkType).toLowerCase()}s`} className="pl-9" />
          </div>
          <ScrollArea className="h-64 rounded-lg border">
            {linkSearching ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : linkOptions.length ? linkOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className="flex w-full items-start gap-3 border-b p-3 text-left last:border-0 hover:bg-accent disabled:opacity-50"
                disabled={linking || Boolean(activeConversation?.links.some((link) => link.entity_type === linkType && link.entity_id === option.id))}
                onClick={() => void addLink(option.id)}
              >
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  {option.detail ? <span className="block text-xs text-muted-foreground">{option.detail}</span> : null}
                </span>
              </button>
            )) : <p className="p-4 text-sm text-muted-foreground">No matching records.</p>}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

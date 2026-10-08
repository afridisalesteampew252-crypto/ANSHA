import type { SupabaseClient } from '@supabase/supabase-js';

export type ChatUnreadMembership = { conversation_id: string; last_read_at: string | null };
export type ChatUnreadCounts = { total: number; byConversation: Record<string, number>; memberships: ChatUnreadMembership[] };

const PAGE_SIZE = 500;
const CONCURRENCY = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exact server counts, under the caller's existing RLS, without downloading message histories. */
export async function fetchChatUnreadCounts(client: SupabaseClient, userId: string, signal?: AbortSignal): Promise<ChatUnreadCounts> {
  if (!UUID.test(userId)) throw new Error('Sign in before loading unread chats.');
  const memberships: ChatUnreadMembership[] = [];
  const ids = new Set<string>();
  let expected: number | null = null;
  do {
    signal?.throwIfAborted();
    let request = client.from('chat_participants')
      .select('conversation_id,last_read_at', { count: 'exact' }).eq('user_id', userId)
      .order('conversation_id', { ascending: true }).range(memberships.length, memberships.length + PAGE_SIZE - 1);
    if (signal) request = request.abortSignal(signal);
    const { data, error, count } = await request;
    if (error) throw new Error('Unread chat memberships could not be loaded. Please retry.');
    if (!Array.isArray(data) || count === null || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Unread chat memberships could not be verified. Please retry.');
    }
    if ((expected !== null && count !== expected) || (!data.length && memberships.length < count)) {
      throw new Error('Chat memberships changed while loading. Please retry.');
    }
    expected = count;
    for (const row of data) {
      if (!UUID.test(row.conversation_id) || ids.has(row.conversation_id) ||
          (row.last_read_at !== null && (typeof row.last_read_at !== 'string' || !Number.isFinite(Date.parse(row.last_read_at))))) {
        throw new Error('Unread chat membership data is invalid. Please retry.');
      }
      ids.add(row.conversation_id);
      memberships.push({ conversation_id: row.conversation_id, last_read_at: row.last_read_at });
    }
    if (memberships.length > count) throw new Error('Chat memberships changed while loading. Please retry.');
  } while (memberships.length < expected);

  const byConversation: Record<string, number> = {};
  let next = 0;
  let failure: Error | null = null;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, memberships.length) }, async () => {
    while (next < memberships.length && !failure) {
      const membership = memberships[next++];
      try {
        signal?.throwIfAborted();
        let request = client.from('chat_messages').select('id', { count: 'exact', head: true })
          .eq('conversation_id', membership.conversation_id).neq('sender_id', userId);
        if (membership.last_read_at) request = request.gt('created_at', membership.last_read_at);
        if (signal) request = request.abortSignal(signal);
        const { count, error } = await request;
        if (error || count === null || !Number.isSafeInteger(count) || count < 0) {
          throw new Error('Unread chats could not be counted. Please retry.');
        }
        byConversation[membership.conversation_id] = count;
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error('Unread chats could not be counted. Please retry.');
      }
    }
  }));
  signal?.throwIfAborted();
  if (failure) throw failure;
  const total = Object.values(byConversation).reduce((sum, count) => sum + count, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Unread chat total could not be verified. Please retry.');
  return { total, byConversation, memberships };
}

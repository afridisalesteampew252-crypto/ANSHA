'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { NotificationAudience, RecipientNotification } from '@/lib/notifications';

type Snapshot = { items: RecipientNotification[]; unread: number; loading: boolean; error: string };
type Store = {
  snapshot: Snapshot;
  listeners: Set<() => void>;
  lastLoadedAt: number;
  inFlight: Promise<void> | null;
  epoch: number;
  teardown: (() => void) | null;
};
const empty: Snapshot = { items: [], unread: 0, loading: true, error: '' };
const signedOut: Snapshot = { ...empty, loading: false };
const stores = new Map<string, Store>();
const safetyPollMs = 5 * 60_000;

function getStore(audience: NotificationAudience, userId: string): Store {
  const key = `${audience}:${userId}`;
  let store = stores.get(key);
  if (!store) {
    store = { snapshot: empty, listeners: new Set(), lastLoadedAt: 0, inFlight: null, epoch: 0, teardown: null };
    stores.set(key, store);
  }
  return store;
}

function publish(store: Store, snapshot: Snapshot) {
  store.snapshot = snapshot;
  store.listeners.forEach((listener) => listener());
}

async function load(audience: NotificationAudience, userId: string, maxAgeMs = 0) {
  if (!userId) return;
  const store = getStore(audience, userId);
  if (store.inFlight) return store.inFlight;
  if (maxAgeMs && Date.now() - store.lastLoadedAt < maxAgeMs) return;
  const epoch = store.epoch;
  const table = audience === 'admin' ? 'admin_notifications' : 'customer_notifications';
  store.inFlight = (async () => {
    try {
      const [list, count] = await Promise.all([
        supabase.from(table).select('id,notification_type,title,body,href,read_at,created_at')
          .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(30),
        supabase.from(table).select('id', { count: 'exact', head: true })
          .eq('recipient_id', userId).is('read_at', null),
      ]);
      if (store.epoch !== epoch || !store.listeners.size) return;
      if (list.error || count.error) throw new Error('Notifications could not be loaded.');
      store.lastLoadedAt = Date.now();
      publish(store, { items: (list.data || []) as RecipientNotification[], unread: count.count || 0, loading: false, error: '' });
    } catch {
      if (store.epoch === epoch && store.listeners.size) {
        publish(store, { ...store.snapshot, loading: false, error: 'Notifications could not be loaded.' });
      }
    } finally {
      if (store.epoch === epoch) store.inFlight = null;
    }
  })();
  return store.inFlight;
}

function start(audience: NotificationAudience, userId: string, store: Store) {
  let debounce: number | undefined;
  const table = audience === 'admin' ? 'admin_notifications' : 'customer_notifications';
  const scheduleLoad = () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void load(audience, userId), 350);
  };
  const channel = supabase.channel(`notifications-${audience}-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, filter: `recipient_id=eq.${userId}` }, scheduleLoad)
    .subscribe((status) => { if (status === 'SUBSCRIBED') scheduleLoad(); });
  const refresh = () => { if (!document.hidden) void load(audience, userId, 60_000); };
  const poll = window.setInterval(() => { if (!document.hidden) void load(audience, userId, safetyPollMs - 5_000); }, safetyPollMs);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('ansha:notification', scheduleLoad);
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session || session.user.id !== userId) {
      store.epoch += 1;
      store.inFlight = null;
      store.lastLoadedAt = 0;
      publish(store, signedOut);
    }
  });
  void load(audience, userId);
  store.teardown = () => {
    window.clearTimeout(debounce);
    window.clearInterval(poll);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('ansha:notification', scheduleLoad);
    subscription.unsubscribe();
    void supabase.removeChannel(channel);
    store.epoch += 1;
    store.inFlight = null;
    store.lastLoadedAt = 0;
    store.snapshot = empty;
  };
}

/** Mobile/desktop bells share one recipient-filtered channel and one batched refresh. */
export function useRecipientNotifications(audience: NotificationAudience, userId: string) {
  const subscribe = useCallback((listener: () => void) => {
    if (!userId) return () => {};
    const store = getStore(audience, userId);
    store.listeners.add(listener);
    if (store.listeners.size === 1) start(audience, userId, store);
    return () => {
      store.listeners.delete(listener);
      if (!store.listeners.size) {
        store.teardown?.();
        store.teardown = null;
        stores.delete(`${audience}:${userId}`);
      }
    };
  }, [audience, userId]);
  const getSnapshot = useCallback(() => userId ? getStore(audience, userId).snapshot : signedOut, [audience, userId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => empty);
  const reload = useCallback((maxAgeMs = 0) => load(audience, userId, maxAgeMs), [audience, userId]);
  const markRead = useCallback(async (id?: string) => {
    if (!userId) return;
    const table = audience === 'admin' ? 'admin_notifications' : 'customer_notifications';
    let query = supabase.from(table).update({ read_at: new Date().toISOString() }).eq('recipient_id', userId).is('read_at', null);
    if (id) query = query.eq('id', id);
    const { error } = await query;
    if (error) throw new Error('Could not mark notifications as read.');
    await reload();
  }, [audience, userId, reload]);
  return { ...snapshot, reload, markRead };
}

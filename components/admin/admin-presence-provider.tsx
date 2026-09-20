'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { supabase } from '@/lib/supabase/client';

const PRESENCE_CHANNEL = 'workspace-presence';
const HEARTBEAT_MS = 45_000;

type PresenceMeta = {
  user_id: string;
  online_at?: string;
};

type AdminPresenceContextValue = {
  onlineIds: ReadonlySet<string>;
  lastSeenById: Record<string, string | null>;
  isOnline: (userId: string | undefined | null) => boolean;
  presenceLabel: (userId: string | undefined | null, fallbackLastSeen?: string | null) => string;
  setKnownLastSeen: (userId: string, lastSeenAt: string | null | undefined) => void;
};

const AdminPresenceContext = createContext<AdminPresenceContextValue | null>(null);

function collectOnlineIds(state: Record<string, PresenceMeta[] | undefined>) {
  const ids = new Set<string>();
  for (const [key, entries] of Object.entries(state)) {
    if (entries?.length) {
      ids.add(key);
      for (const entry of entries) {
        if (entry?.user_id) ids.add(entry.user_id);
      }
    }
  }
  return ids;
}

function formatPresenceLabel(online: boolean, lastSeenAt: string | null | undefined) {
  if (online) return 'Active now';
  if (!lastSeenAt) return 'Offline';
  const date = new Date(lastSeenAt);
  if (Number.isNaN(date.getTime())) return 'Offline';
  const ageMs = Date.now() - date.getTime();
  if (ageMs < 60_000) return 'Just now';
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  try {
    return `${formatDistanceToNowStrict(date, { addSuffix: false })} ago`;
  } catch {
    return 'Offline';
  }
}

export function AdminPresenceProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(() => new Set());
  const [lastSeenById, setLastSeenById] = useState<Record<string, string | null>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const previousOnlineRef = useRef<ReadonlySet<string>>(new Set());

  const touchLastSeen = useCallback(async () => {
    const { data, error } = await supabase.rpc('touch_admin_last_seen');
    if (error) {
      await supabase
        .from('admin_profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', userId);
      return;
    }
    if (typeof data === 'string') {
      setLastSeenById((current) => ({ ...current, [userId]: data }));
    }
  }, [userId]);

  const setKnownLastSeen = useCallback((id: string, lastSeenAt: string | null | undefined) => {
    if (!id) return;
    setLastSeenById((current) => {
      if ((current[id] ?? null) === (lastSeenAt ?? null)) return current;
      return { ...current, [id]: lastSeenAt ?? null };
    });
  }, []);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const topic = PRESENCE_CHANNEL;
    const existing = supabase.getChannels().find((channel) => channel.topic === `realtime:${topic}`);
    if (existing) void supabase.removeChannel(existing);

    const channel = supabase.channel(topic, {
      config: {
        presence: { key: userId },
      },
    });
    channelRef.current = channel;

    const syncPresence = () => {
      if (cancelled) return;
      const next = collectOnlineIds(channel.presenceState() as Record<string, PresenceMeta[] | undefined>);
      const previous = previousOnlineRef.current;
      const nowIso = new Date().toISOString();
      const leftIds = Array.from(previous).filter((id) => !next.has(id) && id !== userId);
      previousOnlineRef.current = next;
      setOnlineIds(next);
      if (leftIds.length) {
        setLastSeenById((current) => {
          const updated = { ...current };
          for (const id of leftIds) updated[id] = nowIso;
          return updated;
        });
      }
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || cancelled) return;
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        } satisfies PresenceMeta);
        await touchLastSeen();
      });

    const heartbeat = window.setInterval(() => {
      void touchLastSeen();
    }, HEARTBEAT_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void touchLastSeen();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onUnload = () => {
      void supabase.rpc('touch_admin_last_seen');
    };
    window.addEventListener('pagehide', onUnload);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onUnload);
      void touchLastSeen();
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [touchLastSeen, userId]);

  const isOnline = useCallback(
    (id: string | undefined | null) => Boolean(id && onlineIds.has(id)),
    [onlineIds]
  );

  const presenceLabel = useCallback(
    (id: string | undefined | null, fallbackLastSeen?: string | null) => {
      if (!id) return 'Offline';
      const online = onlineIds.has(id);
      const lastSeen = lastSeenById[id] ?? fallbackLastSeen ?? null;
      return formatPresenceLabel(online, lastSeen);
    },
    [lastSeenById, onlineIds]
  );

  const value = useMemo(
    () => ({
      onlineIds,
      lastSeenById,
      isOnline,
      presenceLabel,
      setKnownLastSeen,
    }),
    [onlineIds, lastSeenById, isOnline, presenceLabel, setKnownLastSeen]
  );

  return <AdminPresenceContext.Provider value={value}>{children}</AdminPresenceContext.Provider>;
}

const EMPTY_ONLINE = new Set<string>();

export function useAdminPresence() {
  const value = useContext(AdminPresenceContext);
  if (value) return value;
  return {
    onlineIds: EMPTY_ONLINE,
    lastSeenById: {},
    isOnline: () => false,
    presenceLabel: (_id?: string | null, fallback?: string | null) => formatPresenceLabel(false, fallback),
    setKnownLastSeen: () => undefined,
  } satisfies AdminPresenceContextValue;
}

export { formatPresenceLabel };

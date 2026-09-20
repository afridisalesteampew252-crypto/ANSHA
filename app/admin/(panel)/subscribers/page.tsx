'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Loader2, RefreshCw, Send, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ensurePushSubscription, isWebPushConfigured } from '@/lib/pwa-push-subscribe';
import { sendWebPush } from '@/lib/web-push';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile, PushSubscriptionRow } from '@/lib/types';

type TopicFilter = 'all' | 'deals' | 'insights' | 'both' | 'none';

function shortenEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const tail = url.pathname.slice(-18);
    return `${url.host}…${tail}`;
  } catch {
    return endpoint.slice(0, 48);
  }
}

function summarizeUa(ua: string | null) {
  if (!ua) return 'Unknown device';
  if (/iPhone|iPad/i.test(ua)) return 'iOS Safari / WebKit';
  if (/Android/i.test(ua)) return 'Android browser';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua)) return 'Safari';
  return ua.slice(0, 64);
}

export default function AdminSubscribersPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PushSubscriptionRow[]>([]);
  const [topic, setTopic] = useState<TopicFilter>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [testing, setTesting] = useState(false);
  const vapidReady = isWebPushConfigured();


  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/admin');
        return;
      }
      const { data: prof } = await supabase
        .from('admin_profiles')
        .select('role,is_active')
        .eq('id', session.user.id)
        .maybeSingle();
      const profile = prof as Pick<AdminProfile, 'role' | 'is_active'> | null;
      if (!profile || profile.is_active === false || profile.role === 'sales') {
        toast.error('PWA subscribers are limited to admin and staff.');
        router.replace('/admin/dashboard');
        return;
      }
      setAllowed(true);
    })();
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id,endpoint,p256dh,auth,notify_insights,notify_deals,user_agent,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) toast.error(error.message);
    setRows((data || []) as PushSubscriptionRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (topic === 'all') return true;
      if (topic === 'deals') return row.notify_deals;
      if (topic === 'insights') return row.notify_insights;
      if (topic === 'both') return row.notify_deals && row.notify_insights;
      return !row.notify_deals && !row.notify_insights;
    });
  }, [rows, topic]);

  const stats = useMemo(() => ({
    total: rows.length,
    deals: rows.filter((row) => row.notify_deals).length,
    insights: rows.filter((row) => row.notify_insights).length,
  }), [rows]);

  const remove = async (id: string) => {
    if (!window.confirm('Remove this push subscription? The visitor can opt in again later.')) return;
    setDeletingId(id);
    const { error } = await supabase.from('push_subscriptions').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      setRows((prev) => prev.filter((row) => row.id !== id));
      toast.success('Subscriber removed.');
    }
    setDeletingId(null);
  };

  const subscribeThisDevice = async () => {
    if (!vapidReady) {
      toast.message('Set NEXT_PUBLIC_VAPID_PUBLIC_KEY first (see docs/Deployment.md).');
      return;
    }
    setSubscribing(true);
    try {
      if (!('Notification' in window)) {
        toast.error('This browser does not support notifications.');
        return;
      }
      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Notifications were blocked. Enable them in browser settings.');
        return;
      }
      const result = await ensurePushSubscription();
      if (!result.subscribed) {
        toast.error(
          result.reason === 'unsupported'
            ? 'This browser does not support Web Push.'
            : 'VAPID public key is not configured.'
        );
        return;
      }
      toast.success('This device is subscribed for deals and insights.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not subscribe this device.');
    } finally {
      setSubscribing(false);
    }
  };

  const sendTestPush = async () => {
    if (!vapidReady) {
      toast.message('Set NEXT_PUBLIC_VAPID_PUBLIC_KEY first (see docs/Deployment.md).');
      return;
    }
    setTesting(true);
    try {
      const result = await sendWebPush({
        topic: 'all',
        title: 'ANSHA test push',
        body: 'Web Push is working. You can close this notification.',
        url: '/admin/subscribers',
      });
      if (result.skipped) {
        toast.message('Push skipped — VAPID public key is not set.');
        return;
      }
      toast.success(
        result.sent > 0
          ? `Test push sent to ${result.sent} device${result.sent === 1 ? '' : 's'}.`
          : `No subscribers received the test (${result.subscribers} stored). Subscribe this device first.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Test push failed. Check Supabase Edge VAPID_* secrets.'
      );
    } finally {
      setTesting(false);
    }
  };

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Marketing</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">PWA / deal subscribers</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Browser push opt-ins from the public site (insights &amp; deals). Staff can also subscribe this browser and send a test push when VAPID keys are set.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void subscribeThisDevice()}
            disabled={subscribing || !vapidReady}
            title={vapidReady ? undefined : 'NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set'}
          >
            {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Subscribe this device
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void sendTestPush()}
            disabled={testing || !vapidReady}
            title={vapidReady ? undefined : 'NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set'}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send test push
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {!vapidReady ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Web Push is idle until <code className="text-xs">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> is set on Vercel /{' '}
          <code className="text-xs">.env.local</code>, and matching <code className="text-xs">VAPID_*</code> secrets
          are set on the <code className="text-xs">send-web-push</code> Edge Function. See{' '}
          <span className="font-medium text-foreground">docs/Deployment.md</span>.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total devices</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deals topic</CardDescription>
            <CardTitle className="text-3xl">{stats.deals}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Insights topic</CardDescription>
            <CardTitle className="text-3xl">{stats.insights}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Subscribers</CardTitle>
            <CardDescription>
              {filtered.length} shown
              {topic !== 'all' ? ` · filter: ${topic}` : ''}
            </CardDescription>
          </div>
          <Select value={topic} onValueChange={(value) => setTopic(value as TopicFilter)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter topics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              <SelectItem value="deals">Deals on</SelectItem>
              <SelectItem value="insights">Insights on</SelectItem>
              <SelectItem value="both">Both on</SelectItem>
              <SelectItem value="none">No topics</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">No PWA subscribers yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Visitors who enable alerts on the public site appear here. Publish a deal or insight with push to reach them.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 font-semibold">Subscribed</th>
                    <th className="px-2 py-2 font-semibold">Topics</th>
                    <th className="px-2 py-2 font-semibold">Device</th>
                    <th className="px-2 py-2 font-semibold">Endpoint</th>
                    <th className="px-2 py-2 font-semibold text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b border-border/70 align-top">
                      <td className="px-2 py-3 whitespace-nowrap">
                        <p className="font-medium">{format(new Date(row.created_at), 'dd MMM yyyy')}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(row.created_at), 'HH:mm')}</p>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.notify_deals ? <Badge variant="secondary">Deals</Badge> : null}
                          {row.notify_insights ? <Badge variant="secondary">Insights</Badge> : null}
                          {!row.notify_deals && !row.notify_insights ? (
                            <Badge variant="outline">Off</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <p className="font-medium">{summarizeUa(row.user_agent)}</p>
                        <p className="mt-0.5 max-w-xs truncate text-[11px] text-muted-foreground" title={row.user_agent || undefined}>
                          {row.user_agent || '—'}
                        </p>
                      </td>
                      <td className="px-2 py-3 font-mono text-xs text-muted-foreground">
                        {shortenEndpoint(row.endpoint)}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          disabled={deletingId === row.id}
                          onClick={() => void remove(row.id)}
                          aria-label="Remove subscriber"
                        >
                          {deletingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

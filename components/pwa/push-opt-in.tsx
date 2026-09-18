'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';

const DISMISS_KEY = 'ansha-push-prompt-dismissed';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function saveSubscription(
  subscription: PushSubscription,
  topics: { insights: boolean; deals: boolean }
) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Browser did not return a complete push subscription.');
  }
  await supabase.from('push_subscriptions').delete().eq('endpoint', json.endpoint);
  const { error } = await supabase.from('push_subscriptions').insert({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    notify_insights: topics.insights,
    notify_deals: topics.deals,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
  });
  if (error) throw error;
}

async function ensureSubscription(vapidPublic: string) {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublic),
    }));
  await saveSubscription(subscription, { insights: true, deals: true });
}

export function PushOptIn() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!vapidPublic) return;

    if (Notification.permission === 'granted') {
      void ensureSubscription(vapidPublic).catch(() => {
        // Silent: visitor may be offline or RLS not applied yet.
      });
      return;
    }

    if (Notification.permission === 'denied') return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    setVisible(true);
  }, [vapidPublic]);

  if (!visible || !vapidPublic) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Notifications were blocked. You can enable them in browser settings.');
        dismiss();
        return;
      }
      await ensureSubscription(vapidPublic);
      toast.success('You will get alerts for new insights and deals.');
      dismiss();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'fixed inset-x-3 z-40 rounded-xl border border-border/80 bg-background/95 p-3.5 shadow-lg backdrop-blur-md',
        'bottom-[calc(8.5rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-6 sm:right-4 sm:w-[22rem]',
        'lg:bottom-24'
      )}
      role="dialog"
      aria-label="Enable notifications"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
          <Bell className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">Alerts for insights and deals</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Get a push when ANSHA publishes a new insight or export offer.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button size="sm" type="button" className="w-full sm:w-auto" disabled={busy} onClick={() => void enable()}>
              {busy ? 'Enabling…' : 'Enable alerts'}
            </Button>
            <Button size="sm" type="button" variant="ghost" className="w-full sm:w-auto" onClick={dismiss}>
              <BellOff className="h-4 w-4" />
              Not now
            </Button>
          </div>
        </div>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Dismiss notification prompt"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ensurePushSubscription, getVapidPublicKey, isWebPushConfigured } from '@/lib/pwa-push-subscribe';

const DISMISS_KEY = 'ansha-push-prompt-dismissed';

export function PushOptIn() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const vapidReady = isWebPushConfigured();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!vapidReady) return;

    if (Notification.permission === 'granted') {
      void ensurePushSubscription().catch(() => {
        // Silent: visitor may be offline or RLS not applied yet.
      });
      return;
    }

    if (Notification.permission === 'denied') return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    setVisible(true);
  }, [vapidReady]);

  if (!visible || !vapidReady) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  const enable = async () => {
    setBusy(true);
    try {
      if (!getVapidPublicKey()) {
        toast.message('Push alerts are not configured yet.');
        dismiss();
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Notifications were blocked. You can enable them in browser settings.');
        dismiss();
        return;
      }
      const result = await ensurePushSubscription();
      if (!result.subscribed) {
        toast.error(
          result.reason === 'unsupported'
            ? 'This browser does not support Web Push.'
            : 'Push alerts are not configured yet.'
        );
        return;
      }
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
        'fixed left-3 right-3 z-40 max-w-full rounded-xl border border-border/80 bg-background/95 p-3.5 shadow-lg backdrop-blur-md',
        'bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))] sm:left-auto sm:right-4 sm:bottom-6 sm:w-[22rem]',
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

'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isNativeCapacitorRuntime } from '@/lib/capacitor/runtime';
import { ensurePushSubscription, getVapidPublicKey, isWebPushConfigured } from '@/lib/pwa-push-subscribe';

const DISMISS_KEY = 'ansha-push-prompt-dismissed';
const INSTALL_DISMISS_KEY = 'ansha-pwa-install-dismissed';

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export function PushOptIn() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const vapidReady = isWebPushConfigured();

  useEffect(() => {
    if (isNativeCapacitorRuntime()) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window) || !vapidReady) return;
    if (Notification.permission === 'granted') {
      void ensurePushSubscription().catch(() => undefined);
      return;
    }
    if (Notification.permission === 'denied' || localStorage.getItem(DISMISS_KEY) === '1') return;

    // Never stack this with the install prompt. Ask about alerts only after the
    // app is installed or the visitor has already dismissed the install offer.
    if (!isInstalled() && localStorage.getItem(INSTALL_DISMISS_KEY) !== '1') return;
    const timer = window.setTimeout(() => setVisible(true), 12000);
    return () => window.clearTimeout(timer);
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
        toast.error('Notifications were not enabled. You can change this in browser settings.');
        dismiss();
        return;
      }
      const result = await ensurePushSubscription();
      if (!result.subscribed) throw new Error(result.reason === 'unsupported' ? 'This browser does not support Web Push.' : 'Push alerts are unavailable.');
      toast.success('Alerts enabled for insights and deals.');
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
        'fixed left-3 right-3 z-40 max-w-full rounded-2xl border border-white/60 bg-background/90 p-3 shadow-[0_18px_50px_rgba(15,23,42,.20)] backdrop-blur-xl dark:border-white/10',
        'bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:left-auto sm:right-4 sm:bottom-6 sm:w-[21rem] lg:bottom-24'
      )}
      role="dialog"
      aria-label="Enable notifications"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><Bell className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">Optional alerts</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Get new insight and export-deal notifications on this device.</p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" type="button" disabled={busy} onClick={() => void enable()}>{busy ? 'Enabling…' : 'Enable'}</Button>
            <Button size="sm" type="button" variant="ghost" onClick={dismiss}><BellOff className="h-4 w-4" />Not now</Button>
          </div>
        </div>
        <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Dismiss notification prompt" onClick={dismiss}><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

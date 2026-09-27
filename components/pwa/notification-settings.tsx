'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Bell, BellOff, CheckCircle2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ensurePushSubscription, isWebPushConfigured } from '@/lib/pwa-push-subscribe';

type State = 'checking' | 'enabled' | 'available' | 'blocked' | 'unsupported' | 'install';

function isIos() {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export function NotificationSettings({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void import('@capacitor/push-notifications').then(async ({ PushNotifications }) => {
        const permission = await PushNotifications.checkPermissions();
        setState(permission.receive === 'granted' ? 'enabled' : permission.receive === 'denied' ? 'blocked' : 'available');
      }).catch(() => setState('unsupported'));
      return;
    }
    if (!isWebPushConfigured() || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState(isIos() && !isStandalone() ? 'install' : 'unsupported');
      return;
    }
    if (isIos() && !isStandalone()) {
      setState('install');
      return;
    }
    if (Notification.permission === 'denied') setState('blocked');
    else if (Notification.permission === 'granted') {
      setState('enabled');
      void ensurePushSubscription({ insights: true, deals: true, support: true }).catch(() => setState('available'));
    } else setState('available');
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const current = await PushNotifications.checkPermissions();
        const permission = current.receive === 'prompt' || current.receive === 'prompt-with-rationale' ? await PushNotifications.requestPermissions() : current;
        if (permission.receive !== 'granted') {
          setState('blocked');
          toast.error('Allow notifications in your device settings.');
          return;
        }
        await PushNotifications.register();
        setState('enabled');
        toast.success('Support reply notifications are enabled on this device.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('blocked');
        toast.error('Notifications are blocked. Enable them in your browser settings.');
        return;
      }
      const result = await ensurePushSubscription({ insights: true, deals: true, support: true });
      if (!result.subscribed) throw new Error('Web Push is not available on this device.');
      setState('enabled');
      toast.success('Support reply notifications are enabled on this device.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'checking') return null;
  if (compact && state === 'enabled') {
    return <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Notifications on</span>;
  }

  return (
    <div className="rounded-xl border bg-secondary/25 p-3 text-sm">
      <div className="flex items-start gap-3">
        {state === 'enabled' ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> :
          state === 'blocked' ? <BellOff className="mt-0.5 h-5 w-5 text-destructive" /> :
          state === 'install' ? <Smartphone className="mt-0.5 h-5 w-5 text-accent" /> :
          <Bell className="mt-0.5 h-5 w-5 text-accent" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {state === 'enabled' ? 'Reply notifications enabled' :
              state === 'blocked' ? 'Notifications blocked' :
              state === 'install' ? 'Install the app for notifications' :
              state === 'unsupported' ? 'Notifications unavailable' : 'Get support replies on this device'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {state === 'install'
              ? 'On iPhone or iPad, use Share → Add to Home Screen, open ANSHA from the new icon, then enable notifications.'
              : state === 'blocked'
                ? Capacitor.isNativePlatform() ? 'Allow notifications for ANSHA in your device settings.' : 'Open this site in browser settings and allow notifications, then return here.'
                : state === 'unsupported'
                  ? Capacitor.isNativePlatform() ? 'Notifications are unavailable on this app build.' : 'Use a current mobile browser with Web Push support.'
                  : state === 'enabled'
                    ? 'You can leave the portal and still receive new team replies.'
                    : Capacitor.isNativePlatform() ? 'Enable once; your device will ask for permission.' : 'Enable once; the browser will ask for permission.'}
          </p>
          {state === 'available' ? (
            <Button type="button" size="sm" className="mt-2" disabled={busy} onClick={() => void enable()}>
              {busy ? 'Enabling…' : 'Enable notifications'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

/**
 * Capacitor-only FCM registration. On browsers the dynamic import fails safely,
 * leaving the existing Web Push implementation in control.
 */
export function NativePushNotifications() {
  useEffect(() => {
    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    void import('@capacitor/push-notifications')
      .then(async ({ PushNotifications }) => {
        if (cancelled) return;

        handles.push(
          await PushNotifications.addListener('registration', async ({ value: token }) => {
            if (!token || cancelled) return;
            const { error } = await supabase.rpc('register_fcm_push_token', {
              p_token: token,
              p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
            });
            if (error) console.warn('FCM token registration failed:', error.message);
          }),
          await PushNotifications.addListener('registrationError', (error) => {
            console.warn('FCM registration failed:', error);
          }),
          await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
            const target = typeof notification.data?.url === 'string' ? notification.data.url : '/';
            window.location.assign(target.startsWith('http') ? target : `${window.location.origin}${target}`);
          }),
        );

        const permission = await PushNotifications.checkPermissions();
        const granted = permission.receive === 'granted'
          ? permission
          : permission.receive === 'prompt'
            ? await PushNotifications.requestPermissions()
            : permission;

        if (!cancelled && granted.receive === 'granted') {
          await PushNotifications.register();
        }
      })
      .catch(() => {
        // The Capacitor bridge is unavailable in desktop/mobile browsers.
      });

    return () => {
      cancelled = true;
      void Promise.all(handles.map((handle) => handle.remove()));
    };
  }, []);

  return null;
}

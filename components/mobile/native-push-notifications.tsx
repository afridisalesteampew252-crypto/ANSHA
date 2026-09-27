'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { safeMobileRoute } from '@/lib/capacitor/safe-mobile-route';
import { safeAdminRoute } from '@/lib/capacitor/safe-admin-route';

/**
 * Capacitor-only FCM registration. Registers after a user signs in so a fresh
 * install that opens the admin login page still receives push notifications.
 */
export function NativePushNotifications() {
  useEffect(() => {
    let cancelled = false;
    let authUnsubscribe: (() => void) | undefined;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    void import('@capacitor/push-notifications')
      .then(async ({ PushNotifications }) => {
        if (cancelled) return;

        const registerForSignedInUser = async () => {
          if (cancelled) return;
          try {
            const permission = await PushNotifications.checkPermissions();
            const granted = permission.receive === 'granted'
              ? permission
              : permission.receive === 'prompt'
                ? await PushNotifications.requestPermissions()
                : permission;
            if (!cancelled && granted.receive === 'granted') {
              await PushNotifications.register();
            }
          } catch (error) {
            console.warn('Native push permission or registration failed:', error);
          }
        };

        // Android requires a channel with the same ID used by FCM payloads.
        if (/Android/i.test(navigator.userAgent)) {
          await PushNotifications.createChannel({
            id: 'ansha_default',
            name: 'ANSHA notifications',
            description: 'Support messages and team alerts',
            importance: 5,
            visibility: 1,
          });
        }

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
            const route = window.location.pathname.startsWith('/admin')
              ? safeAdminRoute(notification.data?.url)
              : safeMobileRoute(notification.data?.url);
            window.location.assign(route);
          }),
        );

        const { data: authState } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!session || cancelled) return;
          // Supabase auth callbacks must stay synchronous; schedule plugin work
          // after the callback returns to avoid blocking the auth state lock.
          window.setTimeout(() => void registerForSignedInUser(), 0);
        });
        authUnsubscribe = () => authState.subscription.unsubscribe();

        const { data: { session } } = await supabase.auth.getSession();
        if (session) await registerForSignedInUser();
      })
      .catch(() => {
        // The Capacitor bridge is unavailable in desktop/mobile browsers.
      });

    return () => {
      cancelled = true;
      authUnsubscribe?.();
      void Promise.all(handles.map((handle) => handle.remove()));
    };
  }, []);

  return null;
}

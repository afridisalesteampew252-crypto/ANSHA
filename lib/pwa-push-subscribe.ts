import { supabase } from '@/lib/supabase/client';

const VAPID_FINGERPRINT_KEY = 'ansha-vapid-public';

export function isWebPushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim());
}

export function getVapidPublicKey() {
  return (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function savePushSubscription(
  subscription: PushSubscription,
  topics: { insights: boolean; deals: boolean } = { insights: true, deals: true }
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

/** Subscribe this browser to Web Push and persist to `push_subscriptions`. No-op if VAPID public key is unset. */
export async function ensurePushSubscription(
  topics: { insights: boolean; deals: boolean } = { insights: true, deals: true }
) {
  const vapidPublic = getVapidPublicKey();
  if (!vapidPublic) {
    return { subscribed: false as const, reason: 'missing_vapid' as const };
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { subscribed: false as const, reason: 'unsupported' as const };
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const fingerprintMatches =
    typeof localStorage !== 'undefined' && localStorage.getItem(VAPID_FINGERPRINT_KEY) === vapidPublic;

  let subscription = existing;
  if (!subscription || !fingerprintMatches) {
    if (subscription) await subscription.unsubscribe();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublic),
    });
    try {
      localStorage.setItem(VAPID_FINGERPRINT_KEY, vapidPublic);
    } catch {
      // ignore quota / private mode
    }
  }

  await savePushSubscription(subscription, topics);
  return { subscribed: true as const, endpoint: subscription.endpoint };
}

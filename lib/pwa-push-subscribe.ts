import { supabase } from '@/lib/supabase/client';

const VAPID_FINGERPRINT_KEY = 'ansha-vapid-public';

export type PushTopics = {
  insights: boolean;
  deals: boolean;
  support: boolean;
};

const DEFAULT_TOPICS: PushTopics = { insights: true, deals: true, support: false };

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
  topics: PushTopics = DEFAULT_TOPICS
) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Browser did not return a complete push subscription.');
  }

  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_notify_insights: topics.insights,
    p_notify_deals: topics.deals,
    p_notify_support: topics.support,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
  });
  if (error) throw error;
}

/** Subscribe this browser to Web Push and persist a user-linked subscription when signed in. */
export async function ensurePushSubscription(topics: PushTopics = DEFAULT_TOPICS) {
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
      // Private browsing can deny local storage while push still works.
    }
  }

  await savePushSubscription(subscription, topics);
  return { subscribed: true as const, endpoint: subscription.endpoint };
}

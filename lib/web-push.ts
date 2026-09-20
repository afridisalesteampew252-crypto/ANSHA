import { siteConfig } from '@/lib/site-config';
import { isWebPushConfigured } from '@/lib/pwa-push-subscribe';

export type PushTopic = 'insights' | 'deals' | 'all';

export type SendWebPushResult = {
  sent: number;
  failed: number;
  subscribers: number;
  removed_stale: number;
  skipped?: boolean;
};

export { isWebPushConfigured };

export async function sendWebPush(input: {
  topic: PushTopic;
  title: string;
  body: string;
  url: string;
}): Promise<SendWebPushResult> {
  if (!isWebPushConfigured()) {
    return { sent: 0, failed: 0, subscribers: 0, removed_stale: 0, skipped: true };
  }

  const { supabase } = await import('@/lib/supabase/client');
  const { data, error } = await supabase.functions.invoke('send-web-push', {
    body: {
      topic: input.topic,
      title: input.title.slice(0, 120),
      body: input.body.slice(0, 300),
      url: input.url.startsWith('http') ? input.url : `${siteConfig.url}${input.url.startsWith('/') ? '' : '/'}${input.url}`,
    },
  });
  const bodyError =
    data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : null;
  if (error || bodyError) {
    throw new Error(bodyError || error?.message || 'Push send failed.');
  }
  return data as SendWebPushResult;
}

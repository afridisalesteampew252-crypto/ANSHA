import { siteConfig } from '@/lib/site-config';

export type PushTopic = 'insights' | 'deals' | 'all';

export async function sendWebPush(input: {
  topic: PushTopic;
  title: string;
  body: string;
  url: string;
}) {
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
  return data as { sent: number; failed: number; subscribers: number; removed_stale: number };
}

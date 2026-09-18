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
  if (error || data?.error) {
    throw new Error(data?.error || error?.message || 'Push send failed.');
  }
  return data as { sent: number; failed: number; subscribers: number; removed_stale: number };
}

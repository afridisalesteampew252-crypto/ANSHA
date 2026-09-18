import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import webpush from 'npm:web-push@3.6.7';
import { corsHeaders, json } from '../_shared/cors.ts';

type Topic = 'insights' | 'deals' | 'all';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:info@anshatrading.com';
    const authorization = request.headers.get('Authorization') || '';

    if (!url || !anonKey || !serviceKey) return json(request, { error: 'Push service is not configured.' }, 500);
    if (!vapidPublic || !vapidPrivate) {
      return json(request, { error: 'VAPID keys are not configured on the Edge Function.' }, 500);
    }
    if (!authorization.startsWith('Bearer ')) return json(request, { error: 'Authentication required.' }, 401);

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return json(request, { error: 'Your session is invalid. Sign in again.' }, 401);

    const { data: profile } = await serviceClient
      .from('admin_profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile) return json(request, { error: 'Only staff can send push notifications.' }, 403);

    const payload = await request.json();
    const topic = String(payload.topic || 'all') as Topic;
    const title = String(payload.title || '').trim();
    const body = String(payload.body || '').trim();
    const targetUrl = String(payload.url || '/').trim() || '/';

    if (!['insights', 'deals', 'all'].includes(topic)) {
      return json(request, { error: 'Topic must be insights, deals, or all.' }, 422);
    }
    if (!title || title.length > 120) return json(request, { error: 'Title is required (max 120 characters).' }, 422);
    if (!body || body.length > 300) return json(request, { error: 'Body is required (max 300 characters).' }, 422);

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    let query = serviceClient.from('push_subscriptions').select('id, endpoint, p256dh, auth');
    if (topic === 'insights') query = query.eq('notify_insights', true);
    if (topic === 'deals') query = query.eq('notify_deals', true);

    const { data: rows, error: listError } = await query;
    if (listError) return json(request, { error: listError.message }, 500);

    const message = JSON.stringify({ title, body, url: targetUrl, topic });
    let sent = 0;
    let failed = 0;
    const staleIds: string[] = [];

    for (const row of rows || []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          message,
          { TTL: 60 * 60 * 12 }
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = typeof error === 'object' && error && 'statusCode' in error
          ? Number((error as { statusCode?: number }).statusCode)
          : 0;
        if (statusCode === 404 || statusCode === 410) staleIds.push(row.id);
      }
    }

    if (staleIds.length) {
      await serviceClient.from('push_subscriptions').delete().in('id', staleIds);
    }

    return json(request, {
      topic,
      subscribers: (rows || []).length,
      sent,
      failed,
      removed_stale: staleIds.length,
    });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Unknown push error.' }, 500);
  }
});

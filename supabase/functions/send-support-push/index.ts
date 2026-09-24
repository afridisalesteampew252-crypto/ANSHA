import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { corsHeaders, json } from '../_shared/cors.ts';
import { isFcmConfigured, isFcmStaleError, sendFcmMessage } from '../_shared/fcm.ts';

function normalizeBase64Url(value: string) {
  return value.trim().replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(base64url: string) {
  const normalized = normalizeBase64Url(base64url);
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized.replace(/-/g, '+').replace(/_/g, '/') + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function vapidKeysToJwk(publicRaw: string, privateRaw: string) {
  const publicBytes = base64UrlToBytes(publicRaw);
  const privateBytes = base64UrlToBytes(privateRaw);
  if (publicBytes.byteLength !== 65 || publicBytes[0] !== 0x04 || privateBytes.byteLength !== 32) {
    throw new Error('The configured VAPID key pair is invalid.');
  }
  const x = bytesToBase64Url(publicBytes.slice(1, 33));
  const y = bytesToBase64Url(publicBytes.slice(33, 65));
  const d = bytesToBase64Url(privateBytes);
  return {
    publicKey: { kty: 'EC', crv: 'P-256', alg: 'ES256', x, y, key_ops: ['verify'], ext: true },
    privateKey: { kty: 'EC', crv: 'P-256', alg: 'ES256', x, y, d, key_ops: ['sign'], ext: true },
  };
}

function isStalePushError(error: unknown) {
  if (error && typeof error === 'object' && 'response' in error) {
    const status = Number((error as { response?: { status?: number } }).response?.status || 0);
    return status === 404 || status === 410;
  }
  return false;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubjectRaw = (Deno.env.get('VAPID_SUBJECT') || 'mailto:info@anshatrading.com').trim();
    const vapidSubject = vapidSubjectRaw.startsWith('mailto:') || vapidSubjectRaw.startsWith('https:')
      ? vapidSubjectRaw
      : `mailto:${vapidSubjectRaw}`;
    const authorization = request.headers.get('Authorization') || '';

    if (!url || !anonKey || !serviceKey) return json(request, { error: 'Support push is not configured.' }, 500);
    if (!vapidPublic || !vapidPrivate) return json(request, { error: 'VAPID keys are not configured.' }, 500);
    if (!authorization.startsWith('Bearer ')) return json(request, { error: 'Authentication required.' }, 401);

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return json(request, { error: 'Your session is invalid.' }, 401);

    const body = await request.json();
    const messageId = String(body.message_id || '');
    const dryRun = body.dry_run === true;
    if (!messageId) return json(request, { error: 'message_id is required.' }, 422);

    const { data: message, error: messageError } = await serviceClient
      .from('support_messages')
      .select('id,thread_id,sender_id,sender_kind,body,support_threads!inner(customer_profile_id,assigned_to)')
      .eq('id', messageId)
      .single();
    if (messageError || !message) return json(request, { error: 'Support message was not found.' }, 404);
    if (message.sender_id !== user.id) return json(request, { error: 'You may notify only for your own message.' }, 403);

    const threadValue = message.support_threads as unknown;
    const thread = (Array.isArray(threadValue) ? threadValue[0] : threadValue) as {
      customer_profile_id: string;
      assigned_to: string | null;
    };
    let recipientIds: string[] = [];
    if (message.sender_kind === 'agent') {
      recipientIds = [thread.customer_profile_id];
    } else if (thread.assigned_to) {
      recipientIds = [thread.assigned_to];
    } else {
      const { data: agents } = await serviceClient
        .from('admin_profiles')
        .select('id')
        .eq('is_active', true)
        .in('role', ['admin', 'staff', 'manager']);
      recipientIds = (agents || []).map((agent) => agent.id);
    }
    recipientIds = [...new Set(recipientIds)].filter((id) => id !== user.id);

    const { data: subscriptions, error: subscriptionError } = recipientIds.length
      ? await serviceClient
          .from('push_subscriptions')
          .select('id,platform,endpoint,p256dh,auth,device_token')
          .in('user_id', recipientIds)
          .in('platform', ['web', 'android'])
          .eq('notify_support', true)
      : { data: [], error: null };
    if (subscriptionError) return json(request, { error: subscriptionError.message }, 500);
    if (dryRun) return json(request, { subscribers: subscriptions?.length || 0, sent: 0, failed: 0, removed_stale: 0, dry_run: true });

    const isAgentReply = message.sender_kind === 'agent';
    const notificationTitle = isAgentReply ? 'New reply from ANSHA Support' : 'New customer support message';
    const notificationBody = isAgentReply ? 'Open your secure portal to read the reply.' : 'Open the secure staff inbox to respond.';
    const notificationUrl = isAgentReply ? '/portal/support' : `/admin/customer-support?thread=${message.thread_id}`;
    const notification = JSON.stringify({
      title: notificationTitle,
      body: notificationBody,
      url: notificationUrl,
      topic: 'support',
      tag: `support-${message.thread_id}`,
    });

    const webSubscriptions = (subscriptions || []).filter((row) => row.platform === 'web');
    const appServer = webSubscriptions.length
      ? await (async () => {
          const vapidKeys = await webpush.importVapidKeys(
            vapidKeysToJwk(normalizeBase64Url(vapidPublic), normalizeBase64Url(vapidPrivate)),
            { extractable: false },
          );
          return webpush.ApplicationServer.new({ contactInformation: vapidSubject, vapidKeys });
        })()
      : null;

    let sent = 0;
    let failed = 0;
    let nativeSent = 0;
    let nativeFailed = 0;
    const staleIds: string[] = [];
    for (const row of subscriptions || []) {
      try {
        if (row.platform === 'android') {
          if (!isFcmConfigured() || !row.device_token) continue;
          await sendFcmMessage({
            token: row.device_token,
            title: notificationTitle,
            body: notificationBody,
            url: notificationUrl,
            topic: 'support',
            tag: `support-${message.thread_id}`,
          });
          nativeSent += 1;
        } else if (appServer) {
          const subscriber = appServer.subscribe({
            endpoint: row.endpoint,
            keys: { p256dh: normalizeBase64Url(row.p256dh), auth: normalizeBase64Url(row.auth) },
          });
          await subscriber.pushTextMessage(notification, { ttl: 60 * 60 * 24 });
        }
        sent += 1;
      } catch (error) {
        failed += 1;
        if (row.platform === 'android') nativeFailed += 1;
        if (isStalePushError(error) || isFcmStaleError(error)) staleIds.push(row.id);
        else console.error('support push failed', error instanceof Error ? error.message : error);
      }
    }
    if (staleIds.length) await serviceClient.from('push_subscriptions').delete().in('id', staleIds);

    return json(request, {
      subscribers: subscriptions?.length || 0,
      sent,
      failed,
      native_configured: isFcmConfigured(),
      native_subscribers: (subscriptions || []).filter((row) => row.platform === 'android').length,
      native_sent: nativeSent,
      native_failed: nativeFailed,
      removed_stale: staleIds.length,
    });
  } catch (error) {
    console.error('send-support-push error', error instanceof Error ? error.message : error);
    return json(request, { error: error instanceof Error ? error.message : 'Unknown support push error.' }, 500);
  }
});

import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { corsHeaders, json } from '../_shared/cors.ts';
import { isFcmConfigured, isFcmStaleError, sendFcmMessage } from '../_shared/fcm.ts';

type Topic = 'insights' | 'deals' | 'all';

/** Trim secrets and normalize URL-safe base64 (no spaces/newlines; strip padding). */
function normalizeBase64Url(value: string) {
  return value.trim().replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(base64url: string) {
  const normalized = normalizeBase64Url(base64url);
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const base64 = normalized.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Convert web-push CLI URL-safe keys into JWK for @negrel/webpush. */
function vapidKeysToJwk(publicKeyBase64Url: string, privateKeyBase64Url: string) {
  const publicKeyBytes = base64UrlToBytes(publicKeyBase64Url);
  if (publicKeyBytes.byteLength !== 65 || publicKeyBytes[0] !== 0x04) {
    throw new Error(
      'VAPID_PUBLIC_KEY must be an uncompressed P-256 key (65 bytes URL-safe base64 from `npx web-push generate-vapid-keys`).'
    );
  }
  const privateKeyBytes = base64UrlToBytes(privateKeyBase64Url);
  if (privateKeyBytes.byteLength !== 32) {
    throw new Error(
      'VAPID_PRIVATE_KEY must be 32 bytes URL-safe base64 (no spaces/newlines) matching the public key pair.'
    );
  }

  const x = bytesToBase64Url(publicKeyBytes.slice(1, 33));
  const y = bytesToBase64Url(publicKeyBytes.slice(33, 65));
  const d = bytesToBase64Url(privateKeyBytes);

  return {
    publicKey: {
      kty: 'EC',
      crv: 'P-256',
      alg: 'ES256',
      x,
      y,
      key_ops: ['verify'],
      ext: true,
    },
    privateKey: {
      kty: 'EC',
      crv: 'P-256',
      alg: 'ES256',
      x,
      y,
      d,
      key_ops: ['sign'],
      ext: true,
    },
  };
}

function normalizeVapidSubject(raw: string) {
  const subject = raw.trim();
  if (!subject) return 'mailto:admin@anshatradingco.com';
  if (subject.startsWith('mailto:') || subject.startsWith('https:')) return subject;
  if (subject.includes('@')) return `mailto:${subject}`;
  throw new Error('VAPID_SUBJECT must be a mailto: or https: URL (e.g. mailto:admin@anshatradingco.com).');
}

function isStalePushError(error: unknown) {
  if (error && typeof error === 'object' && 'response' in error) {
    const status = Number((error as { response?: { status?: number } }).response?.status || 0);
    return status === 404 || status === 410;
  }
  return false;
}

function safeTargetUrl(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return '/';
  try {
    const parsed = new URL(raw, 'https://www.anshatradingco.com');
    if (parsed.origin !== 'https://www.anshatradingco.com') return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const vapidPublicRaw = Deno.env.get('VAPID_PUBLIC_KEY') || Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
    const vapidPrivateRaw = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = normalizeVapidSubject(
      Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@anshatradingco.com'
    );
    const authorization = request.headers.get('Authorization') || '';

    if (!url || !anonKey || !serviceKey) return json(request, { error: 'Push service is not configured.' }, 500);
    if (!vapidPublicRaw || !vapidPrivateRaw) {
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
      .select('id,role,is_active')
      .eq('id', user.id)
      .eq('is_active', true)
      .in('role', ['admin', 'staff'])
      .maybeSingle();
    if (!profile) return json(request, { error: 'Only staff can send push notifications.' }, 403);

    const payload = await request.json();
    const topic = String(payload.topic || 'all') as Topic;
    const title = String(payload.title || '').trim();
    const body = String(payload.body || '').trim();
    const targetUrl = safeTargetUrl(payload.url);

    if (!['insights', 'deals', 'all'].includes(topic)) {
      return json(request, { error: 'Topic must be insights, deals, or all.' }, 422);
    }
    if (!title || title.length > 120) return json(request, { error: 'Title is required (max 120 characters).' }, 422);
    if (!body || body.length > 300) return json(request, { error: 'Body is required (max 300 characters).' }, 422);

    const vapidKeys = await webpush.importVapidKeys(
      vapidKeysToJwk(normalizeBase64Url(vapidPublicRaw), normalizeBase64Url(vapidPrivateRaw)),
      { extractable: false }
    );
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: vapidSubject,
      vapidKeys,
    });

    let query = serviceClient
      .from('push_subscriptions')
      .select('id, platform, endpoint, p256dh, auth, device_token')
      .in('platform', ['web', 'android']);
    if (topic === 'insights') query = query.eq('notify_insights', true);
    if (topic === 'deals') query = query.eq('notify_deals', true);

    const { data: rows, error: listError } = await query;
    if (listError) return json(request, { error: listError.message }, 500);

    const message = JSON.stringify({ title, body, url: targetUrl, topic });
    let sent = 0;
    let failed = 0;
    let nativeSent = 0;
    let nativeFailed = 0;
    const staleIds: string[] = [];

    for (const row of rows || []) {
      try {
        if (row.platform === 'android') {
          if (!isFcmConfigured() || !row.device_token) continue;
          await sendFcmMessage({ token: row.device_token, title, body, url: targetUrl, topic });
          nativeSent += 1;
        } else {
          const subscriber = appServer.subscribe({
            endpoint: row.endpoint,
            keys: {
              p256dh: normalizeBase64Url(row.p256dh),
              auth: normalizeBase64Url(row.auth),
            },
          });
          await subscriber.pushTextMessage(message, { ttl: 60 * 60 * 12 });
        }
        sent += 1;
      } catch (error) {
        failed += 1;
        if (row.platform === 'android') nativeFailed += 1;
        if (isStalePushError(error) || isFcmStaleError(error)) staleIds.push(row.id);
        else console.error('push send failed', error instanceof Error ? error.message : error);
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
      native_configured: isFcmConfigured(),
      native_subscribers: (rows || []).filter((row) => row.platform === 'android').length,
      native_sent: nativeSent,
      native_failed: nativeFailed,
      removed_stale: staleIds.length,
    });
  } catch (error) {
    console.error('send-web-push error', error instanceof Error ? error.message : error);
    return json(request, { error: error instanceof Error ? error.message : 'Unknown push error.' }, 500);
  }
});

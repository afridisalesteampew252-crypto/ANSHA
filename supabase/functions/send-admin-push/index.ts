import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
};

const encoder = new TextEncoder();
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-admin-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(status: number, value: Record<string, unknown>) {
  return new Response(JSON.stringify(value), { status, headers: corsHeaders });
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlText(value: string) {
  return base64Url(encoder.encode(value));
}

function pemBytes(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getGoogleAccessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlText(JSON.stringify({
    alg: 'RS256',
    typ: 'JWT',
    ...(account.private_key_id ? { kid: account.private_key_id } : {}),
  }));
  const claims = base64UrlText(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    pemBytes(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, encoder.encode(unsigned)),
  );
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== 'string') {
    throw new Error('Could not obtain a Firebase access token.');
  }
  return result.access_token as string;
}

function safeAdminUrl(raw: unknown) {
  const fallback = '/admin/dashboard';
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    const parsed = new URL(raw, 'https://www.anshatradingco.com');
    if (
      parsed.origin !== 'https://www.anshatradingco.com' ||
      (parsed.pathname !== '/admin' && !parsed.pathname.startsWith('/admin/'))
    ) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function safeCustomerUrl(raw: unknown) {
  const fallback = '/portal/notifications';
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    const parsed = new URL(raw, 'https://www.anshatradingco.com');
    if (parsed.origin !== 'https://www.anshatradingco.com' ||
        !(parsed.pathname === '/portal' || parsed.pathname.startsWith('/portal/') ||
          parsed.pathname === '/mobile' || parsed.pathname.startsWith('/mobile/'))) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch { return fallback; }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const expectedSecret = Deno.env.get('ADMIN_PUSH_WEBHOOK_SECRET') || '';
  const suppliedSecret = request.headers.get('x-admin-push-secret') || '';
  if (!expectedSecret || suppliedSecret.length < 32 || suppliedSecret !== expectedSecret) {
    return json(401, { error: 'Unauthorized.' });
  }

  try {
    const projectUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const rawServiceAccount = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
    if (!projectUrl || !serviceRoleKey || !rawServiceAccount) {
      return json(503, { error: 'Native push delivery is not configured.' });
    }

    const serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccount;
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      return json(503, { error: 'The Firebase service account JSON is incomplete.' });
    }

    const body = await request.json();
    const audience = body.audience ?? 'admin';
    if (audience !== 'admin' && audience !== 'customer') return json(400, { error: 'Invalid notification audience.' });
    const notificationId = String(body.notification_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(notificationId)) {
      return json(400, { error: 'A valid notification_id is required.' });
    }

    const service = createClient(projectUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: notification, error: notificationError } = await service
      .from(audience === 'customer' ? 'customer_notifications' : 'admin_notifications')
      .select('id,recipient_id,title,body,href')
      .eq('id', notificationId)
      .maybeSingle();
    if (notificationError || !notification) return json(404, { error: 'Notification not found.' });

    const { data: eligible, error: eligibilityError } = await service.rpc('native_notification_delivery_allowed', {
      p_id: notificationId, p_audience: audience,
    });
    if (eligibilityError) return json(503, { error: 'Notification authorization check unavailable.' });
    if (eligible !== true) return json(200, { sent: 0, message: 'Recipient no longer has access to this notification.' });

    const { data: recipient } = await service
      .from(audience === 'customer' ? 'customer_profiles' : 'admin_profiles')
      .select('id').eq('id', notification.recipient_id).eq('is_active', true).maybeSingle();
    if (!recipient) return json(200, { sent: 0, message: 'Recipient is inactive.' });

    const { data: subscriptions, error: subscriptionsError } = await service
      .from('push_subscriptions')
      .select('id,device_token')
      .eq('user_id', notification.recipient_id)
      .eq('platform', 'android')
      .not('device_token', 'is', null);
    if (subscriptionsError) return json(500, { error: 'Could not load Android devices.' });
    if (!subscriptions?.length) return json(200, { sent: 0, message: 'No registered Android devices.' });

    const accessToken = await getGoogleAccessToken(serviceAccount);
    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`;
    const payload = {
      message: {
        token: '',
        notification: {
          title: String(notification.title || (audience === 'customer' ? 'ANSHA Trading' : 'ANSHA Admin')),
          body: String(notification.body || 'You have a new notification.'),
        },
        data: {
          url: audience === 'customer' ? safeCustomerUrl(notification.href) : safeAdminUrl(notification.href),
          notificationId: notification.id,
        },
        android: {
          priority: 'HIGH',
          notification: { channel_id: 'ansha_default' },
        },
      },
    };

    let sent = 0;
    const staleIds: string[] = [];
    await Promise.all(subscriptions.map(async (subscription) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          message: { ...payload.message, token: subscription.device_token },
        }),
      });
      if (response.ok) {
        sent += 1;
        return;
      }
      const result = await response.json().catch(() => ({}));
      if (JSON.stringify(result).includes('UNREGISTERED')) staleIds.push(subscription.id);
      console.error('FCM delivery failed:', response.status, result);
    }));

    if (staleIds.length) await service.from('push_subscriptions').delete().in('id', staleIds);
    return json(200, { sent, failed: subscriptions.length - sent });
  } catch (error) {
    console.error('Admin push delivery failed:', error);
    return json(500, { error: 'Native push delivery failed.' });
  }
});

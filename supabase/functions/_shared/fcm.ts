type FcmServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

type FcmMessageInput = {
  token: string;
  title: string;
  body: string;
  url: string;
  topic: string;
  tag?: string;
};

type FcmSendResult = {
  messageName: string;
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function base64UrlEncode(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToDer(privateKey: string) {
  const base64 = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createServiceAccountAssertion(account: Required<Pick<FcmServiceAccount, 'client_email' | 'private_key'>>) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken),
  );
  return `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getAccessToken(account: Required<Pick<FcmServiceAccount, 'client_email' | 'private_key'>>) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  const assertion = await createServiceAccountAssertion(account);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error(`FCM OAuth token request failed (${response.status}).`);
  }

  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  };
  return payload.access_token;
}

function parseServiceAccount() {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!raw) return null;

  let account: FcmServiceAccount;
  try {
    account = JSON.parse(raw) as FcmServiceAccount;
  } catch {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON must include project_id, client_email, and private_key.');
  }
  return account as Required<Pick<FcmServiceAccount, 'project_id' | 'client_email' | 'private_key'>>;
}

export function isFcmConfigured() {
  return Boolean(Deno.env.get('FCM_SERVICE_ACCOUNT_JSON'));
}

export function isFcmStaleError(error: unknown) {
  return error instanceof Error && error.message === 'FCM token is no longer registered.';
}

export async function sendFcmMessage(input: FcmMessageInput): Promise<FcmSendResult> {
  const account = parseServiceAccount();
  if (!account) throw new Error('FCM_SERVICE_ACCOUNT_JSON is not configured.');

  const accessToken = await getAccessToken(account);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        message: {
          token: input.token,
          notification: { title: input.title, body: input.body },
          data: {
            url: input.url,
            topic: input.topic,
            ...(input.tag ? { tag: input.tag } : {}),
          },
          android: {
            priority: 'high',
            notification: { channel_id: 'ansha_default', tag: input.tag || input.topic },
          },
        },
      }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (response.ok && typeof payload.name === 'string') return { messageName: payload.name };

  const details = Array.isArray(payload?.error?.details) ? payload.error.details : [];
  const errorCode = details.find((detail: unknown) => (
    detail && typeof detail === 'object' && 'errorCode' in detail
  )) as { errorCode?: string } | undefined;
  if (errorCode?.errorCode === 'UNREGISTERED' || errorCode?.errorCode === 'INVALID_ARGUMENT') {
    throw new Error('FCM token is no longer registered.');
  }
  throw new Error(`FCM send failed (${response.status}).`);
}

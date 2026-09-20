/**
 * Tawk.to webhook receiver.
 *
 * Verifies HMAC-SHA1 (X-Tawk-Signature) with Edge secret TAWK_WEBHOOK_SECRET,
 * dedupes on X-Hook-Event-Id, and upserts chat sessions / tickets for admin Live chat.
 *
 * Deploy with JWT verification disabled (Tawk cannot send a Supabase JWT):
 *   supabase functions deploy tawk-webhook --no-verify-jwt
 *
 * Configure in Tawk dashboard → Administration → Settings → Webhooks:
 *   URL: https://<project-ref>.supabase.co/functions/v1/tawk-webhook
 *   Events: Chat Start, Chat End, New ticket (optional: New Chat Transcript — ignored for UI)
 *   Secret: same value as TAWK_WEBHOOK_SECRET
 */
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function verifySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return timingSafeEqualHex(toHex(digest), signature.toLowerCase());
}

function asString(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('TAWK_WEBHOOK_SECRET');

  if (!url || !serviceKey) {
    return json({ error: 'Supabase is not configured.' }, 500);
  }
  if (!webhookSecret) {
    return json({ error: 'TAWK_WEBHOOK_SECRET is not set.', code: 'TAWK_WEBHOOK_NOT_CONFIGURED' }, 503);
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-tawk-signature');
  if (!(await verifySignature(rawBody, signature, webhookSecret))) {
    return json({ error: 'Invalid signature.' }, 401);
  }

  const hookEventId =
    request.headers.get('x-hook-event-id') ||
    request.headers.get('X-Hook-Event-Id') ||
    '';

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }

  const eventType = asString(payload.event, 80);
  if (!eventType) {
    return json({ error: 'Missing event.' }, 400);
  }

  const serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (hookEventId) {
    const { error: receiptError } = await serviceClient.from('tawk_webhook_receipts').insert({
      hook_event_id: hookEventId.slice(0, 200),
      event_type: eventType,
    });
    if (receiptError) {
      // Unique violation = retry; acknowledge success so Tawk stops retrying.
      if (receiptError.code === '23505') {
        return json({ ok: true, deduped: true });
      }
      console.error('tawk webhook receipt error', receiptError);
      return json({ error: 'Failed to record receipt.' }, 500);
    }
  }

  const property = asObject(payload.property);
  const propertyId = asString(property?.id, 80);
  const eventTime = asString(payload.time) || new Date().toISOString();

  if (eventType === 'chat:start') {
    const chatId = asString(payload.chatId, 120);
    if (!chatId) return json({ error: 'Missing chatId.' }, 400);

    const visitor = asObject(payload.visitor);
    const message = asObject(payload.message);
    const firstMessage = asString(message?.text, 2000);

    const { error } = await serviceClient.from('tawk_chat_sessions').upsert(
      {
        chat_id: chatId,
        property_id: propertyId,
        status: 'open',
        visitor_name: asString(visitor?.name, 200),
        visitor_email: asString(visitor?.email, 320),
        visitor_city: asString(visitor?.city, 120),
        visitor_country: asString(visitor?.country, 8),
        domain: asString(payload.domain, 200),
        referrer: asString(payload.referrer, 1000),
        first_message: firstMessage,
        started_at: eventTime,
        ended_at: null,
        last_event_at: eventTime,
        dismissed_at: null,
        last_hook_event_id: hookEventId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'chat_id' }
    );

    if (error) {
      console.error('tawk chat:start upsert error', error);
      return json({ error: 'Failed to store chat start.' }, 500);
    }
    return json({ ok: true, event: eventType, chatId });
  }

  if (eventType === 'chat:end') {
    const chatId = asString(payload.chatId, 120);
    if (!chatId) return json({ error: 'Missing chatId.' }, 400);

    const visitor = asObject(payload.visitor);
    const { data: existing } = await serviceClient
      .from('tawk_chat_sessions')
      .select('chat_id')
      .eq('chat_id', chatId)
      .maybeSingle();

    if (existing) {
      const { error } = await serviceClient
        .from('tawk_chat_sessions')
        .update({
          status: 'ended',
          ended_at: eventTime,
          last_event_at: eventTime,
          last_hook_event_id: hookEventId || null,
          visitor_name: asString(visitor?.name, 200) ?? undefined,
          visitor_email: asString(visitor?.email, 320) ?? undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('chat_id', chatId);

      if (error) {
        console.error('tawk chat:end update error', error);
        return json({ error: 'Failed to store chat end.' }, 500);
      }
    } else {
      const { error } = await serviceClient.from('tawk_chat_sessions').insert({
        chat_id: chatId,
        property_id: propertyId,
        status: 'ended',
        visitor_name: asString(visitor?.name, 200),
        visitor_email: asString(visitor?.email, 320),
        visitor_city: asString(visitor?.city, 120),
        visitor_country: asString(visitor?.country, 8),
        domain: asString(payload.domain, 200),
        referrer: asString(payload.referrer, 1000),
        started_at: eventTime,
        ended_at: eventTime,
        last_event_at: eventTime,
        last_hook_event_id: hookEventId || null,
      });
      if (error) {
        console.error('tawk chat:end insert error', error);
        return json({ error: 'Failed to store chat end.' }, 500);
      }
    }
    return json({ ok: true, event: eventType, chatId });
  }

  if (eventType === 'ticket:create') {
    const ticket = asObject(payload.ticket);
    const requester = asObject(payload.requester);
    const ticketId = asString(ticket?.id, 120);
    if (!ticketId) return json({ error: 'Missing ticket.id.' }, 400);

    const humanId = typeof ticket?.humanId === 'number' ? ticket.humanId : null;

    const { error } = await serviceClient.from('tawk_ticket_events').upsert(
      {
        ticket_id: ticketId,
        human_id: humanId,
        subject: asString(ticket?.subject, 500),
        message_preview: asString(ticket?.message, 2000),
        requester_name: asString(requester?.name, 200),
        requester_email: asString(requester?.email, 320),
        property_id: propertyId,
        event_time: eventTime,
        hook_event_id: hookEventId || null,
        dismissed_at: null,
      },
      { onConflict: 'ticket_id' }
    );

    if (error) {
      console.error('tawk ticket:create upsert error', error);
      return json({ error: 'Failed to store ticket.' }, 500);
    }
    return json({ ok: true, event: eventType, ticketId });
  }

  // chat:transcript_created and unknown events: accept so Tawk does not retry.
  return json({ ok: true, event: eventType, ignored: true });
});

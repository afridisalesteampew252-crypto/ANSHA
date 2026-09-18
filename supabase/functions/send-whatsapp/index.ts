import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { corsHeaders, json } from '../_shared/cors.ts';

const E164_RE = /^\+[1-9]\d{7,14}$/;

function normalizeE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  let phone = digits.startsWith('+') ? digits : `+${digits.replace(/^\+/, '')}`;
  phone = phone.replace(/^\+0+/, '+');
  if (!E164_RE.test(phone)) return null;
  return phone;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN') || Deno.env.get('WHATSAPP_CLOUD_API_TOKEN');
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    const apiVersion = Deno.env.get('WHATSAPP_API_VERSION') || 'v21.0';
    const authorization = request.headers.get('Authorization') || '';

    if (!url || !anonKey || !serviceKey) {
      return json(request, { error: 'WhatsApp service is not configured.' }, 500);
    }
    if (!authorization.startsWith('Bearer ')) {
      return json(request, { error: 'Authentication required.' }, 401);
    }

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
      .select('id, role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.is_active === false || !['admin', 'staff'].includes(profile.role)) {
      return json(request, { error: 'Only ops staff can send WhatsApp messages.' }, 403);
    }

    const payload = await request.json().catch(() => ({}));
    const action = String(payload.action || 'send').trim();

    const configured = Boolean(accessToken && phoneNumberId);
    if (action === 'status') {
      return json(request, { configured });
    }

    if (!configured) {
      return json(request, {
        error: 'WhatsApp Cloud API is not configured.',
        code: 'WHATSAPP_NOT_CONFIGURED',
        configured: false,
        setup: {
          secrets: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
          docs: 'Set Edge Function secrets for send-whatsapp. See docs/Deployment.md.',
        },
      }, 503);
    }

    const messageType = String(payload.message_type || payload.type || 'text').trim() as 'text' | 'template';
    if (!['text', 'template'].includes(messageType)) {
      return json(request, { error: 'message_type must be text or template.' }, 422);
    }

    const toRaw = String(payload.to || payload.phone || '').trim();
    const toPhone = normalizeE164(toRaw);
    if (!toPhone) {
      return json(request, { error: 'Phone must be E.164 (e.g. +971501234567).' }, 422);
    }

    const customerId = payload.customer_id ? String(payload.customer_id).trim() : null;
    const bodyText = String(payload.body || payload.text || '').trim();
    const templateName = String(payload.template_name || payload.template || '').trim();
    const templateLanguage = String(payload.template_language || 'en_US').trim() || 'en_US';

    if (messageType === 'text') {
      if (!bodyText || bodyText.length > 4096) {
        return json(request, { error: 'Text body is required (max 4096 characters).' }, 422);
      }
    } else if (!templateName || templateName.length > 120) {
      return json(request, { error: 'template_name is required for template messages.' }, 422);
    }

    const graphBody =
      messageType === 'text'
        ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone.replace(/^\+/, ''),
          type: 'text',
          text: { preview_url: false, body: bodyText },
        }
        : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLanguage },
          },
        };

    const graphUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const graphRes = await fetch(graphUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphBody),
    });

    const rawResponse = await graphRes.json().catch(() => ({ parse_error: true }));
    const waMessageId =
      typeof rawResponse === 'object' && rawResponse && Array.isArray(rawResponse.messages)
        ? String(rawResponse.messages[0]?.id || '') || null
        : null;

    const ok = graphRes.ok && Boolean(waMessageId);
    const errorMessage = ok
      ? null
      : String(
        (rawResponse as { error?: { message?: string } })?.error?.message
          || `Meta API HTTP ${graphRes.status}`
      ).slice(0, 2000);

    const { data: logRow, error: logError } = await serviceClient
      .from('whatsapp_message_log')
      .insert({
        direction: 'outbound',
        message_type: messageType,
        to_phone: toPhone,
        customer_id: customerId || null,
        template_name: messageType === 'template' ? templateName : null,
        body: messageType === 'text' ? bodyText : (templateName ? `template:${templateName}` : null),
        wa_message_id: waMessageId,
        status: ok ? 'sent' : 'failed',
        error_message: errorMessage,
        raw_response: rawResponse,
        sent_by: profile.id,
      })
      .select('id, status, wa_message_id, created_at')
      .single();

    if (logError) {
      return json(request, {
        error: ok
          ? `Message sent but log failed: ${logError.message}`
          : errorMessage || 'Send failed.',
        configured: true,
        wa_message_id: waMessageId,
      }, ok ? 200 : 502);
    }

    if (!ok) {
      return json(request, {
        error: errorMessage || 'WhatsApp send failed.',
        configured: true,
        log: logRow,
        raw: rawResponse,
      }, 502);
    }

    return json(request, {
      configured: true,
      wa_message_id: waMessageId,
      to: toPhone,
      message_type: messageType,
      log: logRow,
    });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Unknown WhatsApp error.' }, 500);
  }
});

export type WhatsAppMessageType = 'text' | 'template';

export type WhatsAppStatusResult = {
  configured: boolean;
};

export type WhatsAppSendResult = {
  configured: boolean;
  wa_message_id?: string;
  to?: string;
  message_type?: WhatsAppMessageType;
  log?: {
    id: string;
    status: string;
    wa_message_id: string | null;
    created_at: string;
  };
  error?: string;
  code?: string;
};

export function normalizeE164(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const withPlus = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  const phone = withPlus.replace(/^\+0+/, '+');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return phone;
}

async function invokeWhatsApp(body: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const { supabase } = await import('@/lib/supabase/client');
  const { data, error } = await supabase.functions.invoke('send-whatsapp', { body });
  if (error || data?.error) {
    const err = new Error(data?.error || error?.message || 'WhatsApp request failed.') as Error & {
      code?: string;
      configured?: boolean;
    };
    err.code = data?.code;
    err.configured = data?.configured;
    throw err;
  }
  return data as WhatsAppSendResult;
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatusResult> {
  try {
    const result = await invokeWhatsApp({ action: 'status' });
    return { configured: Boolean(result.configured) };
  } catch (error) {
    const configured =
      typeof error === 'object' && error && 'configured' in error
        ? Boolean((error as { configured?: boolean }).configured)
        : false;
    // Missing function deploy or auth still surfaces as not configured for the UI.
    return { configured };
  }
}

export async function sendWhatsAppMessage(input: {
  to: string;
  message_type: WhatsAppMessageType;
  body?: string;
  template_name?: string;
  template_language?: string;
  customer_id?: string | null;
}): Promise<WhatsAppSendResult> {
  const to = normalizeE164(input.to);
  if (!to) throw new Error('Phone must be E.164 (e.g. +971501234567).');

  return invokeWhatsApp({
    action: 'send',
    to,
    message_type: input.message_type,
    body: input.body,
    template_name: input.template_name,
    template_language: input.template_language || 'en_US',
    customer_id: input.customer_id || null,
  });
}

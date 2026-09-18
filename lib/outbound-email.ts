export type SendOutboundEmailInput = {
  to_email: string;
  subject: string;
  body: string;
  related_invoice_id?: string | null;
};

export type SendOutboundEmailResult = {
  status: 'sent';
  log_id: string | null;
  provider_message_id: string | null;
  created_at: string | null;
};

export async function sendOutboundEmail(input: SendOutboundEmailInput): Promise<SendOutboundEmailResult> {
  const { supabase } = await import('@/lib/supabase/client');
  const { data, error } = await supabase.functions.invoke('send-outbound-email', {
    body: {
      to_email: input.to_email.trim().toLowerCase(),
      subject: input.subject.trim().slice(0, 300),
      body: input.body.trim().slice(0, 50000),
      related_invoice_id: input.related_invoice_id || null,
    },
  });

  if (error || data?.error || data?.status === 'failed') {
    throw new Error(data?.error || error?.message || 'Outbound email send failed.');
  }

  return data as SendOutboundEmailResult;
}

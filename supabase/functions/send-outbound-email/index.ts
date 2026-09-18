import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { corsHeaders, json } from '../_shared/cors.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function previewBody(body: string) {
  const normalized = body.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 500);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = (Deno.env.get('RESEND_FROM_EMAIL') || 'ANSHA Trading <noreply@anshatradingco.com>').trim();
    const authorization = request.headers.get('Authorization') || '';

    if (!url || !anonKey) {
      return json(request, { error: 'Email service is not configured (Supabase env missing).' }, 500);
    }
    if (!resendKey) {
      return json(request, {
        error:
          'RESEND_API_KEY is not set on the Edge Function. Add it with `supabase secrets set RESEND_API_KEY=re_...` (see docs/Deployment.md).',
      }, 503);
    }
    if (!authorization.startsWith('Bearer ')) {
      return json(request, { error: 'Authentication required.' }, 401);
    }

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return json(request, { error: 'Your session is invalid. Sign in again.' }, 401);

    const { data: profile, error: profileError } = await callerClient
      .from('admin_profiles')
      .select('id, role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) return json(request, { error: 'Could not verify ops access.' }, 500);
    if (!profile || profile.is_active === false || !['admin', 'staff'].includes(profile.role)) {
      return json(request, { error: 'Only active ops staff (admin/staff) can send outbound email.' }, 403);
    }

    const payload = await request.json();
    const toEmail = String(payload.to_email || payload.to || '').trim().toLowerCase();
    const subject = String(payload.subject || '').trim();
    const body = String(payload.body || '').trim();
    const relatedInvoiceId = payload.related_invoice_id
      ? String(payload.related_invoice_id).trim()
      : null;

    if (!toEmail || !EMAIL_RE.test(toEmail)) {
      return json(request, { error: 'Enter a valid recipient email address.' }, 422);
    }
    if (!subject || subject.length > 300) {
      return json(request, { error: 'Subject is required (max 300 characters).' }, 422);
    }
    if (!body || body.length > 50000) {
      return json(request, { error: 'Body is required (max 50,000 characters).' }, 422);
    }
    if (relatedInvoiceId && !/^[0-9a-f-]{36}$/i.test(relatedInvoiceId)) {
      return json(request, { error: 'related_invoice_id must be a UUID when provided.' }, 422);
    }

    let providerMessageId: string | null = null;
    let sendError: string | null = null;
    let status: 'sent' | 'failed' = 'failed';

    try {
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          subject,
          text: body,
        }),
      });

      const resendPayload = await resendResponse.json().catch(() => ({}));
      if (!resendResponse.ok) {
        sendError = String(
          (resendPayload as { message?: string; error?: string }).message
            || (resendPayload as { error?: string }).error
            || `Resend HTTP ${resendResponse.status}`
        ).slice(0, 2000);
      } else {
        providerMessageId = String((resendPayload as { id?: string }).id || '') || null;
        status = 'sent';
      }
    } catch (error) {
      sendError = (error instanceof Error ? error.message : 'Resend request failed.').slice(0, 2000);
    }

    const logRow = {
      to_email: toEmail,
      subject,
      body_preview: previewBody(body),
      status,
      provider: 'resend',
      provider_message_id: providerMessageId,
      error_message: sendError,
      related_invoice_id: relatedInvoiceId,
      created_by: user.id,
    };

    const { data: logged, error: logError } = await callerClient
      .from('outbound_email_log')
      .insert(logRow)
      .select('id, status, provider_message_id, created_at')
      .maybeSingle();

    if (logError) {
      return json(request, {
        error: status === 'sent'
          ? `Email sent but log insert failed: ${logError.message}`
          : `Send failed (${sendError || 'unknown'}) and log insert failed: ${logError.message}`,
        status,
        provider_message_id: providerMessageId,
      }, status === 'sent' ? 502 : 500);
    }

    if (status !== 'sent') {
      return json(request, {
        error: sendError || 'Email provider rejected the message.',
        status: 'failed',
        log_id: logged?.id ?? null,
      }, 502);
    }

    return json(request, {
      status: 'sent',
      log_id: logged?.id ?? null,
      provider_message_id: providerMessageId,
      created_at: logged?.created_at ?? null,
    });
  } catch (error) {
    return json(request, {
      error: error instanceof Error ? error.message : 'Unknown outbound email error.',
    }, 500);
  }
});

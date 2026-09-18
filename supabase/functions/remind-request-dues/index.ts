import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { corsHeaders, json } from '../_shared/cors.ts';

function authorized(request: Request) {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authorization = request.headers.get('Authorization') || '';
  if (!cronSecret) return false;
  return authorization === `Bearer ${cronSecret}`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST' && request.method !== 'GET') {
    return json(request, { error: 'Method not allowed.' }, 405);
  }

  try {
    if (!authorized(request)) {
      return json(request, { error: 'Unauthorized.' }, 401);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) {
      return json(request, { error: 'Reminder service is not configured.' }, 500);
    }

    const serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await serviceClient.rpc('process_workspace_request_due_reminders');
    if (error) return json(request, { error: error.message }, 500);

    return json(request, {
      ok: true,
      result: data ?? { due_soon: 0, overdue: 0 },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected reminder failure.';
    return json(request, { error: message }, 500);
  }
});

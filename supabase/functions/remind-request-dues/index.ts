import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { corsHeaders, json } from '../_shared/cors.ts';

// Deployed with verify_jwt = false (see supabase/config.toml): the Supabase gateway does not
// check a JWT here, so this shared-secret check is the only gate. The caller
// (app/api/cron/request-dues/route.ts) sends the secret in `x-cron-secret` and, for
// backwards compatibility, as `Authorization: Bearer <CRON_SECRET>`.

function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

function authorized(request: Request) {
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  if (cronSecret.length < 16) return false;
  const headerSecret = request.headers.get('x-cron-secret') || '';
  const authorization = request.headers.get('Authorization') || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  return (
    (headerSecret !== '' && timingSafeEqual(headerSecret, cronSecret)) ||
    (bearer !== '' && timingSafeEqual(bearer, cronSecret))
  );
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

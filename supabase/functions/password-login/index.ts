import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { corsHeaders } from '../_shared/cors.ts';
import { parsePasswordLogin, passwordLoginFailure, passwordLoginIdentifier, wrongPassword, type LoginState } from '../_shared/password-login.ts';

function reply(request: Request, body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { ...corsHeaders(request), 'Cache-Control': 'no-store' } });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 8192) return reply(request, { error: 'Sign-in request is too large.' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return reply(request, { error: 'Invalid sign-in request.' }, 422); }
    const credentials = parsePasswordLogin(body);
    if (!credentials) return reply(request, { error: 'Enter a valid email and password.' }, 422);
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) return reply(request, { error: 'Sign-in is temporarily unavailable.' }, 503);
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const service = createClient(url, serviceKey, options);
    const client = createClient(url, anonKey, options);
    // Scope is intentionally excluded: switching login screens cannot bypass the lockout.
    const identifier = await passwordLoginIdentifier(credentials.email);
    const { data: claimed, error: claimError } = await service.rpc('claim_password_login_attempt', { p_identifier_hash: identifier });
    if (claimError || !claimed) return reply(request, { error: 'Sign-in protection is temporarily unavailable. Please try again later.' }, 503);
    const claim = claimed as LoginState;
    if (!claim.allowed) return reply(request, passwordLoginFailure(claim), 429);

    let outcome: boolean | null = null;
    let result: Awaited<ReturnType<typeof client.auth.signInWithPassword>> | null = null;
    try {
      result = await client.auth.signInWithPassword({ email: credentials.email, password: credentials.password });
      outcome = result.data.session ? true : wrongPassword(result.error) ? false : null;
    } catch { /* Release the reservation below; a network failure is not a wrong password. */ }
    const { data: finished, error: finishError } = await service.rpc('finish_password_login_attempt', {
      p_identifier_hash: identifier, p_reservation: claim.reservation, p_valid: outcome,
    });
    if (finishError || !finished) return reply(request, { error: 'Sign-in protection is temporarily unavailable. Please try again later.' }, 503);
    const state = finished as LoginState;
    if (outcome === false || state.retry_after > 0) return reply(request, passwordLoginFailure(state), state.retry_after > 0 ? 429 : 401);
    if (!result?.data.session) {
      return reply(request, { error: result?.error?.code === 'email_not_confirmed'
        ? 'Verify your email before signing in.' : 'Sign-in could not be completed. Please try again later.' }, 400);
    }
    return reply(request, { session: { access_token: result.data.session.access_token, refresh_token: result.data.session.refresh_token } });
  } catch {
    return reply(request, { error: 'Sign-in could not be completed. Please try again later.' }, 503);
  }
});

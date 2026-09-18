import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { corsHeaders, json } from '../_shared/cors.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization') || '';
    if (!url || !anonKey || !serviceKey) return json(request, { error: 'User service is not configured.' }, 500);
    if (!authorization.startsWith('Bearer ')) return json(request, { error: 'Authentication required.' }, 401);

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return json(request, { error: 'Your session is invalid. Sign in again.' }, 401);

    const { data: callerProfile, error: profileReadError } = await serviceClient
      .from('admin_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileReadError) return json(request, { error: 'Could not verify administrator access.' }, 500);
    if (callerProfile?.role !== 'admin') return json(request, { error: 'Only an administrator can update users.' }, 403);

    const payload = await request.json();
    const id = String(payload.id || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const fullName = String(payload.full_name || '').trim();
    const role = String(payload.role || '');
    if (!UUID_RE.test(id)) return json(request, { error: 'Invalid user details.' }, 422);
    if (!email || !email.includes('@')) return json(request, { error: 'Enter a valid email address.' }, 422);
    if (!fullName) return json(request, { error: 'Full name is required.' }, 422);
    if (!['admin', 'staff'].includes(role)) return json(request, { error: 'Choose a valid role.' }, 422);
    if (password && password.length < 8) return json(request, { error: 'Password must contain at least 8 characters.' }, 422);

    const authUpdate: { email: string; password?: string; email_confirm: boolean } = { email, email_confirm: true };
    if (password) authUpdate.password = password;
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(id, authUpdate);
    if (updateError) return json(request, { error: updateError.message }, 400);

    const { error: profileError } = await serviceClient
      .from('admin_profiles')
      .update({ email, full_name: fullName, role, avatar_url: payload.avatar_url || null })
      .eq('id', id);
    if (profileError) return json(request, { error: profileError.message }, 500);

    return json(request, { id });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Unknown user update error.' }, 500);
  }
});

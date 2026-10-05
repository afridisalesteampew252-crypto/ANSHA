import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { corsHeaders, json } from '../_shared/cors.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization') || '';
    if (!url || !anonKey || !serviceKey) return json(request, { error: 'Portal service is not configured.' }, 500);
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

    const { data: callerProfile } = await serviceClient
      .from('admin_profiles')
      .select('role,is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (callerProfile?.role !== 'admin' || callerProfile?.is_active === false) {
      return json(request, { error: 'Only an active administrator can change customer portal passwords.' }, 403);
    }

    const payload = await request.json();
    const customerId = String(payload.customer_id || '').trim();
    const password = String(payload.password || '');

    if (!/^[0-9a-f-]{36}$/i.test(customerId)) return json(request, { error: 'A valid customer id is required.' }, 422);
    if (password.length < 8) return json(request, { error: 'Password must be at least 8 characters.' }, 422);

    const { data: profile, error: profileError } = await serviceClient
      .from('customer_profiles')
      .select('id,email,is_active')
      .eq('customer_id', customerId)
      .maybeSingle();

    if (profileError) return json(request, { error: 'Could not load the customer portal account.' }, 500);
    if (!profile) return json(request, { error: 'This customer does not have portal access.' }, 404);
    if (!profile.is_active) return json(request, { error: 'This customer portal account is inactive.' }, 422);

    const { error: updateError } = await serviceClient.auth.admin.updateUserById(profile.id, { password });
    if (updateError) return json(request, { error: updateError.message }, 400);

    return json(request, { success: true, email: profile.email });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Unknown password reset error.' }, 500);
  }
});

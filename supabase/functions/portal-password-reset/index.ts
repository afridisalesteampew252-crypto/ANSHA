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
    if (!url || !anonKey || !serviceKey) return json(request, { error: 'Password recovery is not configured.' }, 503);
    if (!authorization.startsWith('Bearer ')) return json(request, { error: 'Authentication required.' }, 401);
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json(request, { error: 'Your session is invalid. Sign in again.' }, 401);
    const { data: profile, error: roleError } = await service.from('admin_profiles').select('role,is_active').eq('id', user.id).maybeSingle();
    if (roleError) return json(request, { error: 'Could not verify administrator access.' }, 503);
    if (profile?.role !== 'admin' || profile.is_active !== true) return json(request, { error: 'Only an active account administrator can request a customer password reset.' }, 403);
    const body = await request.json();
    const customerId = typeof body.customer_id === 'string' ? body.customer_id : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)) return json(request, { error: 'A valid customer id is required.' }, 422);
    const { data: portal, error: portalError } = await service.from('customer_profiles').select('id,email,is_active').eq('customer_id', customerId).maybeSingle();
    const { data: customer, error: customerError } = await service.from('customers').select('is_active').eq('id', customerId).maybeSingle();
    if (portalError || customerError) return json(request, { error: 'Could not verify the customer portal account.' }, 503);
    if (!portal?.is_active || !customer?.is_active) return json(request, { error: 'Active customer portal account not found.' }, 404);
    // Use Auth's current email, never an address supplied by the caller or stale CRM data.
    const { data: authData, error: userError } = await service.auth.admin.getUserById(portal.id);
    if (userError || !authData.user?.email) return json(request, { error: 'Could not verify the customer login.' }, 503);
    const { error: auditError } = await caller.rpc('audit_customer_password_reset_request', { p_customer_id: customerId });
    if (auditError) return json(request, { error: 'Could not authorize and record the reset request.' }, 403);
    const redirectTo = `${Deno.env.get('PUBLIC_SITE_URL') || 'https://www.anshatradingco.com'}/portal/reset-password`;
    const { error: resetError } = await service.auth.resetPasswordForEmail(authData.user.email, { redirectTo });
    if (resetError) return json(request, { error: 'The reset email could not be sent. Please try again later.' }, 502);
    return json(request, { email: authData.user.email });
  } catch {
    return json(request, { error: 'Password recovery could not be completed.' }, 500);
  }
});

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

    const { data: callerProfile, error: profileReadError } = await serviceClient
      .from('admin_profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();
    if (profileReadError) return json(request, { error: 'Could not verify administrator access.' }, 500);
    if (callerProfile?.role !== 'admin' || callerProfile?.is_active === false) {
      return json(request, { error: 'Only an active administrator can enable portal access.' }, 403);
    }

    const payload = await request.json();
    const customerId = String(payload.customer_id || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const fullName = String(payload.full_name || '').trim();

    if (!customerId || !/^[0-9a-f-]{36}$/i.test(customerId)) {
      return json(request, { error: 'A valid customer id is required.' }, 422);
    }
    if (!email || !email.includes('@')) return json(request, { error: 'Enter a valid email address.' }, 422);
    if (password.length < 8) return json(request, { error: 'Temporary password must be at least 8 characters.' }, 422);

    const { data: customer, error: customerError } = await serviceClient
      .from('customers')
      .select('id, full_name, email, is_active')
      .eq('id', customerId)
      .maybeSingle();
    if (customerError) return json(request, { error: 'Could not load the customer.' }, 500);
    if (!customer) return json(request, { error: 'Customer not found.' }, 404);
    if (!customer.is_active) return json(request, { error: 'Customer is inactive.' }, 422);

    const { data: existingLink } = await serviceClient
      .from('customer_profiles')
      .select('id')
      .eq('customer_id', customerId)
      .maybeSingle();
    if (existingLink) return json(request, { error: 'This customer already has portal access.' }, 409);

    const displayName = fullName || customer.full_name || email;

    const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName, portal: 'customer' },
      app_metadata: { portal_role: 'customer' },
    });
    if (createError || !created.user) {
      const duplicate = createError?.message.toLowerCase().includes('already');
      return json(request, {
        error: duplicate
          ? 'A login with this email already exists. Use a different email or remove the existing Auth user first.'
          : createError?.message || 'Could not create the portal account.',
      }, duplicate ? 409 : 400);
    }

    // Never put customers in admin_profiles.
    const { data: staffCollision } = await serviceClient
      .from('admin_profiles')
      .select('id')
      .eq('id', created.user.id)
      .maybeSingle();
    if (staffCollision) {
      await serviceClient.auth.admin.deleteUser(created.user.id);
      return json(request, { error: 'That Auth user is already a staff account.' }, 409);
    }

    const { error: profileError } = await serviceClient.from('customer_profiles').insert({
      id: created.user.id,
      customer_id: customerId,
      email,
      full_name: displayName,
      is_active: true,
    });

    if (profileError) {
      await serviceClient.auth.admin.deleteUser(created.user.id);
      return json(request, { error: `Portal profile could not be created: ${profileError.message}` }, 500);
    }

    return json(request, {
      id: created.user.id,
      customer_id: customerId,
      email,
      full_name: displayName,
    }, 201);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Unknown portal access error.' }, 500);
  }
});

import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization') || '';
    if (!url || !anonKey || !serviceKey) return json({ error: 'User service is not configured.' }, 500);
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Authentication required.' }, 401);

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return json({ error: 'Your session is invalid. Sign in again.' }, 401);

    const { data: callerProfile, error: profileReadError } = await serviceClient
      .from('admin_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileReadError) return json({ error: 'Could not verify administrator access.' }, 500);
    if (callerProfile?.role !== 'admin') return json({ error: 'Only an administrator can create users.' }, 403);

    const payload = await request.json();
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const fullName = String(payload.full_name || '').trim();
    const role = String(payload.role || 'staff');
    if (!email || !email.includes('@')) return json({ error: 'Enter a valid email address.' }, 422);
    if (password.length < 8) return json({ error: 'Temporary password must be at least 8 characters.' }, 422);
    if (!fullName) return json({ error: 'Full name is required.' }, 422);
    if (!['admin', 'staff'].includes(role)) return json({ error: 'Choose a valid role.' }, 422);

    const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (createError || !created.user) {
      const duplicate = createError?.message.toLowerCase().includes('already');
      return json({ error: duplicate ? 'A user with this email already exists.' : createError?.message || 'Could not create the account.' }, duplicate ? 409 : 400);
    }

    const { error: profileError } = await serviceClient.from('admin_profiles').upsert({
      id: created.user.id,
      email,
      full_name: fullName,
      role,
      avatar_url: payload.avatar_url || null,
    }, { onConflict: 'id' });

    if (profileError) {
      await serviceClient.auth.admin.deleteUser(created.user.id);
      return json({ error: `Account profile could not be created: ${profileError.message}` }, 500);
    }

    return json({ id: created.user.id, email, full_name: fullName, role }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown user creation error.' }, 500);
  }
});

import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = request.headers.get('Authorization') || '';
    const admin = createClient(url, serviceKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) throw new Error('Authentication required.');
    const { data: profile } = await admin.from('admin_profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') throw new Error('Administrator access required.');
    const { email, password, full_name, role } = await request.json();
    if (!email || !password || !full_name || !['admin', 'staff'].includes(role)) throw new Error('Invalid user details.');
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError) throw createError;
    const { error: profileError } = await admin.from('admin_profiles').insert({ id: created.user.id, email, full_name, role });
    if (profileError) { await admin.auth.admin.deleteUser(created.user.id); throw profileError; }
    return Response.json({ id: created.user.id }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400, headers: cors });
  }
});

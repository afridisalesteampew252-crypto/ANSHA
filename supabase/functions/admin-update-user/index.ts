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
    const { data: caller } = await admin.from('admin_profiles').select('role').eq('id', user.id).maybeSingle();
    if (caller?.role !== 'admin') throw new Error('Administrator access required.');

    const { id, email, password, full_name, role, avatar_url } = await request.json();
    if (!id || !email || !full_name || !['admin', 'staff'].includes(role)) throw new Error('Invalid user details.');
    if (password && password.length < 8) throw new Error('Password must contain at least 8 characters.');

    const authUpdate: { email: string; password?: string; email_confirm: boolean } = { email, email_confirm: true };
    if (password) authUpdate.password = password;
    const { error: updateError } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (updateError) throw updateError;

    const { error: profileError } = await admin
      .from('admin_profiles')
      .update({ email, full_name, role, avatar_url: avatar_url || null })
      .eq('id', id);
    if (profileError) throw profileError;

    return Response.json({ id }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400, headers: cors });
  }
});

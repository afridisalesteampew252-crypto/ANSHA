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
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();
    if (profileReadError) return json(request, { error: 'Could not verify administrator access.' }, 500);
    if (callerProfile?.role !== 'admin' || callerProfile?.is_active === false) {
      return json(request, { error: 'Only an active administrator can create users.' }, 403);
    }

    const payload = await request.json();
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const fullName = String(payload.full_name || '').trim();
    const role = String(payload.role || 'staff');
    if (!email || !email.includes('@')) return json(request, { error: 'Enter a valid email address.' }, 422);
    if (password.length < 8) return json(request, { error: 'Temporary password must be at least 8 characters.' }, 422);
    if (!fullName) return json(request, { error: 'Full name is required.' }, 422);
    if (!['admin', 'staff', 'sales', 'freelancer', 'manager', 'accounts'].includes(role)) return json(request, { error: 'Choose a valid role.' }, 422);

    const allowedOrigins = sanitizeOrigins(payload.allowed_stock_origins, role);
    const officeId = optionalUuid(payload.office_id);
    const shiftId = optionalUuid(payload.shift_id);

    const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (createError || !created.user) {
      const duplicate = createError?.message.toLowerCase().includes('already');
      return json(request, { error: duplicate ? 'A user with this email already exists.' : createError?.message || 'Could not create the account.' }, duplicate ? 409 : 400);
    }

    const { error: profileError } = await serviceClient.from('admin_profiles').upsert({
      id: created.user.id,
      email,
      full_name: fullName,
      role,
      avatar_url: payload.avatar_url || null,
      is_active: true,
      allowed_stock_origins: allowedOrigins,
      office_id: officeId,
      shift_id: shiftId,
    }, { onConflict: 'id' });

    if (profileError) {
      await serviceClient.auth.admin.deleteUser(created.user.id);
      return json(request, { error: `Account profile could not be created: ${profileError.message}` }, 500);
    }

    return json(request, {
      id: created.user.id,
      email,
      full_name: fullName,
      role,
      allowed_stock_origins: allowedOrigins,
      office_id: officeId,
      shift_id: shiftId,
    }, 201);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Unknown user creation error.' }, 500);
  }
});

const VALID_ORIGINS = new Set(['japan', 'dubai', 'singapore', 'china', 'thailand', 'taiwan']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeOrigins(raw: unknown, role: string): string[] {
  if (role !== 'manager') return [];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const value = String(item || '').trim().toLowerCase();
    if (VALID_ORIGINS.has(value) && !out.includes(value)) out.push(value);
  }
  return out;
}

function optionalUuid(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = String(raw).trim();
  return UUID_RE.test(value) ? value : null;
}
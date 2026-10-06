import type { SupabaseClient } from '@supabase/supabase-js';
import { isAccountAdminRole } from '@/lib/admin-rbac';

export type AssistantAdmin = {
  userId: string;
  email: string | null;
  fullName: string | null;
};

export type AssistantAuthResult =
  | { ok: true; admin: AssistantAdmin }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Server-side gate for the admin AI assistant.
 *
 * Allowed: an authenticated Supabase user whose `admin_profiles` row is active with
 * role = 'admin'. This is exactly what the database treats as an account/platform admin
 * (`private.is_account_admin()`, aliased by `private.is_platform_admin()`), so the API
 * route, the audit/rate-limit RPCs and the UI all agree. Every other staff role
 * (staff, manager, accounts, sales, freelancer) and every portal customer gets 403.
 *
 * The role is read from the database with the caller's own session (RLS lets a user
 * read their own profile), never from client input or JWT claims.
 */
export async function requireAssistantAdmin(
  supabase: SupabaseClient
): Promise<AssistantAuthResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, status: 401, error: 'Sign in required.' };
  }

  const { data: profile, error } = await supabase
    .from('admin_profiles')
    .select('id, role, is_active, full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile || profile.is_active !== true || !isAccountAdminRole(profile.role)) {
    return { ok: false, status: 403, error: 'The assistant is available to admins only.' };
  }

  return {
    ok: true,
    admin: {
      userId: user.id,
      email: (profile.email as string | null) ?? user.email ?? null,
      fullName: (profile.full_name as string | null) ?? null,
    },
  };
}

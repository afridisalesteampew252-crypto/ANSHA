import { supabase } from '@/lib/supabase/client';

type PasswordLoginResponse = { error?: string; attempts?: number; locked_until?: string | null; session?: { access_token: string; refresh_token: string } };

export async function signInWithProtectedPassword(scope: 'admin' | 'customer', email: string, password: string) {
  try {
    const { data, error } = await supabase.functions.invoke<PasswordLoginResponse>('password-login', {
      body: { scope, email: email.trim().toLowerCase(), password },
    });
    let response = data;
    if (error && !response && error.context instanceof Response) {
      try { response = await error.context.json() as PasswordLoginResponse; } catch { /* Keep the generic network error. */ }
    }
    if (error || response?.error || !response?.session) {
      return { data: null, error: response?.error || 'Sign-in is temporarily unavailable. Please try again later.',
        attempts: response?.attempts, lockedUntil: response?.locked_until ? Date.parse(response.locked_until) : 0 };
    }
    const session = await supabase.auth.setSession(response.session);
    return { data: session.data.user ? { user: session.data.user } : null,
      error: session.error?.message ?? null, attempts: 0, lockedUntil: 0 };
  } catch {
    return { data: null, error: 'Sign-in is temporarily unavailable. Please try again later.', attempts: undefined, lockedUntil: 0 };
  }
}

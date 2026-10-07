import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function safePortalPath(value: string | null) {
  return value?.startsWith('/portal/') || value?.startsWith('/mobile/') ? value : '/portal/account';
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = safePortalPath(request.nextUrl.searchParams.get('next'));
  const redirectUrl = request.nextUrl.clone();

  if (!code) {
    redirectUrl.pathname = '/portal';
    redirectUrl.search = 'error=confirmation';
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirectUrl.pathname = '/portal';
    const reason = /expired|invalid|used/i.test(error.message) ? 'expired' : 'exchange';
    redirectUrl.search = `error=confirmation&reason=${reason}`;
    return NextResponse.redirect(redirectUrl);
  }

  // Password recovery already targets an existing account. Avoid creating or
  // relinking a portal profile before the customer has chosen the new password.
  const setupError = next === '/portal/reset-password'
    ? null
    : (await supabase.rpc('ensure_customer_portal_profile')).error;
  redirectUrl.pathname = setupError ? '/portal' : next;
  redirectUrl.search = setupError ? 'error=setup' : '';
  return NextResponse.redirect(redirectUrl);
}

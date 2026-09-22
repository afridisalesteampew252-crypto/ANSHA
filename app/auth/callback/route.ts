import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function safePortalPath(value: string | null) {
  return value?.startsWith('/portal/') ? value : '/portal/account';
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
    redirectUrl.search = 'error=confirmation';
    return NextResponse.redirect(redirectUrl);
  }

  const { error: setupError } = await supabase.rpc('ensure_customer_portal_profile');
  redirectUrl.pathname = setupError ? '/portal' : next;
  redirectUrl.search = setupError ? 'error=setup' : '';
  return NextResponse.redirect(redirectUrl);
}

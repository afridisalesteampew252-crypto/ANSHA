import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  canAccessAgentVerification,
  canAccessInquiries,
  canAccessLiveChat,
  isAccountsAllowedPath,
  isAccountsRole,
  isActiveAdminProfile,
  isFieldAgentAllowedPath,
  isFieldAgentRole,
  isManagerAllowedPath,
} from '@/lib/admin-rbac';

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL and Supabase publishable key environment variables.'
    );
  }

  return { url, key };
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, key } = getSupabaseConfig();
  const pathname = request.nextUrl.pathname;
  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');
  const isPortalArea = pathname === '/portal' || pathname.startsWith('/portal/');

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        supabaseResponse = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([name, value]) => {
          supabaseResponse.headers.set(name, value);
        });
      },
    },
  });

  const redirectWithSession = (redirectUrl: URL) => {
    const redirectResponse = NextResponse.redirect(redirectUrl);

    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });

    for (const header of ['cache-control', 'expires', 'pragma']) {
      const value = supabaseResponse.headers.get(header);
      if (value) {
        redirectResponse.headers.set(header, value);
      }
    }

    return redirectResponse;
  };

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (isAdminArea) {
    const isLoginPage = pathname === '/admin';

    if (!claims?.sub) {
      if (isLoginPage) return supabaseResponse;
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/admin';
      loginUrl.search = '';
      return redirectWithSession(loginUrl);
    }

    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('id, is_active, role')
      .eq('id', claims.sub)
      .maybeSingle();

    if (!isActiveAdminProfile(profile)) {
      if (isLoginPage) {
        // An inactive session must be able to reach sign in. Redirecting this
        // URL to itself prevents the page from rendering and loops forever.
        return supabaseResponse;
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/admin';
      loginUrl.searchParams.set('error', profile?.is_active === false ? 'inactive' : 'unauthorized');
      return redirectWithSession(loginUrl);
    }

    if (isLoginPage) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/admin/dashboard';
      dashboardUrl.search = '';
      return redirectWithSession(dashboardUrl);
    }

    if ((pathname.startsWith('/admin/agents') && !canAccessAgentVerification(profile.role)) ||
        (pathname.startsWith('/admin/inquiries') && !canAccessInquiries(profile.role))) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/admin/dashboard';
      dashboardUrl.search = '';
      return redirectWithSession(dashboardUrl);
    }

    if (isFieldAgentRole(profile.role)) {
      if (!isFieldAgentAllowedPath(pathname)) {
        const dashboardUrl = request.nextUrl.clone();
        dashboardUrl.pathname = '/admin/dashboard';
        dashboardUrl.search = '';
        return redirectWithSession(dashboardUrl);
      }
    }

    if (isAccountsRole(profile.role)) {
      if (!isAccountsAllowedPath(pathname)) {
        const dashboardUrl = request.nextUrl.clone();
        dashboardUrl.pathname = '/admin/dashboard';
        dashboardUrl.search = '';
        return redirectWithSession(dashboardUrl);
      }
    }

    if (profile.role === 'manager') {
      if (!isManagerAllowedPath(pathname)) {
        const hrUrl = request.nextUrl.clone();
        hrUrl.pathname = '/admin/hr';
        hrUrl.search = '';
        return redirectWithSession(hrUrl);
      }
    }

    // Account-admin only routes
    if (profile.role !== 'admin' && pathname.startsWith('/admin/users')) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/admin/dashboard';
      dashboardUrl.search = '';
      return redirectWithSession(dashboardUrl);
    }

    if (profile.role !== 'admin' && (pathname.startsWith('/admin/audit-log') || pathname.startsWith('/admin/geographic-recommendations') || pathname.startsWith('/admin/account-deletions'))) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/admin/dashboard';
      dashboardUrl.search = '';
      return redirectWithSession(dashboardUrl);
    }

    // Tawk agent inbox — admin + manager ONLY (blocks staff, sales, freelancer, accounts)
    if (pathname.startsWith('/admin/live-chat') && !canAccessLiveChat(profile.role)) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/admin/dashboard';
      dashboardUrl.search = '';
      return redirectWithSession(dashboardUrl);
    }

    return supabaseResponse;
  }

  if (isPortalArea) {
    // Recovery email tokens are imported by this page after it loads. Requiring
    // an existing session here would redirect new-browser recovery to sign-in.
    if (pathname === '/portal/reset-password') return supabaseResponse;
    const isLoginPage = pathname === '/portal';

    if (!claims?.sub) {
      if (isLoginPage) return supabaseResponse;
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/portal';
      loginUrl.search = '';
      return redirectWithSession(loginUrl);
    }

    const { data: portalProfile } = await supabase
      .from('customer_profiles')
      .select('id, is_active')
      .eq('id', claims.sub)
      .eq('is_active', true)
      .maybeSingle();

    if (!portalProfile) {
      if (isLoginPage) return supabaseResponse;
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/portal';
      loginUrl.searchParams.set('error', 'unauthorized');
      return redirectWithSession(loginUrl);
    }

    if (isLoginPage) {
      const invoicesUrl = request.nextUrl.clone();
      invoicesUrl.pathname = '/portal/home';
      invoicesUrl.search = '';
      return redirectWithSession(invoicesUrl);
    }

    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/admin/:path*', '/portal', '/portal/:path*'],
};

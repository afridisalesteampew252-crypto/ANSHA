import { revalidatePublicListing } from '@/lib/revalidate-public-server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isActiveAdminProfile } from '@/lib/admin-rbac';
import { readJsonObject, RequestBodyError } from '@/lib/request-json';

export const dynamic = 'force-dynamic';

/**
 * On-demand ISR revalidation for public listing pages after a staff edit.
 * Only active staff (admin_profiles) can call it; paths are built server-side from a
 * fixed kind + validated slugs, so callers cannot purge arbitrary routes.
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!isActiveAdminProfile(profile)) {
    return Response.json({ error: 'Staff access required.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req, 16 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const kind =
    body.kind === 'vehicle' || body.kind === 'part' || body.kind === 'offer' ? body.kind : null;
  if (!kind) {
    return Response.json({ error: 'kind must be "vehicle", "part" or "offer".' }, { status: 400 });
  }

  return Response.json({ revalidated: revalidatePublicListing(kind, body.slugs) });
}

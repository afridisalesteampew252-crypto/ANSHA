import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SLUG_RE = /^[A-Za-z0-9._~-]{1,200}$/;
const MAX_SLUGS = 10;

type Body = { kind?: unknown; slugs?: unknown };

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
    .select('id, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.is_active === false) {
    return Response.json({ error: 'Staff access required.' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const kind =
    body.kind === 'vehicle' || body.kind === 'part' || body.kind === 'offer' ? body.kind : null;
  if (!kind) {
    return Response.json({ error: 'kind must be "vehicle", "part" or "offer".' }, { status: 400 });
  }
  const slugs = Array.isArray(body.slugs)
    ? Array.from(
        new Set(body.slugs.filter((s): s is string => typeof s === 'string' && SLUG_RE.test(s)))
      ).slice(0, MAX_SLUGS)
    : [];

  if (kind === 'offer') {
    // Deals appear on /offers and on any linked detail page.
    revalidatePath('/');
    revalidatePath('/offers');
    revalidatePath('/vehicles/[slug]', 'page');
    revalidatePath('/parts/[slug]', 'page');
    return Response.json({ revalidated: ['/', '/offers', '/vehicles/[slug]', '/parts/[slug]'] });
  }

  const paths =
    kind === 'vehicle'
      ? ['/', '/vehicles', '/machinery', '/offers', ...slugs.map((s) => `/vehicles/${s}`)]
      : ['/', '/parts', '/offers', ...slugs.map((s) => `/parts/${s}`)];
  for (const path of paths) revalidatePath(path);

  return Response.json({ revalidated: paths });
}

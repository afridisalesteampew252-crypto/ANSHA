import { createClient } from '@supabase/supabase-js';

export { absoluteUrl } from '@/lib/seo';

function getPublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL and Supabase publishable key environment variables.');
  }
  return { url, key };
}

/** Cookie-free anon client for SEO metadata / sitemap (published rows only under RLS). */
export function createPublicSupabaseClient() {
  const { url, key } = getPublicConfig();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

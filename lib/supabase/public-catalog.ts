import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cookie-free, session-free Supabase client for PUBLIC catalog reads (vehicles, parts,
 * photos, offers, categories, blog) from client components.
 *
 * Always use this - not `@/lib/supabase/client` - for public listing data, even when a
 * customer or staff member is signed in. Since migration
 * 20261006010000_restrict_public_inventory_columns.sql only the `anon` role may read
 * published vehicles/parts (with a column allow-list), so the signed-in session client
 * would return no public rows for customer accounts.
 *
 * Column grants also mean `select('*')` on vehicles/parts fails for anon: always list
 * columns explicitly (see lib/public-card-data.ts).
 */
let client: SupabaseClient | null = null;

export function getPublicCatalogClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL and Supabase publishable key environment variables.');
  }
  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'ansha-public-catalog',
    },
  });
  return client;
}

import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { buildPageMetadata } from '@/lib/seo';
import { createPublicSupabaseClient } from '@/lib/supabase/public';
import PublicOffersPage, { type OfferRow } from './offers-client';

export const metadata: Metadata = buildPageMetadata({
  title: 'Deals and Offers',
  description: `Current export deals and offers from ${siteConfig.name} on published vehicles, parts, and machinery.`,
  path: '/offers',
});

/** ISR: cached at the edge; admin inventory edits revalidate /offers on demand. */
export const revalidate = 600;

export default async function OffersPage() {
  const { data, error } = await createPublicSupabaseClient()
    .from('site_offers')
    .select('*, vehicles(slug, title, currency), parts(slug, name, currency)')
    .eq('is_published', true)
    .order('published_at', { ascending: false, nullsFirst: false });
  if (error) {
    // Build machines may not reach Supabase; ship an empty shell and let ISR fill it.
    // At runtime, throwing keeps the last good cached page instead of caching an empty list.
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      throw new Error(`Offers lookup failed: ${error.message}`);
    }
    return <PublicOffersPage rows={[]} />;
  }
  return <PublicOffersPage rows={(data || []) as OfferRow[]} />;
}

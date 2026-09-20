import { createPublicSupabaseClient } from '@/lib/supabase/public';
import type { Review } from '@/lib/types';

/** Published testimonials for the public site, ordered for display. */
export async function getPublishedReviews(limit?: number): Promise<Review[]> {
  const supabase = createPublicSupabaseClient();
  let query = supabase
    .from('reviews')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (typeof limit === 'number' && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to load reviews', error.message);
    return [];
  }
  return (data || []) as Review[];
}

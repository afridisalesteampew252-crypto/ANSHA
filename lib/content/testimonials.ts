import type { Review } from '@/lib/types';

/** Public display shape for a testimonial (alias of Review). */
export type Testimonial = Pick<
  Review,
  'id' | 'name' | 'role' | 'location' | 'quote' | 'rating' | 'avatar_url'
>;

import {
  HOME_FEATURED_MACHINERY_LIMIT,
  HOME_FEATURED_MACHINERY_POOL,
  HOME_FEATURED_PARTS_LIMIT,
  HOME_FEATURED_PARTS_POOL,
  HOME_FEATURED_VEHICLES_LIMIT,
  HOME_FEATURED_VEHICLES_POOL,
  selectRotatingFeatured,
} from '@/lib/featured-rotation';
import { createPublicSupabaseClient } from '@/lib/supabase/public';
import { isMachineryClass, MACHINERY_VEHICLE_CLASSES } from '@/lib/vehicle-class';
import type { BlogPostWithCategory, Category, PartWithRelations, VehicleWithPhotos } from '@/lib/types';

export type HomeFeaturedData = {
  categories: Category[];
  featuredParts: PartWithRelations[];
  latestParts: PartWithRelations[];
  featuredVehicles: VehicleWithPhotos[];
  featuredMachinery: VehicleWithPhotos[];
  latestPosts: BlogPostWithCategory[];
};

/** Server-side featured pools for the homepage (SSR first paint; client soft-refreshes). */
export async function getHomeFeaturedData(nowMs: number = Date.now()): Promise<HomeFeaturedData> {
  const supabase = createPublicSupabaseClient();

  const [catRes, partsPoolRes, vehiclesPoolRes, machineryPoolRes, postsRes] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order').limit(12),
    supabase
      .from('parts')
      .select('*, categories(*), part_photos(*), part_compatibility(*)')
      .eq('is_published', true)
      .eq('stock_status', 'available')
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(HOME_FEATURED_PARTS_POOL),
    supabase
      .from('vehicles')
      .select('*, vehicle_photos(*)')
      .eq('is_published', true)
      .eq('stock_status', 'available')
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(HOME_FEATURED_VEHICLES_POOL),
    supabase
      .from('vehicles')
      .select('*, vehicle_photos(*)')
      .eq('is_published', true)
      .eq('stock_status', 'available')
      .in('vehicle_class', [...MACHINERY_VEHICLE_CLASSES])
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(HOME_FEATURED_MACHINERY_POOL),
    supabase
      .from('blog_posts')
      .select('*, blog_categories(*)')
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(3),
  ]);

  const partsPool = (partsPoolRes.data || []) as unknown as PartWithRelations[];
  const vehiclesPool = ((vehiclesPoolRes.data || []) as unknown as VehicleWithPhotos[]).filter(
    (vehicle) => !isMachineryClass(vehicle.vehicle_class || 'passenger')
  );
  const machineryPool = (machineryPoolRes.data || []) as unknown as VehicleWithPhotos[];

  return {
    categories: (catRes.data || []) as Category[],
    featuredParts: selectRotatingFeatured(partsPool, HOME_FEATURED_PARTS_LIMIT, nowMs),
    latestParts: partsPool.slice(0, HOME_FEATURED_PARTS_LIMIT),
    featuredVehicles: selectRotatingFeatured(vehiclesPool, HOME_FEATURED_VEHICLES_LIMIT, nowMs),
    featuredMachinery: selectRotatingFeatured(machineryPool, HOME_FEATURED_MACHINERY_LIMIT, nowMs),
    latestPosts: (postsRes.data || []) as unknown as BlogPostWithCategory[],
  };
}

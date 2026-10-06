import { cache } from 'react';
import {
  PUBLIC_PART_CARD_SELECT,
  PUBLIC_PART_DETAIL_SELECT,
  PUBLIC_VEHICLE_CARD_SELECT,
  PUBLIC_VEHICLE_DETAIL_SELECT,
  type PublicPartCard,
  type PublicVehicleCard,
} from '@/lib/public-card-data';
import { createPublicSupabaseClient } from '@/lib/supabase/public';
import { publicVehiclePhotos } from '@/lib/vehicle-photos';
import type { PartWithRelations, SiteOffer, VehicleWithPhotos } from '@/lib/types';

/**
 * Cookie-free, request-deduplicated loaders for the public detail pages. Shared by
 * generateMetadata (layout) and the page so each ISR render queries Supabase once.
 */
export const getPublicVehicleBySlug = cache(async (slug: string): Promise<VehicleWithPhotos | null> => {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from('vehicles')
    .select(PUBLIC_VEHICLE_DETAIL_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('stock_status', 'available')
    .maybeSingle();
  if (error) throw new Error(`Vehicle lookup failed: ${error.message}`);
  if (!data) return null;
  const vehicle = data as unknown as VehicleWithPhotos;
  const photos = publicVehiclePhotos(vehicle.vehicle_photos || []).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  return { ...vehicle, vehicle_photos: photos };
});

export const getPublicPartBySlug = cache(async (slug: string): Promise<PartWithRelations | null> => {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from('parts')
    .select(PUBLIC_PART_DETAIL_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('stock_status', 'available')
    .maybeSingle();
  if (error) throw new Error(`Part lookup failed: ${error.message}`);
  if (!data) return null;
  const part = data as unknown as PartWithRelations;
  const photos = [...(part.part_photos || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return { ...part, part_photos: photos };
});

export async function getVehicleDetailExtras(vehicle: Pick<VehicleWithPhotos, 'id' | 'make'>) {
  const supabase = createPublicSupabaseClient();
  const [offerRes, relatedRes] = await Promise.all([
    supabase
      .from('site_offers')
      .select('*')
      .eq('is_published', true)
      .eq('vehicle_id', vehicle.id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(1),
    vehicle.make
      ? supabase
          .from('vehicles')
          .select(PUBLIC_VEHICLE_CARD_SELECT)
          .eq('is_published', true)
          .eq('stock_status', 'available')
          .eq('make', vehicle.make)
          .neq('id', vehicle.id)
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(4)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  return {
    deal: ((offerRes.data || [])[0] as SiteOffer | undefined) || null,
    relatedVehicles: (relatedRes.data || []) as unknown as PublicVehicleCard[],
  };
}

export async function getPartDetailExtras(part: Pick<PartWithRelations, 'id' | 'category_id'>) {
  const supabase = createPublicSupabaseClient();
  const [offerRes, relatedRes] = await Promise.all([
    supabase
      .from('site_offers')
      .select('*')
      .eq('is_published', true)
      .eq('part_id', part.id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(1),
    part.category_id
      ? supabase
          .from('parts')
          .select(PUBLIC_PART_CARD_SELECT)
          .eq('is_published', true)
          .eq('stock_status', 'available')
          .eq('category_id', part.category_id)
          .neq('id', part.id)
          .limit(4)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  return {
    deal: ((offerRes.data || [])[0] as SiteOffer | undefined) || null,
    relatedParts: (relatedRes.data || []) as unknown as PublicPartCard[],
  };
}

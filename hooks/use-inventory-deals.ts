'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { SiteOffer } from '@/lib/types';

type DealMaps = {
  byVehicleId: Record<string, SiteOffer>;
  byPartId: Record<string, SiteOffer>;
};

const emptyMaps: DealMaps = { byVehicleId: {}, byPartId: {} };

/** Latest published inventory-linked deals, keyed by vehicle/part id. */
export function useInventoryDeals() {
  const [maps, setMaps] = useState<DealMaps>(emptyMaps);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('site_offers')
        .select('vehicle_id,part_id,sale_price,discount_percent')
        .eq('is_published', true)
        .or('vehicle_id.not.is.null,part_id.not.is.null')
        .order('published_at', { ascending: false, nullsFirst: false });

      if (cancelled) return;

      const byVehicleId: Record<string, SiteOffer> = {};
      const byPartId: Record<string, SiteOffer> = {};
      for (const row of (data || []) as SiteOffer[]) {
        if (row.vehicle_id && !byVehicleId[row.vehicle_id]) byVehicleId[row.vehicle_id] = row;
        if (row.part_id && !byPartId[row.part_id]) byPartId[row.part_id] = row;
      }
      setMaps({ byVehicleId, byPartId });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => ({
      loading,
      dealForVehicle: (id: string | null | undefined) => (id ? maps.byVehicleId[id] : undefined),
      dealForPart: (id: string | null | undefined) => (id ? maps.byPartId[id] : undefined),
    }),
    [loading, maps]
  );
}

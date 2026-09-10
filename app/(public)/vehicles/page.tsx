'use client';

import { useState, useEffect } from 'react';
import { Car } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { VehicleCard } from '@/components/public/vehicle-card';
import { supabase } from '@/lib/supabase/client';
import type { VehicleWithPhotos } from '@/lib/types';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('*, vehicle_photos(*)')
        .eq('is_published', true)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });

      setVehicles((data || []) as unknown as VehicleWithPhotos[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <section className="border-b border-border bg-secondary/40">
        <div className="container-page py-10">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Showroom</p>
          <h1 className="text-2xl font-bold tracking-tight">Vehicles</h1>
          <p className="mt-1 text-muted-foreground">Browse our available vehicles</p>
        </div>
      </section>

      <div className="container-page py-10">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[4/3] w-full rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : vehicles.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-border">
              <Car className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="mt-6 text-lg font-semibold">No vehicles available yet</h3>
            <p className="mt-1 text-muted-foreground">Check back soon or contact us for vehicle inquiries.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

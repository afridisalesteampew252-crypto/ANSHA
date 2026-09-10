'use client';

import { useState, useEffect, useMemo } from 'react';
import { Car, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { VehicleCard } from '@/components/public/vehicle-card';
import { supabase } from '@/lib/supabase/client';
import type { VehicleWithPhotos } from '@/lib/types';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');

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

  const brands = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach((v) => { if (v.make) set.add(v.make); });
    return Array.from(set).sort();
  }, [vehicles]);

  const filtered = useMemo(() => {
    let result = vehicles;
    if (selectedBrand !== 'all') {
      result = result.filter((v) => v.make === selectedBrand);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((v) =>
        v.title.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.variant || '').toLowerCase().includes(q) ||
        (v.year ? v.year.toString().includes(q) : false) ||
        (v.chassis_code || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [vehicles, selectedBrand, searchQuery]);

  return (
    <div>
      <section className="border-b border-border bg-secondary/40">
        <div className="container-page py-10">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Showroom</p>
          <h1 className="text-2xl font-bold tracking-tight">Vehicles</h1>
          <p className="mt-1 text-muted-foreground">Browse our available vehicles</p>
        </div>
      </section>

      <div className="container-page py-8">
        {/* Search & Brand filter */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name, model, year, chassis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {brands.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedBrand('all')}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedBrand === 'all'
                    ? 'bg-foreground text-background'
                    : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                All Brands
              </button>
              {brands.map((brand) => (
                <button
                  key={brand}
                  onClick={() => setSelectedBrand(brand)}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedBrand === brand
                      ? 'bg-foreground text-background'
                      : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {brand}
                </button>
              ))}
            </div>
          )}
        </div>

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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-border">
              <Car className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="mt-6 text-lg font-semibold">
              {vehicles.length === 0 ? 'No vehicles available yet' : 'No vehicles match your search'}
            </h3>
            <p className="mt-1 text-muted-foreground">
              {vehicles.length === 0
                ? 'Check back soon or contact us for vehicle inquiries.'
                : 'Try a different search term or brand.'}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Showing {filtered.length} vehicle{filtered.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

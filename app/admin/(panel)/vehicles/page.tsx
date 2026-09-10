'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Car, Edit, Trash2, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { VehicleWithPhotos } from '@/lib/types';

export default function AdminVehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVehicles = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vehicles')
      .select('*, vehicle_photos(*)')
      .order('created_at', { ascending: false });
    setVehicles((data || []) as unknown as VehicleWithPhotos[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;

    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete vehicle.');
      return;
    }
    toast.success('Vehicle deleted.');
    fetchVehicles();
  };

  const toggleFeatured = async (id: string, current: boolean) => {
    const { error } = await supabase.from('vehicles').update({ is_featured: !current }).eq('id', id);
    if (error) {
      toast.error('Failed to update.');
      return;
    }
    fetchVehicles();
  };

  const togglePublished = async (id: string, current: boolean) => {
    const { error } = await supabase.from('vehicles').update({ is_published: !current }).eq('id', id);
    if (error) {
      toast.error('Failed to update.');
      return;
    }
    fetchVehicles();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vehicles</h1>
          <p className="text-sm text-muted-foreground">Manage vehicle listings</p>
        </div>
        <Link href="/admin/vehicles/new">
          <Button>
            <Plus className="h-4 w-4" />
            Add Vehicle
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-border py-16 text-center">
          <Car className="h-10 w-10 text-muted-foreground/30" />
          <p className="mt-4 text-sm text-muted-foreground">No vehicles yet.</p>
          <Link href="/admin/vehicles/new" className="mt-4">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add Your First Vehicle
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/30">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vehicle</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Year</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Price</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Featured</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Published</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => {
                const coverPhoto = vehicle.vehicle_photos?.find((p) => p.is_cover) || vehicle.vehicle_photos?.[0];
                const photoUrl = coverPhoto
                  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-images/${coverPhoto.storage_path}`
                  : null;
                const hasPrice = vehicle.show_price && vehicle.price && vehicle.price > 0;

                return (
                  <tr key={vehicle.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-14 shrink-0 overflow-hidden rounded border border-border bg-secondary">
                          {photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={photoUrl} alt={vehicle.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <Car className="h-4 w-4 text-muted-foreground/30" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{vehicle.title}</p>
                          <p className="text-xs text-muted-foreground">{vehicle.make} {vehicle.model}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{vehicle.year || '—'}</td>
                    <td className="px-4 py-3">
                      {hasPrice ? (
                        <span className="font-medium">{vehicle.currency} {vehicle.price!.toLocaleString()}</span>
                      ) : (
                        <Badge variant="secondary">Ask Price</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleFeatured(vehicle.id, vehicle.is_featured)} className="inline-flex">
                        <Star className={`h-4 w-4 ${vehicle.is_featured ? 'fill-foreground text-foreground' : 'text-muted-foreground/40'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => togglePublished(vehicle.id, vehicle.is_published)}
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          vehicle.is_published
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {vehicle.is_published ? 'Published' : 'Draft'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link href={`/vehicles/${vehicle.slug}`} target="_blank">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="View">
                            <Car className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/admin/vehicles/${vehicle.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(vehicle.id, vehicle.title)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

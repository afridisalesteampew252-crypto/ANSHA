'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Plus, Pencil, Eye, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { conditionLabels, conditionBadgeClasses } from '@/lib/site-config';
import type { PartWithRelations } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminPartsPage() {
  const [parts, setParts] = useState<PartWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  const fetchParts = useCallback(async (reset: boolean) => {
    setLoading(true);
    const pageNum = reset ? 1 : page;

    let q = supabase
      .from('parts')
      .select('*, categories(*), part_photos(*), part_compatibility(*)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search.trim()) {
      q = q.or(
        `name.ilike.%${search.trim()}%,part_code.ilike.%${search.trim()}%,oem_number.ilike.%${search.trim()}%,part_number.ilike.%${search.trim()}%`
      );
    }

    q = q.range((pageNum - 1) * pageSize, pageNum * pageSize - 1);
    const { data, count } = await q;

    if (reset) {
      setParts((data || []) as unknown as PartWithRelations[]);
      setPage(1);
    } else {
      setParts((prev) => [...prev, ...((data || []) as unknown as PartWithRelations[])]);
    }
    setTotalCount(count || 0);
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchParts(true), 300);
    return () => clearTimeout(timeout);
  }, [search, fetchParts]);

  const getPhotoUrl = (part: PartWithRelations) => {
    const cover = part.part_photos?.find((p) => p.is_cover) || part.part_photos?.[0];
    if (!cover) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/part-images/${cover.storage_path}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parts Management</h1>
          <p className="text-sm text-muted-foreground">
            {loading && parts.length === 0 ? 'Loading...' : `${totalCount} total parts`}
          </p>
        </div>
        <Link href="/admin/parts/new">
          <Button>
            <Plus className="h-4 w-4" />
            Add Part
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by name, part code, OEM number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Parts list */}
      {loading && parts.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : parts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Wrench className="h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-4 text-lg font-semibold">No parts found</h3>
            <p className="mt-1 text-muted-foreground">Add your first part to get started.</p>
            <Link href="/admin/parts/new" className="mt-4">
              <Button>
                <Plus className="h-4 w-4" />
                Add First Part
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {parts.map((part) => {
              const photoUrl = getPhotoUrl(part);
              return (
                <Card key={part.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="flex items-center gap-4 p-4">
                    {/* Photo */}
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-secondary">
                      {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoUrl} alt={part.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Wrench className="h-6 w-6 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm truncate">{part.name}</h3>
                        <Badge variant="outline" className={conditionBadgeClasses[part.condition] || ''}>
                          {conditionLabels[part.condition]}
                        </Badge>
                        {part.is_published ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Published</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Draft</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground font-mono">{part.part_code}</p>
                      <p className="text-xs text-muted-foreground">
                        {part.categories?.name || 'No category'} • Qty: {part.quantity}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/parts/${part.slug}`} target="_blank">
                        <Button variant="ghost" size="icon" title="View on site">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/admin/parts/${part.id}`}>
                        <Button variant="outline" size="sm">
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {parts.length < totalCount && (
            <div className="text-center">
              <Button variant="outline" onClick={() => { setPage((p) => p + 1); fetchParts(false); }} disabled={loading}>
                {loading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

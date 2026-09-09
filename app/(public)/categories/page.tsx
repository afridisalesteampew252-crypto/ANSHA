'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cog, ChevronRight, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/client';
import type { Category } from '@/lib/types';

interface CategoryWithCount extends Category {
  part_count?: number;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order');

      if (cats) {
        const withCounts = await Promise.all(
          cats.map(async (cat) => {
            const { count } = await supabase
              .from('parts')
              .select('id', { count: 'exact', head: true })
              .eq('category_id', cat.id)
              .eq('is_published', true);
            return { ...cat, part_count: count || 0 };
          })
        );
        setCategories(withCounts);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="container-page py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
        <p className="mt-1 text-muted-foreground">Browse parts by category type</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Wrench className="h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold">No categories yet</h3>
          <p className="mt-1 text-muted-foreground">Categories will appear here once they are added.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <Link key={cat.id} href={`/categories/${cat.slug}`}>
              <Card className="hover:border-primary/30 hover:shadow-sm transition-all">
                <CardContent className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Cog className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{cat.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {cat.part_count} part{cat.part_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

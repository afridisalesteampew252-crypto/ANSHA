'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Package } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PartCard } from '@/components/public/part-card';
import { supabase } from '@/lib/supabase/client';
import type { Category, PartWithRelations } from '@/lib/types';

export default function CategoryDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = use(props.params);
  const { slug } = params;
  const [category, setCategory] = useState<Category | null>(null);
  const [parts, setParts] = useState<PartWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: cat, error: catError } = await supabase
        .from('categories')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (catError || !cat) {
        setNotFoundFlag(true);
        setLoading(false);
        return;
      }

      setCategory(cat as Category);

      const { data: partData } = await supabase
        .from('parts')
        .select('*, categories(*), part_photos(*), part_compatibility(*)')
        .eq('is_published', true)
        .eq('category_id', cat.id)
        .order('created_at', { ascending: false });

      setParts((partData || []) as unknown as PartWithRelations[]);
      setLoading(false);
    })();
  }, [slug]);

  if (notFoundFlag) {
    notFound();
  }

  if (loading) {
    return (
      <div className="container-page py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/categories" className="hover:text-foreground">Categories</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">{category?.name}</span>
      </nav>

      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-secondary/50">
          <Package className="h-6 w-6 text-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{category?.name}</h1>
          <p className="text-muted-foreground">
            {parts.length} part{parts.length !== 1 ? 's' : ''} available
          </p>
        </div>
      </div>

      {category?.description && (
        <p className="mb-8 text-muted-foreground max-w-2xl">{category.description}</p>
      )}

      {parts.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold">No parts in this category yet</h3>
          <p className="mt-1 text-muted-foreground">Check back soon or browse other categories.</p>
          <Link
            href="/parts"
            className="mt-4 text-foreground font-medium hover:underline"
          >
            Browse All Parts →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {parts.map((part) => (
            <PartCard key={part.id} part={part} />
          ))}
        </div>
      )}
    </div>
  );
}


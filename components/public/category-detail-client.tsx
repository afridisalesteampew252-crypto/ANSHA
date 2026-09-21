'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PartCard } from '@/components/public/part-card';
import { JsonLd } from '@/components/seo/json-ld';
import { PageBreadcrumbs } from '@/components/seo/page-breadcrumbs';
import { publicPartImageUrl } from '@/components/public/catalog-image';
import { useInventoryDeals } from '@/hooks/use-inventory-deals';
import { absoluteUrl } from '@/lib/seo';
import { buildItemListJsonLd } from '@/lib/seo-schema';
import { supabase } from '@/lib/supabase/client';
import type { Category, PartWithRelations } from '@/lib/types';

export function CategoryDetailClient({ slug }: { slug: string }) {
  const { dealForPart } = useInventoryDeals();
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
        .eq('stock_status', 'available')
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
        <Skeleton className="mb-6 h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const itemListJsonLd =
    category && parts.length
      ? buildItemListJsonLd({
          name: `${category.name} parts`,
          description: category.description || undefined,
          url: `/categories/${category.slug}`,
          items: parts.slice(0, 24).map((part) => {
            const cover = (part.part_photos || []).find((p) => p.is_cover) || part.part_photos?.[0];
            return {
              name: part.name,
              url: absoluteUrl(`/parts/${part.slug}`),
              image: cover ? publicPartImageUrl(cover.storage_path) : null,
            };
          }),
        })
      : null;

  return (
    <div>
      {itemListJsonLd ? <JsonLd data={itemListJsonLd} /> : null}
      <section className="page-band">
        <div className="container-page py-8 sm:py-10">
          <PageBreadcrumbs
            className="mb-4"
            items={[
              { name: 'Home', href: '/' },
              { name: 'Categories', href: '/categories' },
              { name: category?.name || 'Category' },
            ]}
          />
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20">
              <Package className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-black tracking-tight sm:text-3xl">{category?.name}</h1>
              <p className="text-sm text-white/60">
                {parts.length} part{parts.length !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>
          {category?.description ? (
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65">{category.description}</p>
          ) : null}
        </div>
      </section>

      <div className="surface-cool border-t border-accent/10">
        <div className="container-page py-8 sm:py-10">
          {parts.length === 0 ? (
            <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card py-16 text-center">
              <Package className="h-12 w-12 text-muted-foreground/30" />
              <h3 className="mt-4 text-lg font-semibold">No parts in this category yet</h3>
              <p className="mt-1 text-muted-foreground">Check back soon or browse other categories.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-4">
                <Link href="/parts" className="font-medium text-accent hover:underline">
                  Browse all parts
                </Link>
                <Link href="/categories" className="font-medium text-accent hover:underline">
                  All categories
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {parts.map((part) => (
                <PartCard key={part.id} part={part} deal={dealForPart(part.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

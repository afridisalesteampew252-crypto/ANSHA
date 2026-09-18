'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Boxes, Package, Search } from 'lucide-react';
import { CatalogImage } from '@/components/public/catalog-image';
import { resolveCategoryImage } from '@/lib/category-images';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/client';
import type { Category } from '@/lib/types';

interface CategoryWithCount extends Category {
  part_count: number;
}

export default function CategoriesPageClient() {
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: categoryData }, { data: partData }] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('parts').select('category_id').eq('is_published', true).eq('stock_status', 'available'),
      ]);
      if (!active) return;
      const counts: Record<string, number> = {};
      for (const part of partData || []) if (part.category_id) counts[part.category_id] = (counts[part.category_id] || 0) + 1;
      setCategories(((categoryData || []) as Category[]).map((category) => ({ ...category, part_count: counts[category.id] || 0 })));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = categories.filter((category) => category.name.toLowerCase().includes(query.toLowerCase()) || category.description?.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <section className="relative overflow-hidden bg-[#101114] py-11 text-white sm:py-16">
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_80%_20%,rgba(220,38,38,.5),transparent_30%),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:auto,42px_42px,42px_42px]" />
        <div className="container-page relative"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Catalog departments</span><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Browse parts by category</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">Explore ANSHA’s published inventory by automotive system and product family.</p></div>
      </section>

      <div className="container-page py-8 sm:py-12">
        <div className="relative mb-8 max-w-xl">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search categories" className="h-12 rounded-full bg-card pl-11 shadow-sm" />
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="aspect-[1.15] rounded-2xl" />)}</div>
        ) : filtered.length ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((category, index) => {
              const imageSrc = resolveCategoryImage(category.slug, category.image_url);
              return (
              <Link key={category.id} href={`/categories/${category.slug}`} className="group relative block aspect-[1.15] min-h-[11rem] overflow-hidden rounded-2xl border border-border bg-secondary shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                {imageSrc ? (
                  <CatalogImage
                    src={imageSrc}
                    alt={category.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    priority={index < 4}
                    className="transition duration-500 group-hover:scale-105"
                    objectFit="cover"
                  />
                ) : <span className="absolute inset-0 grid place-items-center"><Package className="h-12 w-12 text-muted-foreground/20" /></span>}
                <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">{category.part_count} available</span>
                  <strong className="mt-1 block text-base font-extrabold sm:text-lg">{category.name}</strong>
                  <span className="mt-3 hidden items-center gap-2 text-xs font-bold text-white/80 sm:flex">Open category <ArrowRight className="h-3.5 w-3.5 text-accent" /></span>
                </span>
              </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border py-20 text-center"><Boxes className="mx-auto h-10 w-10 text-muted-foreground/25" /><h2 className="mt-4 text-xl font-extrabold">No category matches that search</h2><button onClick={() => setQuery('')} className="mt-3 text-sm font-bold text-accent">Clear search</button></div>
        )}
      </div>
    </>
  );
}

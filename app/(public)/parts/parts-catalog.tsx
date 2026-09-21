'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Filter, PackageSearch, Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { PartCard } from '@/components/public/part-card';
import { useInventoryDeals } from '@/hooks/use-inventory-deals';
import { SUPPORTED_MANUFACTURERS } from '@/lib/manufacturer-logos';
import { conditionLabels } from '@/lib/site-config';
import { STOCK_ORIGINS, stockOriginLabel } from '@/lib/stock';
import { supabase } from '@/lib/supabase/client';
import type { Category, PartCondition, PartWithRelations } from '@/lib/types';

const conditions: PartCondition[] = ['new', 'used', 'refurbished', 'for-parts'];
const sortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name: A–Z' },
  { value: 'price-low', label: 'Price: low to high' },
  { value: 'price-high', label: 'Price: high to low' },
];

function PartsCatalog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dealForPart } = useInventoryDeals();
  const [parts, setParts] = useState<PartWithRelations[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'all');
  const [selectedCondition, setSelectedCondition] = useState(searchParams.get('condition') || 'all');
  const [selectedBrand, setSelectedBrand] = useState(searchParams.get('brand') || 'all');
  const [selectedStock, setSelectedStock] = useState(searchParams.get('stock') || 'all');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'newest');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const pageSize = 12;

  useEffect(() => {
    supabase.from('categories').select('*').order('sort_order').then(({ data }) => setCategories((data || []) as Category[]));
  }, []);

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setSelectedCategory(searchParams.get('category') || 'all');
    setSelectedCondition(searchParams.get('condition') || 'all');
    setSelectedBrand(searchParams.get('brand') || 'all');
    setSelectedStock(searchParams.get('stock') || 'all');
    setSortBy(searchParams.get('sort') || 'newest');
    setPage(Math.max(1, Number(searchParams.get('page')) || 1));
  }, [searchParams]);

  const fetchParts = useCallback(async () => {
    setLoading(true);
    let request = supabase
      .from('parts')
      .select('*, categories(*), part_photos(*), part_compatibility(*)', { count: 'exact' })
      .eq('is_published', true)
      .eq('stock_status', 'available');

    const safeQuery = query.trim().replace(/[,%()]/g, ' ');
    if (safeQuery) request = request.or(`name.ilike.%${safeQuery}%,part_code.ilike.%${safeQuery}%,oem_number.ilike.%${safeQuery}%,part_number.ilike.%${safeQuery}%`);
    if (selectedCategory !== 'all') {
      const category = categories.find((item) => item.slug === selectedCategory);
      if (category) request = request.eq('category_id', category.id);
    }
    if (selectedCondition !== 'all') request = request.eq('condition', selectedCondition);
    if (selectedBrand !== 'all') request = request.eq('brand', selectedBrand);
    if (selectedStock !== 'all') request = request.eq('stock_origin', selectedStock);

    if (sortBy === 'oldest') request = request.order('created_at', { ascending: true });
    else if (sortBy === 'name') request = request.order('name', { ascending: true });
    else if (sortBy === 'price-low') request = request.order('price', { ascending: true, nullsFirst: false });
    else if (sortBy === 'price-high') request = request.order('price', { ascending: false, nullsFirst: true });
    else request = request.order('created_at', { ascending: false });

    const from = (page - 1) * pageSize;
    const { data, count } = await request.range(from, from + pageSize - 1);
    setParts((data || []) as unknown as PartWithRelations[]);
    setTotalCount(count || 0);
    setLoading(false);
  }, [categories, page, query, selectedBrand, selectedCategory, selectedCondition, selectedStock, sortBy]);

  useEffect(() => {
    if (selectedCategory === 'all' || categories.length > 0) fetchParts();
  }, [categories.length, fetchParts, selectedCategory]);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === 'all' || (key === 'page' && value === '1')) params.delete(key);
    else params.set(key, value);
    if (key !== 'page') params.delete('page');
    router.push(`/parts${params.size ? `?${params.toString()}` : ''}`);
  };

  const clearFilters = () => router.push('/parts');
  const activeFilters = [
    query && { key: 'q', label: `“${query}”` },
    selectedBrand !== 'all' && { key: 'brand', label: selectedBrand },
    selectedStock !== 'all' && { key: 'stock', label: stockOriginLabel(selectedStock) },
    selectedCategory !== 'all' && { key: 'category', label: categories.find((category) => category.slug === selectedCategory)?.name || selectedCategory },
    selectedCondition !== 'all' && { key: 'condition', label: conditionLabels[selectedCondition] },
  ].filter(Boolean) as { key: string; label: string }[];
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const filterControls = (
    <div className="space-y-6">
      <div>
        <label className="mb-2 block text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Stock location</label>
        <Select value={selectedStock} onValueChange={(value) => setParam('stock', value)}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="All stock locations" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All stock locations</SelectItem>{STOCK_ORIGINS.map((origin) => <SelectItem key={origin.value} value={origin.value}>{origin.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-2 block text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Manufacturer</label>
        <Select value={selectedBrand} onValueChange={(value) => setParam('brand', value)}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="All manufacturers" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All manufacturers</SelectItem>{SUPPORTED_MANUFACTURERS.map((brand) => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-2 block text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Category</label>
        <Select value={selectedCategory} onValueChange={(value) => setParam('category', value)}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.slug}>{category.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-2 block text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Condition</label>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <button onClick={() => setParam('condition', 'all')} className={`rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${selectedCondition === 'all' ? 'bg-foreground text-background' : 'bg-secondary/65 hover:bg-secondary'}`}>All conditions</button>
          {conditions.map((condition) => <button key={condition} onClick={() => setParam('condition', condition)} className={`rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${selectedCondition === condition ? 'bg-foreground text-background' : 'bg-secondary/65 hover:bg-secondary'}`}>{conditionLabels[condition]}</button>)}
        </div>
      </div>
      {activeFilters.length > 0 && <Button variant="outline" className="w-full rounded-xl" onClick={clearFilters}><X className="h-4 w-4" />Clear all filters</Button>}
    </div>
  );

  return (
    <>
      <section className="relative overflow-hidden bg-[#101114] py-10 text-white sm:py-14">
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_80%_20%,rgba(220,38,38,.45),transparent_30%),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:auto,40px_40px,40px_40px]" />
        <div className="container-page relative">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-400">ANSHA inventory</span>
          <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">Automotive parts catalog</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Search live stock by product, OEM number, part code, brand, category, or condition.</p></div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><PackageSearch className="h-5 w-5 text-accent" /><div><strong className="block text-sm">{loading ? 'Checking stock' : `${totalCount} results`}</strong><span className="text-[10px] text-white/45">Published inventory only</span></div></div>
          </div>
        </div>
      </section>

      <div className="surface-mist border-t border-accent/10">
      <div className="container-page py-7 sm:py-10">
        <form onSubmit={(event) => { event.preventDefault(); setParam('q', query); }} className="relative mb-5">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, OEM number or part code" className="h-14 rounded-2xl border-accent/15 bg-card pl-12 pr-28 text-base shadow-sm" />
          <Button type="submit" variant="accent" className="absolute right-1.5 top-1.5 h-11 rounded-xl px-5">Search</Button>
        </form>

        {activeFilters.length > 0 && <div className="mb-5 flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-muted-foreground">Active:</span>{activeFilters.map((filter) => <Badge key={filter.key} variant="secondary" className="gap-1.5 rounded-full px-3 py-1.5">{filter.label}<button onClick={() => setParam(filter.key, 'all')} aria-label={`Remove ${filter.label} filter`}><X className="h-3 w-3" /></button></Badge>)}</div>}

        <div className="flex gap-5 lg:gap-7">
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-48 catalog-panel p-5 lg:top-52">
              <div className="mb-6 flex items-center gap-2 border-b border-accent/15 pb-4"><Filter className="h-4 w-4 text-accent" /><h2 className="font-extrabold">Filter inventory</h2></div>
              {filterControls}
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mb-5 flex items-center justify-between gap-3">
              <Sheet>
                <SheetTrigger asChild><Button variant="outline" className="rounded-xl lg:hidden"><SlidersHorizontal className="h-4 w-4" />Filters{activeFilters.length > 0 && <Badge className="ml-1 h-5 min-w-5 rounded-full bg-accent px-1.5">{activeFilters.length}</Badge>}</Button></SheetTrigger>
                <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto">
                  <SheetHeader><SheetTitle>Filter inventory</SheetTitle></SheetHeader>
                  <div className="mt-7">{filterControls}</div>
                </SheetContent>
              </Sheet>
              <p className="hidden text-sm text-muted-foreground sm:block">{loading ? 'Loading…' : `Showing ${parts.length} of ${totalCount}`}</p>
              <Select value={sortBy} onValueChange={(value) => setParam('sort', value)}>
                <SelectTrigger className="ml-auto h-10 w-[170px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{sortOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="min-h-[18rem] rounded-2xl sm:min-h-[22rem]" />
                ))}
              </div>
            ) : parts.length ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                {parts.map((part, index) => (
                  <PartCard key={part.id} part={part} priority={index < 4} deal={dealForPart(part.id)} />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border bg-secondary/30 px-6 py-20 text-center"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground/25" /><h2 className="mt-5 text-xl font-extrabold">No matching parts found</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Try fewer filters or send your OEM/chassis details to our sourcing team.</p><div className="mt-5 flex justify-center gap-3"><Button onClick={clearFilters} variant="outline">Clear filters</Button><Button asChild variant="accent"><a href="/contact">Request a part</a></Button></div></div>
            )}

            {totalPages > 1 && <div className="mt-9 flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}><ChevronLeft className="h-4 w-4" />Previous</Button><span className="text-xs font-bold text-muted-foreground">Page {page} of {totalPages}</span><Button variant="outline" disabled={page >= totalPages} onClick={() => setParam('page', String(page + 1))}>Next<ChevronRight className="h-4 w-4" /></Button></div>}
          </main>
        </div>
      </div>
      </div>
    </>
  );
}

export default function PartsCatalogPage() {
  return <Suspense fallback={<div className="container-page py-20"><Skeleton className="h-[520px] w-full rounded-3xl" /></div>}><PartsCatalog /></Suspense>;
}

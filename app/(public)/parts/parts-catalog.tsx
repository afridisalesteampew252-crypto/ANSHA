'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Filter, PackageSearch, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
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
import { getPublicCatalogClient } from '@/lib/supabase/public-catalog';
import type { PublicCategoryCard, PublicPartCard } from '@/lib/public-card-data';
import {
  PARTS_PAGE_SIZE,
  fetchPartsCatalogPage,
  fetchPublicCategories,
  parsePartsCatalogFilters,
  type PartsCatalogFilters,
} from '@/lib/catalog-queries';
import type { PartCondition } from '@/lib/types';

// Public catalog data is read with the anon client, even for signed-in users.
const supabase = getPublicCatalogClient();

const conditions: PartCondition[] = ['new', 'used', 'refurbished', 'for-parts'];
const sortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name: A–Z' },
  { value: 'price-low', label: 'Price: low to high' },
  { value: 'price-high', label: 'Price: high to low' },
];

export type PartsCatalogInitial = {
  filters: PartsCatalogFilters;
  categories: PublicCategoryCard[];
  items: PublicPartCard[];
  count: number;
};

function PartsCatalog({ initial }: { initial?: PartsCatalogInitial }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dealForPart } = useInventoryDeals();
  const paramsString = searchParams.toString();
  const filters = useMemo(() => parsePartsCatalogFilters(new URLSearchParams(paramsString)), [paramsString]);
  const matchingInitial = initial && JSON.stringify(initial.filters) === JSON.stringify(filters) ? initial : undefined;
  const [parts, setParts] = useState<PublicPartCard[]>(matchingInitial?.items ?? []);
  const [categories, setCategories] = useState<PublicCategoryCard[]>(initial?.categories ?? []);
  const [categoriesLoaded, setCategoriesLoaded] = useState(Boolean(initial));
  const [loading, setLoading] = useState(!matchingInitial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(matchingInitial?.count ?? 0);
  const [query, setQuery] = useState(filters.q);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { category: selectedCategory, condition: selectedCondition, brand: selectedBrand, stock: selectedStock, sort: sortBy, page } = filters;
  const pageSize = PARTS_PAGE_SIZE;
  const appliedQuery = filters.q;
  const selectedCategoryId = categories.find((item) => item.slug === selectedCategory)?.id;
  const canFetchParts = selectedCategory === 'all' || categoriesLoaded;
  const consumedInitialRef = useRef<PartsCatalogInitial | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (initial) {
      setCategories(initial.categories);
      setCategoriesLoaded(true);
      return;
    }
    let cancelled = false;
    void fetchPublicCategories(supabase).then((rows) => {
      if (cancelled) return;
      setCategories(rows);
      setCategoriesLoaded(true);
    });
    return () => { cancelled = true; };
  }, [initial]);

  useEffect(() => {
    setQuery(filters.q);
  }, [filters.q]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#catalog-search') return;
    const input = document.querySelector<HTMLInputElement>('#catalog-search input');
    input?.focus({ preventScroll: false });
  }, []);

  useEffect(() => {
    if (!canFetchParts) return;
    // A server refresh keeps this component mounted. Adopt only data for the
    // current URL, once per payload, so older navigations cannot replace it.
    if (matchingInitial && consumedInitialRef.current !== matchingInitial) {
      consumedInitialRef.current = matchingInitial;
      setParts(matchingInitial.items);
      setTotalCount(matchingInitial.count);
      setLoadError(null);
      setLoading(false);
      inFlightRef.current = false;
      return;
    }
    let cancelled = false;
    inFlightRef.current = true;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const { items, count, error } = await fetchPartsCatalogPage(supabase, filters, selectedCategoryId);
        if (cancelled) return;
        if (error) {
          setLoadError('Could not refresh stock. Please try again.');
          return;
        }
        setParts(items);
        setTotalCount(count);
      } catch {
        if (!cancelled) setLoadError('Could not refresh stock. Please try again.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          inFlightRef.current = false;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [canFetchParts, filters, matchingInitial, refreshVersion, selectedCategoryId]);

  const refreshStock = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRefreshVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    let lastRefresh = 0;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'hidden' || inFlightRef.current) return;
      const now = Date.now();
      if (now - lastRefresh < 1000) return;
      lastRefresh = now;
      refreshStock();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshStock]);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || (key !== 'q' && value === 'all') || (key === 'page' && value === '1')) params.delete(key);
    else params.set(key, value);
    if (key !== 'page') params.delete('page');
    if (params.toString() === paramsString) refreshStock();
    else router.push(`/parts${params.size ? `?${params.toString()}` : ''}`);
  };

  const clearFilters = () => { if (!paramsString) refreshStock(); else router.push('/parts'); };
  const activeFilters = [
    appliedQuery && { key: 'q', label: `“${appliedQuery}”` },
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
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><PackageSearch className="h-5 w-5 shrink-0 text-accent" /><div><strong aria-live="polite" className="block text-sm">{loading ? 'Checking stock' : loadError ? 'Stock unavailable' : `${totalCount} results`}</strong><span className="text-[10px] text-white/45">Published inventory only</span></div><Button type="button" variant="outline" size="sm" disabled={loading} onClick={refreshStock} className="ml-2 shrink-0 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh stock</Button></div>
          </div>
        </div>
      </section>

      <div className="surface-mist border-t border-accent/10">
      <div className="container-page py-7 sm:py-10">
        <form id="catalog-search" onSubmit={(event) => { event.preventDefault(); setParam('q', query); }} className="relative mb-5 scroll-mt-28">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, OEM number or part code" className="h-14 rounded-2xl border-accent/15 bg-card pl-12 pr-28 text-base shadow-sm" />
          <Button type="submit" variant="accent" className="absolute right-1.5 top-1.5 h-11 min-w-[5.5rem] rounded-xl px-5">Search</Button>
        </form>

        {activeFilters.length > 0 && <div className="mb-5 flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-muted-foreground">Active:</span>{activeFilters.map((filter) => <Badge key={filter.key} variant="secondary" className="gap-1.5 rounded-full px-3 py-1.5">{filter.label}<button onClick={() => setParam(filter.key, filter.key === 'q' ? '' : 'all')} aria-label={`Remove ${filter.label} filter`}><X className="h-3 w-3" /></button></Badge>)}</div>}

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
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-11 min-h-11 rounded-xl lg:hidden">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters
                    {activeFilters.length > 0 && (
                      <Badge className="ml-1 h-5 min-w-5 rounded-full bg-accent px-1.5">{activeFilters.length}</Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  className="flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3 lg:hidden"
                >
                  <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-border" aria-hidden />
                  <SheetHeader className="shrink-0 text-left">
                    <SheetTitle>Filter inventory</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">{filterControls}</div>
                </SheetContent>
              </Sheet>
              <p className="hidden text-sm text-muted-foreground sm:block">{loading ? 'Loading…' : loadError ? 'Stock could not be checked' : `Showing ${parts.length} of ${totalCount}`}</p>
              <Select value={sortBy} onValueChange={(value) => setParam('sort', value)}>
                <SelectTrigger className="ml-auto h-11 w-[170px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{sortOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {loadError && <p role="alert" className="mb-4 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">{loadError}{parts.length > 0 ? ' Previously loaded parts remain below.' : ''}</p>}

            {loading ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="min-h-[18rem] rounded-2xl sm:min-h-[22rem]" />
                ))}
              </div>
            ) : loadError && !parts.length ? (
              <div className="rounded-3xl border border-dashed border-border bg-secondary/30 px-6 py-20 text-center"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground/25" /><h2 className="mt-5 text-xl font-extrabold">Stock is temporarily unavailable</h2><p className="mt-2 text-sm text-muted-foreground">Use Refresh stock to try again.</p></div>
            ) : parts.length ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                {parts.map((part, index) => (
                  <PartCard key={part.id} part={part} priority={index < 4} deal={dealForPart(part.id)} />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border bg-secondary/30 px-6 py-20 text-center"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground/25" /><h2 className="mt-5 text-xl font-extrabold">No matching parts found</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Try fewer filters or send your OEM/chassis details to our sourcing team.</p><div className="mt-5 flex justify-center gap-3"><Button onClick={clearFilters} variant="outline">Clear filters</Button><Button asChild variant="accent"><a href="/contact">Request a part</a></Button></div></div>
            )}

            {!loadError && totalPages > 1 && <div className="mt-9 flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}><ChevronLeft className="h-4 w-4" />Previous</Button><span className="text-xs font-bold text-muted-foreground">Page {page} of {totalPages}</span><Button variant="outline" disabled={page >= totalPages} onClick={() => setParam('page', String(page + 1))}>Next<ChevronRight className="h-4 w-4" /></Button></div>}
          </main>
        </div>
      </div>
      </div>
    </>
  );
}

export default function PartsCatalogPage({ initial }: { initial?: PartsCatalogInitial }) {
  return <Suspense fallback={<div className="container-page py-20"><Skeleton className="h-[520px] w-full rounded-3xl" /></div>}><PartsCatalog initial={initial} /></Suspense>;
}

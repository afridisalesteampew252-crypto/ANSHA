'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, X, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { PartCard } from '@/components/public/part-card';
import { supabase } from '@/lib/supabase/client';
import type { Category, PartWithRelations, PartCondition } from '@/lib/types';
import { conditionLabels } from '@/lib/site-config';
import { SUPPORTED_MANUFACTURERS } from '@/lib/manufacturer-logos';
import { Skeleton } from '@/components/ui/skeleton';

const conditions: PartCondition[] = ['new', 'used', 'refurbished', 'for-parts'];
const sortOptions = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name: A to Z' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
];

function PartsCatalogPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [parts, setParts] = useState<PartWithRelations[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'all');
  const [selectedCondition, setSelectedCondition] = useState<string>(searchParams.get('condition') || 'all');
  const [selectedBrand, setSelectedBrand] = useState(searchParams.get('brand') || 'all');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'newest');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const pageSize = 12;

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from('categories').select('*').order('sort_order');
    setCategories((data || []) as Category[]);
  }, []);

  const fetchParts = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      const pageNum = reset ? 1 : page;

      let dbQuery = supabase
        .from('parts')
        .select('*, categories(*), part_photos(*), part_compatibility(*)', { count: 'exact' })
        .eq('is_published', true);

      if (query.trim()) {
        dbQuery = dbQuery.or(
          `name.ilike.%${query.trim()}%,part_code.ilike.%${query.trim()}%,oem_number.ilike.%${query.trim()}%,part_number.ilike.%${query.trim()}%`
        );
      }

      if (selectedCategory !== 'all') {
        const cat = categories.find((c) => c.slug === selectedCategory);
        if (cat) {
          dbQuery = dbQuery.eq('category_id', cat.id);
        }
      }

      if (selectedCondition !== 'all') {
        dbQuery = dbQuery.eq('condition', selectedCondition);
      }

      if (selectedBrand !== 'all') {
        dbQuery = dbQuery.eq('brand', selectedBrand);
      }

      switch (sortBy) {
        case 'oldest':
          dbQuery = dbQuery.order('created_at', { ascending: true });
          break;
        case 'name':
          dbQuery = dbQuery.order('name', { ascending: true });
          break;
        case 'price-low':
          dbQuery = dbQuery.order('price', { ascending: true, nullsFirst: false });
          break;
        case 'price-high':
          dbQuery = dbQuery.order('price', { ascending: false, nullsFirst: true });
          break;
        default:
          dbQuery = dbQuery.order('created_at', { ascending: false });
      }

      dbQuery = dbQuery.range((pageNum - 1) * pageSize, pageNum * pageSize - 1);

      const { data, count } = await dbQuery;

      if (reset) {
        setParts((data || []) as unknown as PartWithRelations[]);
        setPage(1);
      } else {
        setParts((prev) => [...prev, ...((data || []) as unknown as PartWithRelations[])]);
      }
      setTotalCount(count || 0);
      setHasMore((count || 0) > pageNum * pageSize);
      setLoading(false);
    },
    [query, selectedCategory, selectedCondition, selectedBrand, sortBy, page, categories]
  );

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setSelectedCategory(searchParams.get('category') || 'all');
    setSelectedCondition(searchParams.get('condition') || 'all');
    setSelectedBrand(searchParams.get('brand') || 'all');
    setSortBy(searchParams.get('sort') || 'newest');
  }, [searchParams]);

  useEffect(() => {
    if (categories.length > 0 || !selectedCategory || selectedCategory === 'all') {
      fetchParts(true);
    }
  }, [query, selectedCategory, selectedCondition, selectedBrand, sortBy, fetchParts, categories.length]);

  const updateUrl = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all' || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/parts?${params.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrl('q', query);
  };

  const clearFilters = () => {
    setQuery('');
    setSelectedCategory('all');
    setSelectedCondition('all');
    setSelectedBrand('all');
    setSortBy('newest');
    router.push('/parts');
  };

  const activeFilterCount =
    (query ? 1 : 0) +
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedCondition !== 'all' ? 1 : 0) +
    (selectedBrand !== 'all' ? 1 : 0);

  return (
    <div>
      {/* Page header */}
      <section className="border-b border-border bg-secondary/40">
        <div className="container-page py-10">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="accent-bar" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Catalog</p>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Parts Catalog</h1>
          <p className="mt-1 text-muted-foreground">
            {loading && parts.length === 0
              ? 'Loading parts...'
              : `${totalCount} part${totalCount !== 1 ? 's' : ''} found`}
          </p>
        </div>
      </section>

      <div className="container-page py-8">

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Desktop sidebar filters */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-24 space-y-6">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Brand</h3>
              <Select value={selectedBrand} onValueChange={(v) => updateUrl('brand', v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All brands" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {SUPPORTED_MANUFACTURERS.map((brand) => (
                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">Category</h3>
              <Select value={selectedCategory} onValueChange={(v) => updateUrl('category', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.slug}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold">Condition</h3>
              <div className="space-y-2">
                <Button
                  variant={selectedCondition === 'all' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => updateUrl('condition', 'all')}
                >
                  All Conditions
                </Button>
                {conditions.map((cond) => (
                  <Button
                    key={cond}
                    variant={selectedCondition === cond ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => updateUrl('condition', cond)}
                  >
                    {conditionLabels[cond]}
                  </Button>
                ))}
              </div>
            </div>

            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" className="w-full" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1">
          {/* Search + sort bar */}
          <div className="mb-6 flex flex-col sm:flex-row gap-3">
            <form onSubmit={handleSearchSubmit} className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by name, OEM number, part number..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
              />
            </form>

            <div className="flex gap-3">
              {/* Mobile filter button */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="default" className="lg:hidden">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-6">
                    <div>
                      <h3 className="mb-3 text-sm font-semibold">Category</h3>
                      <Select value={selectedCategory} onValueChange={(v) => updateUrl('category', v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="All categories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.slug}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <h3 className="mb-3 text-sm font-semibold">Condition</h3>
                      <div className="space-y-2">
                        <Button
                          variant={selectedCondition === 'all' ? 'secondary' : 'ghost'}
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => updateUrl('condition', 'all')}
                        >
                          All Conditions
                        </Button>
                        {conditions.map((cond) => (
                          <Button
                            key={cond}
                            variant={selectedCondition === cond ? 'secondary' : 'ghost'}
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => updateUrl('condition', cond)}
                          >
                            {conditionLabels[cond]}
                          </Button>
                        ))}
                      </div>
                    </div>
                    {activeFilterCount > 0 && (
                      <Button variant="outline" size="sm" className="w-full" onClick={clearFilters}>
                        <X className="h-4 w-4" />
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </SheetContent>
              </Sheet>

              <Select value={sortBy} onValueChange={(v) => updateUrl('sort', v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active filter badges */}
          {activeFilterCount > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {query && (
                <Badge variant="secondary" className="gap-1">
                  Search: "{query}"
                  <button onClick={() => { setQuery(''); updateUrl('q', ''); }}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {selectedCategory !== 'all' && (
                <Badge variant="secondary" className="gap-1">
                  {categories.find((c) => c.slug === selectedCategory)?.name}
                  <button onClick={() => updateUrl('category', 'all')}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {selectedCondition !== 'all' && (
                <Badge variant="secondary" className="gap-1">
                  {conditionLabels[selectedCondition]}
                  <button onClick={() => updateUrl('condition', 'all')}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}

          {/* Parts grid */}
          {loading && parts.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-square w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : parts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Wrench className="h-12 w-12 text-muted-foreground/30" />
              <h3 className="mt-4 text-lg font-semibold">No parts found</h3>
              <p className="mt-1 text-muted-foreground">
                Try adjusting your search or filters.
              </p>
              {activeFilterCount > 0 && (
                <Button variant="outline" className="mt-4" onClick={clearFilters}>
                  Clear All Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {parts.map((part) => (
                  <PartCard key={part.id} part={part} />
                ))}
              </div>
              {hasMore && (
                <div className="mt-8 text-center">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setPage((p) => p + 1);
                      fetchParts(false);
                    }}
                    disabled={loading}
                  >
                    {loading ? 'Loading...' : 'Load More Parts'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

export default function PartsCatalogRoute() {
  return (
    <Suspense
      fallback={
        <div className="container-page py-12">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="mt-6 h-96 w-full" />
        </div>
      }
    >
      <PartsCatalogPage />
    </Suspense>
  );
}

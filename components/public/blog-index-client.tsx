'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Search, FileText, ArrowRight, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BlogCard } from '@/components/public/blog-card';
import { FeaturedArticle } from '@/components/public/featured-article';
import { supabase } from '@/lib/supabase/client';
import type { BlogCategory, BlogPostWithCategory } from '@/lib/types';

export function BlogIndexClient() {
  const [posts, setPosts] = useState<BlogPostWithCategory[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [featured, setFeatured] = useState<BlogPostWithCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [visibleCount, setVisibleCount] = useState(9);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    (async () => {
      const [catRes, featRes] = await Promise.all([
        supabase.from('blog_categories').select('*').order('name'),
        supabase
          .from('blog_posts')
          .select('*, blog_categories(*)')
          .eq('status', 'published')
          .eq('is_featured', true)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setCategories((catRes.data || []) as BlogCategory[]);
      setFeatured((featRes.data || null) as unknown as BlogPostWithCategory | null);
    })();
  }, []);

  const selectedCategoryId = useMemo(
    () => categories.find((category) => category.slug === selectedCategory)?.id ?? null,
    [categories, selectedCategory]
  );

  const fetchByCategory = useCallback(async (categoryId: string | null, search: string) => {
    setLoading(true);
    let query = supabase
      .from('blog_posts')
      .select('*, blog_categories(*)')
      .eq('status', 'published');

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (search.trim()) {
      query = query.or(`title.ilike.%${search.trim()}%,excerpt.ilike.%${search.trim()}%`);
    }

    query = query.order('published_at', { ascending: false, nullsFirst: false }).limit(9);
    const { data } = await query;
    setPosts((data || []) as unknown as BlogPostWithCategory[]);
    setVisibleCount(9);
    setHasMore((data || []).length >= 9);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedCategory !== 'all' && !selectedCategoryId) return;

    const timer = setTimeout(() => {
      void fetchByCategory(selectedCategoryId, searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [selectedCategory, selectedCategoryId, searchQuery, fetchByCategory]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    let query = supabase
      .from('blog_posts')
      .select('*, blog_categories(*)')
      .eq('status', 'published');

    if (selectedCategory !== 'all') {
      const cat = categories.find((c) => c.slug === selectedCategory);
      if (cat) query = query.eq('category_id', cat.id);
    }

    if (searchQuery.trim()) {
      query = query.or(`title.ilike.%${searchQuery.trim()}%,excerpt.ilike.%${searchQuery.trim()}%`);
    }

    query = query
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(visibleCount, visibleCount + 8);
    const { data } = await query;
    setPosts((prev) => [...prev, ...((data || []) as unknown as BlogPostWithCategory[])]);
    setVisibleCount((c) => c + 9);
    setHasMore((data || []).length >= 9);
    setLoadingMore(false);
  };

  return (
    <div>
      <section className="page-band">
        <div className="container-page py-10 sm:py-14">
          <p className="eyebrow text-accent mb-1.5">Knowledge Base</p>
          <h1 className="font-display text-2xl font-black tracking-tight md:text-4xl">Used Japanese cars, parts &amp; export insights</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
            Practical guides from ANSHA TRADING — Japan auction sheets, OEM remotes, Dubai export shipping, and heavy machinery sourcing.
          </p>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/55">
            <Link href="/vehicles" className="hover:text-white hover:underline">Vehicles</Link>
            <Link href="/parts" className="hover:text-white hover:underline">Parts</Link>
            <Link href="/machinery" className="hover:text-white hover:underline">Machinery</Link>
            <Link href="/#export-markets" className="hover:text-white hover:underline">Export markets</Link>
          </p>
          <div className="relative mt-5 max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              type="search"
              aria-label="Search articles"
              placeholder="Search articles, parts guides, export information..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-white/15 bg-white/10 pl-10 text-white placeholder:text-white/40"
            />
          </div>
        </div>
      </section>

      <div className="surface-cool border-t border-accent/10">
      <div className="container-page py-8 sm:py-10">
        {/* Featured article */}
        {!loading && featured && selectedCategory === 'all' && !searchQuery && (
          <div className="mb-8">
            <FeaturedArticle post={featured} />
          </div>
        )}

        {/* Category chips */}
        {categories.length > 0 && (
          <div className="mb-6 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain touch-pan-x pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              aria-pressed={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-accent text-white'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              All Articles
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                aria-pressed={selectedCategory === cat.slug}
                onClick={() => setSelectedCategory(cat.slug)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  selectedCategory === cat.slug
                    ? 'bg-accent text-white'
                    : 'border border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Posts grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[16/10] w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-accent/20 bg-card py-20 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-border">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="mt-6 text-lg font-semibold">No articles found</h3>
            <p className="mt-1 text-muted-foreground">
              {searchQuery ? 'Try a different search term.' : 'Check back soon for new articles.'}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {posts.length} article{posts.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
            {hasMore && (
              <div className="mt-8 text-center">
                <Button variant="outline" size="lg" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Load More Articles
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

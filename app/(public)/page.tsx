'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Wrench, ShieldCheck, Truck, Headphones, ArrowRight, Cog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PartCard } from '@/components/public/part-card';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { supabase } from '@/lib/supabase/client';
import type { Category, PartWithRelations } from '@/lib/types';

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredParts, setFeaturedParts] = useState<PartWithRelations[]>([]);
  const [latestParts, setLatestParts] = useState<PartWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useState(() => {
    (async () => {
      const [catRes, featRes, latestRes] = await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .order('sort_order')
          .limit(12),
        supabase
          .from('parts')
          .select('*, categories(*), part_photos(*), part_compatibility(*)')
          .eq('is_published', true)
          .eq('is_featured', true)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('parts')
          .select('*, categories(*), part_photos(*), part_compatibility(*)')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      setCategories(catRes.data || []);
      setFeaturedParts(featRes.data || []);
      setLatestParts(latestRes.data || []);
      setLoading(false);
      setLoaded(true);
    })();
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/parts?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  return (
    <>
      {/* Hero */}
      <section className="relative border-b border-border bg-gradient-to-b from-secondary/50 to-background">
        <div className="container-page py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-1.5 text-sm text-muted-foreground">
              <Wrench className="h-4 w-4 text-primary" />
              Trusted Automotive Spare Parts Supplier
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-balance md:text-5xl">
              Find the Right Part for Your Vehicle
            </h1>
            <p className="mt-4 text-lg text-muted-foreground text-balance">
              Search thousands of quality automotive spare parts by name, OEM number, or vehicle compatibility.
            </p>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="mt-8 mx-auto max-w-2xl">
              <div className="relative flex items-center">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  type="search"
                  placeholder="Search: Toyota Aqua Headlight, NHP10, 81110-52J30..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 pr-32 h-14 text-base rounded-lg"
                />
                <Button type="submit" size="lg" className="absolute right-1.5 h-11 rounded-md">
                  Search
                </Button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
              <span className="text-muted-foreground">Popular:</span>
              {['Headlights', 'Toyota Aqua', 'NHP10', 'Brakes'].map((term) => (
                <Link
                  key={term}
                  href={`/parts?q=${encodeURIComponent(term)}`}
                  className="text-primary hover:underline"
                >
                  {term}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="border-b border-border">
        <div className="container-page py-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: ShieldCheck, title: 'Quality Assured', desc: 'Verified parts with accurate descriptions' },
              { icon: Truck, title: 'Fast Shipping', desc: 'Quick dispatch to your location' },
              { icon: Cog, title: 'Wide Range', desc: 'Parts for all major vehicle brands' },
              { icon: Headphones, title: 'Expert Support', desc: 'WhatsApp us anytime for help' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16">
        <div className="container-page">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Browse Categories</h2>
              <p className="mt-1 text-muted-foreground">Find parts by category type</p>
            </div>
            <Link href="/categories" className="text-sm font-medium text-primary hover:underline">
              View All →
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No categories available yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {categories.slice(0, 6).map((cat) => (
                <Link key={cat.id} href={`/categories/${cat.slug}`}>
                  <Card className="hover:border-primary/30 hover:shadow-sm transition-all">
                    <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                      <Cog className="h-8 w-8 text-primary mb-2" />
                      <span className="text-sm font-medium">{cat.name}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Featured parts */}
      {!loading && featuredParts.length > 0 && (
        <section className="py-16 bg-secondary/30">
          <div className="container-page">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Featured Parts</h2>
                <p className="mt-1 text-muted-foreground">Hand-picked quality parts</p>
              </div>
              <Link href="/parts" className="text-sm font-medium text-primary hover:underline">
                All Parts →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featuredParts.map((part) => (
                <PartCard key={part.id} part={part} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Latest parts */}
      {!loading && latestParts.length > 0 && (
        <section className="py-16">
          <div className="container-page">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Latest Arrivals</h2>
                <p className="mt-1 text-muted-foreground">Newly added parts in stock</p>
              </div>
              <Link href="/parts" className="text-sm font-medium text-primary hover:underline">
                All Parts →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {latestParts.map((part) => (
                <PartCard key={part.id} part={part} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Empty state when no parts at all */}
      {loaded && !loading && latestParts.length === 0 && featuredParts.length === 0 && (
        <section className="py-16">
          <div className="container-page text-center">
            <Wrench className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h2 className="mt-4 text-xl font-semibold">Parts catalog coming soon</h2>
            <p className="mt-2 text-muted-foreground">
              We're updating our inventory. Send us an inquiry or message us on WhatsApp for any part you need.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <WhatsAppButton />
              <Link href="/contact">
                <Button variant="outline">Contact Us</Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="border-t border-border bg-primary py-12">
        <div className="container-page flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
          <div>
            <h2 className="text-2xl font-bold text-primary-foreground">Can't find what you're looking for?</h2>
            <p className="mt-1 text-primary-foreground/80">
              Send us an inquiry and we'll source it for you.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <WhatsAppButton variant="default" />
            <Link href="/parts">
              <Button variant="outline" size="lg" className="bg-white">
                Browse All Parts
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

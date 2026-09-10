'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search, ShieldCheck, Truck, Headphones, ArrowRight, Package,
  CheckCircle2, Wrench, Cog, PackageCheck, Globe2, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PartCard } from '@/components/public/part-card';
import { VehicleCard } from '@/components/public/vehicle-card';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { supabase } from '@/lib/supabase/client';
import type { Category, PartWithRelations, VehicleWithPhotos } from '@/lib/types';

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredParts, setFeaturedParts] = useState<PartWithRelations[]>([]);
  const [latestParts, setLatestParts] = useState<PartWithRelations[]>([]);
  const [featuredVehicles, setFeaturedVehicles] = useState<VehicleWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [catRes, featRes, latestRes, featVehiclesRes] = await Promise.all([
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
        supabase
          .from('vehicles')
          .select('*, vehicle_photos(*)')
          .eq('is_published', true)
          .eq('is_featured', true)
          .order('created_at', { ascending: false })
          .limit(4),
      ]);

      setCategories((catRes.data || []) as Category[]);
      setFeaturedParts((featRes.data || []) as unknown as PartWithRelations[]);
      setLatestParts((latestRes.data || []) as unknown as PartWithRelations[]);
      setFeaturedVehicles((featVehiclesRes.data || []) as unknown as VehicleWithPhotos[]);
      setLoading(false);
      setLoaded(true);
    })();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/parts?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-foreground text-background">
        <div className="absolute inset-0 opacity-15">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.pexels.com/photos/5158155/pexels-photo-5158155.jpeg?auto=compress&cs=tinysrgb&w=1920"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-foreground via-foreground/90 to-foreground/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground via-transparent to-foreground/20" />
        <div className="absolute inset-0 bg-grid-dark opacity-20" />

        <div className="relative container-page py-20 md:py-28">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-background/15 bg-background/5 px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-background/70 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Trusted Automotive Spare Parts Supplier
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-balance md:text-5xl lg:text-6xl">
              Find the Right Part<br />
              <span className="text-background/40">for Your Vehicle</span>
            </h1>
            <p className="mt-5 text-lg text-background/60 leading-relaxed max-w-xl">
              Search thousands of quality automotive spare parts by name, OEM number, or vehicle compatibility. Source, ship, and repair with confidence.
            </p>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="mt-8 max-w-xl">
              <div className="relative flex items-center rounded-lg bg-background p-1.5 shadow-2xl">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  type="search"
                  placeholder="Search: Toyota Aqua Headlight, NHP10, 81110-52J30..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-0 bg-transparent pl-12 pr-4 h-11 text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <Button type="submit" variant="accent" className="h-9 rounded-md shrink-0 mr-1">
                  Search
                </Button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-background/40">Popular:</span>
              {['Headlights', 'Toyota Aqua', 'NHP10', 'Brakes'].map((term) => (
                <Link
                  key={term}
                  href={`/parts?q=${encodeURIComponent(term)}`}
                  className="rounded-md border border-background/10 bg-background/5 px-2.5 py-1 text-background/60 transition-colors hover:text-background hover:border-background/20"
                >
                  {term}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="border-b border-border bg-white">
        <div className="container-page py-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: ShieldCheck, title: 'Quality Assured', desc: 'Verified parts with accurate descriptions' },
              { icon: Truck, title: 'Fast Dispatch', desc: 'Quick dispatch to your location' },
              { icon: Globe2, title: 'Global Shipping', desc: 'Parts for all major vehicle brands' },
              { icon: Headphones, title: 'Expert Support', desc: 'WhatsApp us anytime for help' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/40 text-accent">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
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
              <div className="mb-1.5 flex items-center gap-2">
                <span className="accent-bar" />
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Browse</p>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Shop by Category</h2>
            </div>
            <Link href="/categories" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              View All →
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No categories available yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {categories.slice(0, 6).map((cat) => (
                <Link key={cat.id} href={`/categories/${cat.slug}`}>
                  <Card className="group overflow-hidden hover:shadow-card-hover hover:border-foreground/15 transition-all duration-200">
                    <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
                      {cat.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cat.image_url}
                          alt={cat.name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Package className="h-8 w-8 text-muted-foreground/25" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-2.5">
                        <span className="text-xs font-semibold text-white">{cat.name}</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Featured vehicles */}
      {!loading && featuredVehicles.length > 0 && (
        <section className="py-16 bg-secondary/30">
          <div className="container-page">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="accent-bar" />
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Showroom</p>
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Featured Vehicles</h2>
              </div>
              <Link href="/vehicles" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featuredVehicles.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured parts */}
      {!loading && featuredParts.length > 0 && (
        <section className="py-16">
          <div className="container-page">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="accent-bar" />
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Hand-picked</p>
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Featured Parts</h2>
              </div>
              <Link href="/parts" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
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

      {/* How we work — process */}
      <section className="py-16 bg-secondary/30">
        <div className="container-page">
          <div className="mb-10 text-center">
            <div className="mb-1.5 flex items-center justify-center gap-2">
              <span className="accent-bar" />
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Our Process</p>
              <span className="accent-bar" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">How It Works</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
              From finding the right part to receiving it at your door — a simple, reliable process.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Search, step: '01', title: 'Find Parts', desc: 'Search our catalog by name, OEM number, or vehicle compatibility.' },
              { icon: Send, step: '02', title: 'Send Inquiry', desc: 'Submit an inquiry or message us on WhatsApp for availability.' },
              { icon: PackageCheck, step: '03', title: 'Confirmation', desc: 'We confirm the part, condition, and price with you before packing.' },
              { icon: Truck, step: '04', title: 'Dispatch & Shipping', desc: 'Your order is packed securely and dispatched to your location.' },
            ].map((item, idx) => (
              <div key={item.step} className="relative rounded-xl border border-border bg-white p-5 transition-shadow hover:shadow-card-hover">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/50 text-accent">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className="text-2xl font-extrabold text-muted-foreground/15">{item.step}</span>
                </div>
                <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                {idx < 3 && (
                  <div className="hidden lg:block absolute top-1/2 -right-2.5 z-10 h-5 w-5 items-center justify-center">
                    <ArrowRight className="h-4 w-4 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Latest parts */}
      {!loading && latestParts.length > 0 && (
        <section className="py-16">
          <div className="container-page">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="accent-bar" />
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New Stock</p>
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Latest Arrivals</h2>
              </div>
              <Link href="/parts" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
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
        <section className="py-20">
          <div className="container-page text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-border">
              <Package className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h2 className="mt-6 text-xl font-bold">Parts catalog coming soon</h2>
            <p className="mt-2 text-muted-foreground max-w-md mx-auto">
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
      <section className="bg-foreground text-background">
        <div className="container-page flex flex-col items-center justify-between gap-6 py-14 text-center md:flex-row md:text-left">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1 w-10 rounded-full bg-accent" />
              <span className="text-xs font-bold uppercase tracking-wider text-background/50">Can't find it?</span>
            </div>
            <h2 className="text-2xl font-bold">We'll source it for you</h2>
            <p className="mt-1.5 text-background/60">
              Send us an inquiry with your part details and we'll find it for you.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <WhatsAppButton variant="accent" />
            <Link href="/parts">
              <Button variant="outline" size="lg" className="bg-transparent border-background/25 text-background hover:bg-background/10 hover:text-background">
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

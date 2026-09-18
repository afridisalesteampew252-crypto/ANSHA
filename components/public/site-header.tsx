'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Headphones,
  Mail,
  Menu,
  PackageSearch,
  Phone,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { siteConfig } from '@/lib/site-config';
import { ThemeToggle } from '@/components/theme-toggle';
import { STOCK_ORIGINS } from '@/lib/stock';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/parts', label: 'Parts' },
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/categories', label: 'Categories' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Insights' },
  { href: '/offers', label: 'Offers' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setMobileOpen(false);
    router.push(`/parts?q=${encodeURIComponent(query)}`);
  };

  return (
    <header className="sticky top-0 z-50 w-full max-w-[100vw] overflow-x-clip">
      <div className="hidden bg-[#101114] text-white lg:block">
        <div className="container-page flex h-9 items-center justify-between text-[11px]">
          <p className="flex items-center gap-2 font-semibold uppercase tracking-[0.14em] text-white/65">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Dubai-based global automotive exporter
          </p>
          <div className="flex items-center gap-5 text-white/65">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-accent" />Verified inventory</span>
            <span className="flex items-center gap-1.5"><Headphones className="h-3.5 w-3.5 text-accent" />Export support</span>
            <Link href="/admin" className="flex items-center gap-1.5 transition-colors hover:text-white">
              <CircleUserRound className="h-3.5 w-3.5" />Staff login
            </Link>
          </div>
        </div>
      </div>

      <div className={cn(
        'border-b border-border bg-background transition-shadow',
        scrolled && 'shadow-[0_8px_28px_rgba(15,23,42,0.08)]'
      )}>
        <div className="container-page flex h-[64px] items-center gap-2 sm:h-[76px] sm:gap-4 lg:h-[88px]">
          <Link href="/" className="flex min-w-0 shrink items-center" aria-label="Ansha Trading home">
            <Image
              src="/images/ansha-logo-transparent.webp"
              alt="Ansha Trading Co. LLC-FZ"
              width={1000}
              height={497}
              priority
              className="h-11 w-auto max-w-[min(42vw,160px)] object-contain sm:h-[58px] sm:max-w-[210px] lg:h-[76px] lg:max-w-[290px]"
            />
          </Link>

          <form onSubmit={handleSearch} className="mx-auto hidden max-w-xl flex-1 md:block">
            <div className="relative flex h-12 items-center overflow-hidden rounded-full border border-border bg-secondary/45 shadow-inner">
              <Search className="absolute left-4 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search OEM, part number, chassis, make or model"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-full rounded-full border-0 bg-transparent pl-11 pr-32 focus-visible:ring-0 focus-visible:ring-offset-0"
                aria-label="Search catalog"
              />
              <Button type="submit" variant="accent" size="sm" className="absolute right-1.5 h-9 rounded-full px-5">
                Search
              </Button>
            </div>
          </form>

          <div className="ml-auto hidden items-center gap-3 xl:flex">
            <a href={`tel:${siteConfig.phone}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1 text-sm">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/10 text-accent"><Phone className="h-4 w-4" /></span>
              <span><span className="block text-[10px] uppercase tracking-wider text-muted-foreground">WhatsApp support</span><strong className="font-semibold">{siteConfig.whatsappDisplay}</strong></span>
            </a>
            <ThemeToggle />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0 xl:hidden">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-controls="mobile-site-menu" aria-label={mobileOpen ? 'Close menu' : 'Open menu'}>
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        <div className="hidden border-t border-border/70 lg:block">
          <div className="container-page flex h-12 items-center gap-2 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href="/categories" className="mr-3 flex h-full shrink-0 items-center gap-2 border-r border-border pr-5 text-sm font-bold">
              <PackageSearch className="h-4 w-4 text-accent" />Browse categories
            </Link>
            <nav className="flex h-full min-w-0 flex-1 items-center gap-1">
              {navLinks.map((link) => {
                const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                if (link.href === '/vehicles') return (
                  <div key={link.href} className="group relative flex h-full shrink-0 items-center">
                    <Link href="/vehicles" className={cn('relative flex h-full items-center gap-1 px-3 text-sm font-semibold transition-colors', active ? 'text-accent' : 'text-muted-foreground hover:text-foreground')}>
                      {link.label}<ChevronDown className="h-3.5 w-3.5" />
                      {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
                    </Link>
                    <div className="invisible absolute left-0 top-full z-50 w-52 translate-y-2 rounded-xl border border-border bg-background p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                      <Link href="/vehicles" className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-secondary">All vehicle stock</Link>
                      {STOCK_ORIGINS.map((origin) => <a key={origin.value} href={`/vehicles?stock=${origin.value}`} className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">{origin.label}</a>)}
                    </div>
                  </div>
                );
                return (
                  <Link key={link.href} href={link.href} className={cn(
                    'relative flex h-full shrink-0 items-center px-3 text-sm font-semibold transition-colors',
                    active ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                  )}>
                    {link.label}
                    {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
                  </Link>
                );
              })}
            </nav>
            <Button asChild variant="accent" size="sm" className="ml-auto shrink-0 rounded-full px-5">
              <Link href="/contact">Request a quote</Link>
            </Button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <>
          <button className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu overlay" />
          <div
            id="mobile-site-menu"
            className="fixed inset-x-0 top-[64px] z-50 max-h-[calc(100dvh-64px-4rem)] w-full max-w-[100vw] overflow-x-hidden overflow-y-auto overscroll-contain border-b border-border bg-background shadow-2xl sm:top-[76px] sm:max-h-[calc(100dvh-76px-4rem)] lg:hidden"
          >
            <div className="container-page space-y-5 py-5 pb-8">
              <form onSubmit={handleSearch} className="md:hidden">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="search" placeholder="OEM, part number, chassis..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-12 rounded-xl bg-secondary/50 pl-10" />
                </div>
              </form>
              <nav className="grid gap-1">
                {navLinks.map((link) => {
                  const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                  return (
                    <Link key={link.href} href={link.href} className={cn(
                      'flex min-h-12 items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold',
                      active ? 'bg-accent text-white' : 'text-foreground hover:bg-secondary'
                    )}>
                      {link.label}<ChevronRight className="h-4 w-4 opacity-50" />
                    </Link>
                  );
                })}
                <div className="rounded-xl border border-border p-2">
                  <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vehicle stock locations</p>
                  <div className="grid grid-cols-2 gap-1">{STOCK_ORIGINS.map((origin) => <a key={origin.value} href={`/vehicles?stock=${origin.value}`} className="rounded-lg px-2 py-2 text-xs font-semibold hover:bg-secondary">{origin.label}</a>)}</div>
                </div>
              </nav>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="accent"><Link href="/parts">Find parts</Link></Button>
                <Button asChild variant="outline"><Link href="/contact">Get a quote</Link></Button>
              </div>
              <div className="space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                <a href={`tel:${siteConfig.phone}`} className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-accent" />{siteConfig.phone}</a>
                <a href={`mailto:${siteConfig.email}`} className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-accent" />{siteConfig.email}</a>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

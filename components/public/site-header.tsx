'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Headphones,
  Heart,
  Mail,
  Menu,
  PackageSearch,
  Phone,
  Search,
  ShieldCheck,
  ShoppingBag,
  Tag,
  User,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { siteConfig } from '@/lib/site-config';
import { ThemeToggle } from '@/components/theme-toggle';
import { STOCK_ORIGINS } from '@/lib/stock';
import { useCustomerLists } from '@/hooks/use-customer-lists';
import { HeaderMarketStrip } from '@/components/public/header-market-strip';
import { InstallAppButton } from '@/components/pwa/install-prompt';
import { LanguageSwitcher } from '@/components/accessibility/language-switcher';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/parts', label: 'Parts' },
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/machinery', label: 'Machinery' },
  { href: '/offers', label: 'Deals' },
  { href: '/categories', label: 'Categories' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Insights' },
  { href: '/contact', label: 'Contact' },
  { href: '/download', label: 'Download app' },
];

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-black text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { cartCount, favoritesCount } = useCustomerLists();
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
    // Lock page scroll when drawer is open without clearing overflow-x: clip.
    const html = document.documentElement;
    if (mobileOpen) {
      html.style.overflowY = 'hidden';
      document.body.style.overflowY = 'hidden';
    } else {
      html.style.overflowY = '';
      document.body.style.overflowY = '';
    }
    return () => {
      html.style.overflowY = '';
      document.body.style.overflowY = '';
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
    <header className="sticky top-0 z-50 w-full min-w-0 max-w-full overflow-x-clip">
      <div className="hidden bg-[#101114] text-white lg:block">
        <div className="container-page flex h-9 min-w-0 items-center justify-between text-[11px]">
          <p className="flex items-center gap-2 font-semibold uppercase tracking-[0.14em] text-white/65">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Dubai-based global automotive exporter
          </p>
          <div className="flex items-center gap-5 text-white/65">
            <span className="hidden items-center gap-1.5 xl:flex"><ShieldCheck className="h-3.5 w-3.5 text-accent" />Verified inventory</span>
            <span className="hidden items-center gap-1.5 xl:flex"><Headphones className="h-3.5 w-3.5 text-accent" />Export support</span>
          </div>
        </div>
      </div>

      <div className={cn(
        'min-w-0 max-w-full overflow-x-clip border-b border-white/60 bg-[hsl(210_25%_98%/0.94)] transition-shadow backdrop-blur-xl dark:border-white/10 dark:bg-background/95',
        scrolled && 'shadow-[0_8px_28px_rgba(15,23,42,0.08)]'
      )}>
        <div className="container-page flex h-[68px] min-w-0 items-center gap-2 sm:h-[78px] sm:gap-4 lg:h-[84px]">
          <Link href="/" className="flex min-w-0 shrink-0 items-center rounded-2xl transition active:scale-[0.98]" aria-label="Ansha Trading home">
            <Image
              src="/images/ansha-logo-transparent.webp"
              alt="Ansha Trading Co. LLC-FZ"
              width={300}
              height={169}
              priority
              sizes="(max-width: 640px) 190px, (max-width: 1024px) 240px, 300px"
              className="h-11 w-auto max-w-[min(50vw,190px)] object-contain object-left sm:h-[58px] sm:max-w-[240px] lg:h-[70px] lg:max-w-[300px]"
            />
          </Link>

          <form onSubmit={handleSearch} className="mx-auto hidden max-w-xl flex-1 md:block">
            <div className="relative flex h-11 items-center overflow-hidden rounded-xl border border-border bg-white shadow-sm dark:bg-card lg:h-12">
              <Search className="absolute left-4 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search OEM, part number, chassis, make or model"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-full rounded-xl border-0 bg-transparent pl-11 pr-32 focus-visible:ring-0 focus-visible:ring-offset-0"
                aria-label="Search catalog"
              />
              <Button type="submit" variant="accent" size="sm" className="absolute right-1.5 h-9 rounded-lg px-5">
                Search
              </Button>
            </div>
          </form>

          <div className="ml-auto hidden items-center gap-2 xl:flex">
            <InstallAppButton className="rounded-full" label="Install app" />
            <Link href="/favorites" className="relative grid h-10 w-10 place-items-center rounded-full border border-border text-foreground transition hover:border-accent hover:text-accent" aria-label={`Favorites${favoritesCount ? `, ${favoritesCount} saved` : ''}`}>
              <Heart className={cn('h-[18px] w-[18px]', favoritesCount > 0 && 'fill-accent text-accent')} />
              <CountBadge count={favoritesCount} />
            </Link>
            <Link href="/cart" className="relative grid h-10 w-10 place-items-center rounded-full border border-border text-foreground transition hover:border-accent hover:text-accent" aria-label={`Inquiry cart${cartCount ? `, ${cartCount} items` : ''}`}>
              <ShoppingBag className="h-[18px] w-[18px]" />
              <CountBadge count={cartCount} />
            </Link>
            <a
              href={`https://wa.me/${siteConfig.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-xl px-2 py-1 text-sm transition hover:bg-[#25D366]/10"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_6px_16px_rgba(37,211,102,0.28)]"><Phone className="h-4 w-4" /></span>
              <span><span className="block text-[10px] uppercase tracking-wider text-muted-foreground">WhatsApp support</span><strong className="font-semibold">{siteConfig.whatsappDisplay}</strong></span>
            </a>
            <LanguageSwitcher />
            <ThemeToggle />
            <Button asChild variant="accent" size="sm" className="h-10 rounded-full px-4 shadow-[0_8px_22px_rgba(210,30,30,0.22)]">
              <Link href="/portal"><User className="h-4 w-4" />Customer Account</Link>
            </Button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0 xl:hidden">
            <LanguageSwitcher compact className="hidden md:inline-flex" />
            <Button asChild variant="accent" size="sm" className="hidden h-10 w-10 rounded-xl px-0 shadow-[0_8px_20px_rgba(210,30,30,0.22)] md:inline-flex sm:h-11 sm:w-11 lg:w-auto lg:px-3" title="Customer Account">
              <Link href="/portal" aria-label="Customer Account"><User className="h-4 w-4" /><span className="hidden lg:inline">Customer Account</span></Link>
            </Button>
            <Link href="/favorites" className="relative grid h-10 w-10 place-items-center rounded-xl border border-rose-500/10 bg-rose-500/10 text-rose-600 shadow-sm transition active:scale-95 sm:h-11 sm:w-11" aria-label={`Favorites${favoritesCount ? `, ${favoritesCount} saved` : ''}`}>
              <Heart className={cn('h-5 w-5', favoritesCount > 0 && 'fill-accent text-accent')} />
              <CountBadge count={favoritesCount} />
            </Link>
            <Link href="/cart" className="relative grid h-10 w-10 place-items-center rounded-xl border border-amber-500/10 bg-amber-500/10 text-amber-700 shadow-sm transition active:scale-95 sm:h-11 sm:w-11" aria-label={`Inquiry cart${cartCount ? `, ${cartCount} items` : ''}`}>
              <ShoppingBag className="h-5 w-5" />
              <CountBadge count={cartCount} />
            </Link>
            <ThemeToggle className="hidden h-10 w-10 rounded-xl border border-border/60 bg-card/70 sm:grid sm:h-11 sm:w-11" />
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl border border-accent/15 bg-accent/10 text-accent shadow-sm md:hidden sm:h-11 sm:w-11" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-controls="mobile-site-menu" aria-label={mobileOpen ? 'Close menu' : 'Open menu'}>
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        <HeaderMarketStrip />

        <div className="hidden border-t border-border/70 bg-white/95 dark:bg-card/95 md:block">
          <div className="container-page flex h-11 items-center gap-1.5 overflow-x-auto overscroll-x-contain touch-pan-x lg:h-12 lg:gap-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href="/categories" className="-ml-2 flex h-[calc(100%_-_8px)] shrink-0 items-center gap-2 rounded-lg bg-[#101114] px-3 text-sm font-bold text-white lg:px-5">
              <PackageSearch className="h-4 w-4 text-red-400" />
              <span className="hidden lg:inline">Browse categories</span>
              <span className="lg:hidden">Categories</span>
            </Link>
            <Link
              href="/offers"
              className={cn(
                'flex h-full shrink-0 items-center gap-1.5 border-r border-border/80 px-3 text-sm font-bold lg:px-4',
                pathname.startsWith('/offers') ? 'text-accent' : 'text-foreground hover:text-accent'
              )}
            >
              <Tag className="h-4 w-4 text-accent" />
              Deals
            </Link>
            <nav className="flex h-full min-w-0 flex-1 items-center gap-0.5 lg:gap-1" aria-label="Primary">
              {navLinks.filter((link) => link.href !== '/offers').map((link) => {
                const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                if (link.href === '/vehicles') return (
                  <div key={link.href} className="group relative flex h-full shrink-0 items-center">
                    <Link href="/vehicles" className={cn('relative flex h-full items-center gap-1 px-2.5 text-[13px] font-semibold transition-colors lg:px-3 lg:text-sm', active ? 'text-accent' : 'text-muted-foreground hover:text-foreground')}>
                      {link.label}<ChevronDown className="h-3.5 w-3.5" />
                      {active && <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-accent lg:inset-x-3" />}
                    </Link>
                    <div className="invisible absolute left-0 top-full z-50 w-52 translate-y-2 rounded-xl border border-border bg-background p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                      <Link href="/vehicles" className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-secondary">All vehicle stock</Link>
                      <Link href="/machinery" className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-secondary">Heavy machinery &amp; trucks</Link>
                      {STOCK_ORIGINS.map((origin) => <a key={origin.value} href={`/vehicles?stock=${origin.value}`} className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">{origin.label}</a>)}
                    </div>
                  </div>
                );
                return (
                  <Link key={link.href} href={link.href} className={cn(
                    'relative flex h-full shrink-0 items-center px-2.5 text-[13px] font-semibold transition-colors lg:px-3 lg:text-sm',
                    active ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                  )}>
                    {link.label}
                    {active && <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-accent lg:inset-x-3" />}
                  </Link>
                );
              })}
            </nav>
            <Button asChild variant="accent" size="sm" className="ml-1 shrink-0 rounded-lg px-3.5 lg:ml-3 lg:px-5">
              <Link href="/contact"><span className="lg:hidden">Quote</span><span className="hidden lg:inline">Request a quote</span></Link>
            </Button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <>
          <button className="fixed inset-0 z-[58] bg-[#0b0c0f]/55 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu overlay" />
          <div
            id="mobile-site-menu"
            className="mobile-drawer-glass fixed left-2 right-2 top-[calc(4.25rem+2.25rem+0.4rem)] z-[60] max-h-[calc(100dvh-4.25rem-2.25rem-5rem-env(safe-area-inset-bottom,0px))] overflow-x-clip overflow-y-auto overscroll-contain rounded-[1.5rem] border border-white/60 shadow-[0_24px_70px_rgba(15,23,42,0.28)] sm:left-4 sm:right-4 sm:top-[calc(4.875rem+2.25rem+0.5rem)] sm:max-h-[calc(100dvh-4.875rem-2.25rem-5rem-env(safe-area-inset-bottom,0px))] md:hidden"
          >
            <div className="space-y-4 p-4 pb-6 sm:p-5">
              <div className="flex items-center justify-between rounded-2xl bg-[#101114] px-4 py-3 text-white">
                <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">Explore ANSHA</p><p className="mt-0.5 text-sm font-bold">Stock, parts &amp; export support</p></div>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10"><PackageSearch className="h-4 w-4 text-red-400" /></span>
              </div>
              <form onSubmit={handleSearch} className="md:hidden">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="search" placeholder="OEM, part number, chassis..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-12 rounded-2xl border-accent/15 bg-white/80 pl-10 pr-20 shadow-sm dark:bg-card/80" />
                  <Button type="submit" size="sm" variant="accent" className="absolute right-1.5 top-1.5 h-9 rounded-xl px-3">Go</Button>
                </div>
              </form>
              <nav className="grid grid-cols-2 gap-2">
                <Link
                  href="/offers"
                  className={cn(
                    'col-span-2 flex min-h-12 items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold shadow-sm',
                    pathname.startsWith('/offers') ? 'bg-accent text-white' : 'bg-accent/10 text-accent hover:bg-accent/15'
                  )}
                >
                  <span className="inline-flex items-center gap-2"><Tag className="h-4 w-4" />Deals &amp; offers</span>
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </Link>
                {navLinks.filter((link) => link.href !== '/offers').map((link) => {
                  const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                  return (
                    <Link key={link.href} href={link.href} className={cn(
                      'flex min-h-12 items-center justify-between rounded-2xl border px-3 py-3 text-sm font-semibold transition active:scale-[0.98]',
                      active ? 'border-accent bg-accent text-white shadow-md shadow-accent/20' : 'border-white/65 bg-white/65 text-foreground shadow-sm hover:bg-white dark:border-white/10 dark:bg-white/5'
                    )}>
                      {link.label}<ChevronRight className="h-4 w-4 opacity-50" />
                    </Link>
                  );
                })}
                <div className="col-span-2 rounded-2xl border border-white/65 bg-white/55 p-2.5 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vehicle stock locations</p>
                  <div className="grid grid-cols-2 gap-1">{STOCK_ORIGINS.map((origin) => <a key={origin.value} href={`/vehicles?stock=${origin.value}`} className="flex min-h-11 items-center rounded-xl px-2 py-2.5 text-xs font-semibold hover:bg-secondary">{origin.label}</a>)}</div>
                </div>
              </nav>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="accent" className="h-12"><Link href="/parts">Find parts</Link></Button>
                <Button asChild variant="outline" className="h-12"><Link href="/contact">Get a quote</Link></Button>
              </div>
              <InstallAppButton className="h-12 w-full justify-center rounded-xl" size="default" label="Download / Install app" />
              <LanguageSwitcher className="h-12 w-full justify-center rounded-xl" />
              <div className="space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
                <a href={`tel:${siteConfig.phone}`} className="flex min-h-11 items-center gap-2"><Phone className="h-4 w-4 text-accent" />{siteConfig.phone}</a>
                <a href={`mailto:${siteConfig.email}`} className="flex min-h-11 items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0 text-accent" />{siteConfig.email}</a>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

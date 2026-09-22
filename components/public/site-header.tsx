'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ChevronRight,
  Heart,
  Mail,
  Menu,
  MessageCircle,
  Phone,
  Search,
  ShoppingBag,
  Tag,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { siteConfig } from '@/lib/site-config';
import { STOCK_ORIGINS } from '@/lib/stock';
import { useCustomerLists } from '@/hooks/use-customer-lists';
import { HeaderMarketStrip } from '@/components/public/header-market-strip';
import { InstallAppButton } from '@/components/pwa/install-prompt';

/** Primary nav — About + Insights live in the footer per design system. */
const navLinks = [
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/machinery', label: 'Machinery' },
  { href: '/parts', label: 'Parts' },
  { href: '/#export-markets', label: 'Markets' },
  { href: '/offers', label: 'Deals', accent: true },
  { href: '/contact', label: 'Contact' },
];

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#d21e1e] px-1 text-[9px] font-black text-white">
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
    router.push(`/vehicles?q=${encodeURIComponent(query)}`);
  };

  const isActive = (href: string) => {
    if (href.startsWith('/#')) return false;
    return pathname === href || (href !== '/' && pathname.startsWith(href));
  };

  return (
    <header className="sticky top-0 z-50 w-full min-w-0 max-w-full overflow-x-clip">
      {/* Light frosted glass — dark wordmark needs pale ground, never dark glass */}
      <div
        className={cn(
          'glass-header min-w-0 max-w-full overflow-x-clip transition-[background,box-shadow]',
          scrolled && 'is-scrolled'
        )}
      >
        <div className="container-page flex h-[4.25rem] min-w-0 items-center gap-3 sm:h-[5.5rem] sm:gap-4 lg:h-[6.25rem]">
          <Link href="/" className="flex min-w-0 shrink-0 items-center" aria-label="ANSHA Trading home">
            <Image
              src="/images/ansha-logo-transparent.webp"
              alt="ANSHA Trading Co. LLC-FZ"
              width={320}
              height={158}
              priority
              sizes="(max-width: 640px) 200px, (max-width: 1024px) 260px, 300px"
              className="h-12 w-auto max-w-[min(52vw,200px)] object-contain object-left sm:h-[3.75rem] sm:max-w-[260px] lg:h-[4.5rem] lg:max-w-[300px]"
            />
          </Link>

          <nav className="ml-1 hidden items-center gap-1.5 lg:flex xl:ml-2 xl:gap-2" aria-label="Primary">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors xl:h-10 xl:px-4 xl:text-sm',
                    active
                      ? 'border-[#d21e1e] bg-[#d21e1e] text-white shadow-[0_6px_16px_-8px_rgba(210,30,30,0.55)]'
                      : link.accent
                        ? 'border-[#f0d0d0]/80 bg-[rgba(248,234,234,0.72)] text-[#c35252] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md hover:border-[#d21e1e]/40 hover:bg-[#f3dede]'
                        : 'glass-pill text-[#171415] hover:border-white/70 hover:bg-white/70'
                  )}
                >
                  {link.accent ? <Tag className="h-3.5 w-3.5 shrink-0" /> : null}
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <form onSubmit={handleSearch} className="ml-auto hidden max-w-xs flex-1 md:block lg:max-w-[13.5rem] xl:max-w-xs">
            <div className="glass-pill relative flex h-9 items-center rounded-full xl:h-10">
              <Search className="pointer-events-none absolute left-3.5 h-4 w-4 shrink-0 text-[#828789]" aria-hidden />
              <Input
                type="search"
                placeholder="Search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-full min-w-0 rounded-full border-0 bg-transparent py-0 pl-10 pr-4 text-sm font-medium leading-none text-[#171415] placeholder:text-[#828789] focus-visible:ring-0 focus-visible:ring-offset-0"
                aria-label="Search catalog"
              />
            </div>
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:ml-2">
            <InstallAppButton className="hidden rounded-full xl:inline-flex" label="Install" />
            <Link
              href="/favorites"
              className="relative grid h-10 w-10 place-items-center rounded-full text-[#171415] transition hover:text-[#d21e1e]"
              aria-label={`Favorites${favoritesCount ? `, ${favoritesCount} saved` : ''}`}
            >
              <Heart className={cn('h-[18px] w-[18px]', favoritesCount > 0 && 'fill-[#d21e1e] text-[#d21e1e]')} />
              <CountBadge count={favoritesCount} />
            </Link>
            <Link
              href="/cart"
              className="relative hidden h-10 w-10 place-items-center rounded-full text-[#171415] transition hover:text-[#d21e1e] sm:grid"
              aria-label={`Inquiry cart${cartCount ? `, ${cartCount} items` : ''}`}
            >
              <ShoppingBag className="h-[18px] w-[18px]" />
              <CountBadge count={cartCount} />
            </Link>
            <a
              href={`https://wa.me/${siteConfig.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-2 px-1 text-sm font-bold text-[#171415] transition hover:text-[#128C7E] lg:flex"
            >
              <Phone className="h-4 w-4 text-[#128C7E]" />
              <span className="hidden xl:inline">{siteConfig.whatsappDisplay}</span>
            </a>
            <Button
              asChild
              className="hidden h-10 rounded-full bg-[#d21e1e] px-4 text-xs font-bold uppercase tracking-widest text-white shadow-[0_8px_20px_-8px_rgba(210,30,30,0.45)] hover:bg-[#c35252] sm:inline-flex"
            >
              <Link href="/contact">Inquire</Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-[#171415] lg:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-site-menu"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        <HeaderMarketStrip />
      </div>

      {mobileOpen && (
        <>
          <button
            className="fixed inset-0 z-[58] bg-black/45 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu overlay"
          />
          <div
            id="mobile-site-menu"
            className="glass-panel fixed left-0 right-0 top-[4.25rem] z-[60] max-h-[calc(100dvh-4.25rem-4rem-env(safe-area-inset-bottom,0px))] w-full max-w-full overflow-x-clip overflow-y-auto overscroll-contain rounded-none border-x-0 shadow-2xl sm:top-[5.5rem] sm:max-h-[calc(100dvh-5.5rem-4rem-env(safe-area-inset-bottom,0px))] lg:hidden"
          >
            <div className="container-page space-y-5 py-5 pb-8">
              <form onSubmit={handleSearch}>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#828789]" />
                  <Input
                    type="search"
                    placeholder="OEM, chassis, make or model..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="glass-pill h-12 rounded-xl border-white/50 bg-white/60 pl-10"
                  />
                </div>
              </form>
              <nav className="grid gap-1.5">
                {navLinks.map((link) => {
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        'flex min-h-12 items-center justify-between rounded-full border px-4 py-3 text-sm font-semibold',
                        active
                          ? 'border-[#d21e1e] bg-[#d21e1e] text-white'
                          : link.accent
                            ? 'border-[#f0d0d0]/80 bg-[rgba(248,234,234,0.72)] text-[#c35252] backdrop-blur-md'
                            : 'glass-pill text-[#171415] hover:bg-white/70'
                      )}
                    >
                      <span className="inline-flex items-center gap-2">
                        {link.accent ? <Tag className="h-4 w-4" /> : null}
                        {link.label}
                      </span>
                      <ChevronRight className="h-4 w-4 opacity-50" />
                    </Link>
                  );
                })}
                <div className="glass-panel rounded-xl p-2">
                  <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#828789]">
                    Vehicle stock locations
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {STOCK_ORIGINS.map((origin) => (
                      <a
                        key={origin.value}
                        href={`/vehicles?stock=${origin.value}`}
                        className="flex min-h-11 items-center rounded-lg px-2 py-2.5 text-xs font-semibold hover:bg-[#d8dee6]"
                      >
                        {origin.label}
                      </a>
                    ))}
                  </div>
                </div>
              </nav>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild className="h-12 bg-[#d21e1e] text-white hover:bg-[#c35252]">
                  <Link href="/vehicles">Browse stock</Link>
                </Button>
                <Button asChild variant="outline" className="h-12 border-[#171415] text-[#171415]">
                  <Link href="/contact">Get a quote</Link>
                </Button>
              </div>
              <InstallAppButton className="h-12 w-full justify-center rounded-xl" size="default" label="Download / Install app" />
              <div className="space-y-1 border-t border-[#cdbfc1]/50 pt-4 text-sm text-[#5c6366]">
                <a href={`tel:${siteConfig.phone}`} className="flex min-h-11 items-center gap-2">
                  <Phone className="h-4 w-4 text-[#d21e1e]" />
                  {siteConfig.phone}
                </a>
                <a
                  href={`https://wa.me/${siteConfig.whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-2"
                >
                  <MessageCircle className="h-4 w-4 text-[#128C7E]" />
                  WhatsApp
                </a>
                <a href={`mailto:${siteConfig.email}`} className="flex min-h-11 items-center gap-2 break-all">
                  <Mail className="h-4 w-4 shrink-0 text-[#d21e1e]" />
                  {siteConfig.email}
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

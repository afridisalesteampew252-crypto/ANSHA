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
      {/* Light header always — dark wordmark requires paper/frost ground */}
      <div
        className={cn(
          'min-w-0 max-w-full overflow-x-clip border-b border-[#cdbfc1]/40 bg-[#f7f8fa] transition-shadow',
          scrolled && 'shadow-[0_8px_28px_rgba(23,20,21,0.08)]'
        )}
      >
        <div className="container-page flex h-16 min-w-0 items-center gap-3 sm:h-20 sm:gap-4 lg:h-[5.25rem]">
          <Link href="/" className="flex min-w-0 shrink-0 items-center" aria-label="ANSHA Trading home">
            <Image
              src="/images/ansha-logo-transparent.webp"
              alt="ANSHA Trading Co. LLC-FZ"
              width={280}
              height={139}
              priority
              sizes="(max-width: 640px) 160px, (max-width: 1024px) 200px, 240px"
              className="h-10 w-auto max-w-[min(48vw,160px)] object-contain object-left sm:h-12 sm:max-w-[200px] lg:h-14 lg:max-w-[240px]"
            />
          </Link>

          <nav className="ml-2 hidden h-full items-center gap-1 lg:flex xl:gap-2" aria-label="Primary">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'relative flex h-full items-center px-2.5 text-sm font-semibold transition-colors xl:px-3',
                    link.accent && !active && 'text-[#c35252]',
                    active ? 'text-[#d21e1e]' : 'text-[#171415] hover:text-[#d21e1e]'
                  )}
                >
                  {link.accent ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5" />
                      {link.label}
                    </span>
                  ) : (
                    link.label
                  )}
                  {active && (
                    <span className="absolute inset-x-2.5 bottom-2 h-0.5 rounded-full bg-[#d21e1e] xl:inset-x-3" />
                  )}
                </Link>
              );
            })}
          </nav>

          <form onSubmit={handleSearch} className="ml-auto hidden max-w-xs flex-1 md:block lg:max-w-[14rem] xl:max-w-xs">
            <div className="relative flex h-10 items-center overflow-hidden rounded-full border border-[#cdbfc1] bg-white">
              <Search className="absolute left-3 h-4 w-4 text-[#828789]" />
              <Input
                type="search"
                placeholder="Search stock or OEM"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-full rounded-full border-0 bg-transparent pl-9 pr-3 text-sm text-[#171415] placeholder:text-[#828789] focus-visible:ring-0 focus-visible:ring-offset-0"
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
            className="fixed left-0 right-0 top-16 z-[60] max-h-[calc(100dvh-4rem-4rem-env(safe-area-inset-bottom,0px))] w-full max-w-full overflow-x-clip overflow-y-auto overscroll-contain border-b border-[#cdbfc1]/50 bg-[#f7f8fa] shadow-2xl sm:top-20 sm:max-h-[calc(100dvh-5rem-4rem-env(safe-area-inset-bottom,0px))] lg:hidden"
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
                    className="h-12 rounded-xl border-[#cdbfc1] bg-white pl-10"
                  />
                </div>
              </form>
              <nav className="grid gap-1">
                {navLinks.map((link) => {
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        'flex min-h-12 items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold',
                        active ? 'bg-[#d21e1e] text-white' : 'text-[#171415] hover:bg-[#d8dee6]'
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
                <div className="rounded-xl border border-[#cdbfc1]/60 bg-white p-2">
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

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Menu, X, Search, Phone, Mail, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { siteConfig } from '@/lib/site-config';
import { ThemeToggle } from '@/components/theme-toggle';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/parts', label: 'Parts Catalog' },
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/categories', label: 'Categories' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/parts?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Top utility bar */}
      <div className="hidden bg-foreground text-background md:block">
        <div className="container-page flex h-9 items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="text-background/70 font-medium tracking-wide">{siteConfig.tagline}</span>
          </div>
          <div className="flex items-center gap-5">
            <a href={`tel:${siteConfig.phone}`} className="flex items-center gap-1.5 text-background/60 transition-colors hover:text-background">
              <Phone className="h-3 w-3" />
              {siteConfig.phone}
            </a>
            <a href={`mailto:${siteConfig.email}`} className="flex items-center gap-1.5 text-background/60 transition-colors hover:text-background">
              <Mail className="h-3 w-3" />
              {siteConfig.email}
            </a>
          </div>
        </div>
      </div>

      {/* Main bar */}
      <div
        className={cn(
          'border-b transition-all duration-200',
          scrolled
            ? 'border-border bg-background/95 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/90'
            : 'border-border/60 bg-background/80 backdrop-blur-sm'
        )}
      >
        <div className="container-page">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo */}
            <Link href="/" className="group flex shrink-0 items-center" aria-label="Ansha Trading Co. - Parts & Accessories home">
              <Image
                src="/images/ansha-trading-logo.jpg"
                alt="Ansha Trading Co. - Parts & Accessories"
                width={320}
                height={159}
                priority
                className="h-12 w-auto max-w-[180px] object-contain sm:max-w-[220px] md:h-14"
              />
            </Link>

            {/* Desktop search */}
            <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search parts, OEM numbers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-secondary/60 border-transparent focus:border-border h-9 text-sm"
                />
              </div>
            </form>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-0.5">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'relative px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {link.label}
                    {isActive && (
                      <span className="absolute -bottom-[1px] left-3 right-3 h-0.5 bg-accent rounded-full" />
                    )}
                  </Link>
                );
              })}
              <Link href="/parts" className="ml-2">
                <Button variant="accent" size="sm" className="h-9">
                  Find Parts
                </Button>
              </Link>
              <ThemeToggle className="ml-1" />
            </nav>

            {/* Mobile toggle */}
            <div className="flex items-center md:hidden">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 top-[60px] z-40 bg-foreground/20 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="border-b border-border bg-background shadow-lg animate-slide-down md:hidden">
            <div className="container-page py-4 space-y-3">
              <form onSubmit={handleSearch}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search parts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </form>
              <nav className="flex flex-col gap-0.5">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'text-foreground bg-secondary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                      )}
                    >
                      {link.label}
                      <ChevronRight className="h-4 w-4 opacity-40" />
                    </Link>
                  );
                })}
              </nav>
              <Link href="/parts" onClick={() => setMobileOpen(false)}>
                <Button variant="accent" className="w-full">
                  Find Parts
                </Button>
              </Link>
              <div className="flex items-center justify-center gap-4 pt-2 text-xs text-muted-foreground">
                <a href={`tel:${siteConfig.phone}`} className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3" />
                  {siteConfig.phone}
                </a>
                <a href={`mailto:${siteConfig.email}`} className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3" />
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

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronRight, Mail, Menu, Phone, Search, X } from 'lucide-react';
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
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      setMobileOpen(false);
      router.push(`/parts?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="hidden bg-foreground text-background lg:block">
        <div className="container-page flex h-9 items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="font-medium tracking-wide text-background/70">{siteConfig.tagline}</span>
          </div>
          <div className="flex items-center gap-5">
            <a href={`tel:${siteConfig.phone}`} className="flex items-center gap-1.5 text-background/70 hover:text-background"><Phone className="h-3 w-3" />{siteConfig.phone}</a>
            <a href={`mailto:${siteConfig.email}`} className="flex items-center gap-1.5 text-background/70 hover:text-background"><Mail className="h-3 w-3" />{siteConfig.email}</a>
          </div>
        </div>
      </div>

      <div className={cn('border-b transition-all duration-200', scrolled ? 'border-border bg-background/95 shadow-sm backdrop-blur-md' : 'border-border/60 bg-background/90 backdrop-blur-sm')}>
        <div className="container-page">
          <div className="flex h-20 min-w-0 items-center justify-between gap-3 lg:h-24 lg:gap-5">
            <Link href="/" className="flex min-w-0 shrink items-center" aria-label="Ansha Trading home">
              <Image
                src="/images/ansha-logo-transparent.webp"
                alt="Ansha Trading Co. LLC-FZ"
                width={1000}
                height={497}
                priority
                className="h-16 w-auto max-w-[235px] object-contain sm:h-[4.5rem] sm:max-w-[290px] lg:h-20 lg:max-w-[320px]"
              />
            </Link>

            <form onSubmit={handleSearch} className="hidden min-w-[210px] max-w-sm flex-1 xl:flex">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="search" placeholder="Search parts, OEM numbers..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 border-transparent bg-secondary/60 pl-10 focus:border-border" />
              </div>
            </form>

            <nav className="hidden shrink-0 items-center gap-0.5 lg:flex">
              {navLinks.map((link) => {
                const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                return <Link key={link.href} href={link.href} className={cn('relative px-2.5 py-2 text-sm font-medium transition-colors xl:px-3', active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {link.label}
                  {active && <span className="absolute -bottom-1 left-3 right-3 h-0.5 rounded-full bg-accent" />}
                </Link>;
              })}
              <Button asChild variant="accent" size="sm" className="ml-2 h-9"><Link href="/parts">Find Parts</Link></Button>
              <ThemeToggle className="ml-1" />
            </nav>

            <div className="flex shrink-0 items-center lg:hidden">
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-controls="mobile-site-menu" aria-label={mobileOpen ? 'Close menu' : 'Open menu'}>
                {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {mobileOpen && <>
        <button className="fixed inset-0 top-20 z-40 bg-black/35 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu overlay" />
        <div id="mobile-site-menu" className="absolute left-0 right-0 z-50 max-h-[calc(100vh-5rem)] overflow-y-auto border-b border-border bg-background shadow-xl lg:hidden">
          <div className="container-page space-y-4 py-5">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="search" placeholder="Search parts or OEM numbers" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-11 pl-10" />
              </div>
            </form>
            <nav className="grid gap-1 sm:grid-cols-2">
              {navLinks.map((link) => {
                const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                return <Link key={link.href} href={link.href} className={cn('flex min-h-11 items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium', active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground')}>
                  {link.label}<ChevronRight className="h-4 w-4 opacity-40" />
                </Link>;
              })}
            </nav>
            <Button asChild variant="accent" className="w-full"><Link href="/parts">Find Parts</Link></Button>
            <div className="grid gap-2 border-t pt-4 text-xs text-muted-foreground sm:grid-cols-2">
              <a href={`tel:${siteConfig.phone}`} className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{siteConfig.phone}</a>
              <a href={`mailto:${siteConfig.email}`} className="flex items-center gap-2 sm:justify-end"><Mail className="h-3.5 w-3.5" />{siteConfig.email}</a>
            </div>
          </div>
        </div>
      </>}
    </header>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Home, Send, Banknote, BookmarkCheck, FileText, LogOut, MessageCircle, MoreHorizontal, PackageSearch, ReceiptText, Settings, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileBottomNav } from '@/components/public/mobile-bottom-nav';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import { LanguageSwitcher } from '@/components/accessibility/language-switcher';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PortalSupportNotificationBell } from '@/components/support/portal-support-notification-bell';

const nav = [
  { href: '/portal/home', label: 'Home', icon: Home },
  { href: '/portal/catalog', label: 'Stock', icon: PackageSearch },
  { href: '/portal/reservations', label: 'Reserved', icon: BookmarkCheck },
  { href: '/portal/invoices', label: 'Invoices', icon: ReceiptText },
  { href: '/portal/payments', label: 'TT copy', icon: Banknote },
  { href: '/portal/profile', label: 'Account', icon: UserRound },
  { href: '/portal/support', label: 'Support', icon: MessageCircle },
  { href: '/portal/inquiries', label: 'Inquiries', icon: Send },
  { href: '/portal/settings', label: 'Settings', icon: Settings },
] as const;

const primaryNav = nav.filter(({ href }) =>
  ['/portal/home', '/portal/catalog', '/portal/reservations', '/portal/invoices', '/portal/profile', '/portal/support'].includes(href)
);
const moreNav = nav.filter(({ href }) =>
  ['/portal/payments', '/portal/inquiries', '/portal/settings'].includes(href)
);

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState('Customer');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('customer_profiles')
        .select('full_name, email')
        .eq('id', session.user.id)
        .maybeSingle();
      if (data?.full_name || data?.email) setName(data.full_name || data.email || 'Customer');
    })();
  }, []);

  useEffect(() => {
    let active = true;
    const touch = async () => {
      if (!active || document.hidden) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.rpc('touch_customer_last_seen');
    };
    void touch();
    const timer = window.setInterval(() => void touch(), 45_000);
    const onVisible = () => { if (!document.hidden) void touch(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/portal');
  };

  return (
    <div className="min-h-screen bg-secondary/25">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-2 sm:h-[4.5rem] sm:gap-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              aria-label="Go back"
              title="Back"
              className="h-9 w-9 shrink-0 rounded-full border border-white/60 bg-background/70 shadow-sm backdrop-blur-xl dark:border-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Link href="/" className="flex min-w-0 items-center" aria-label="ANSHA home">
              <Image
                src="/images/ansha-logo-transparent.webp"
                alt="Ansha Trading Co. LLC-FZ"
                width={210}
                height={104}
                priority
                className="h-10 w-auto max-w-[112px] object-contain object-left sm:h-14 sm:max-w-[180px]"
              />
            </Link>
          </div>



          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <PortalSupportNotificationBell />
            <LanguageSwitcher compact className="h-9 w-[4.25rem] shrink-0 sm:w-auto" />
            <Button asChild variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full text-emerald-600 md:hidden" aria-label="Upload TT copy">
              <Link href="/portal/payments"><Banknote className="h-5 w-5" /></Link>
            </Button>
            <span className="hidden max-w-36 truncate text-sm text-muted-foreground xl:inline">{name}</span>
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 px-2 sm:px-3" onClick={() => void signOut()} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>

        <nav className="mx-auto hidden max-w-7xl items-center justify-center gap-1 overflow-hidden border-t border-border/60 px-3 py-2 md:flex" aria-label="Customer portal navigation">
          {primaryNav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium transition-colors xl:px-3 xl:text-sm',
                  active ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
          <Link
            href="/portal/account"
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium transition-colors xl:px-3 xl:text-sm',
              pathname.startsWith('/portal/account') ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <FileText className="h-4 w-4 shrink-0" />
            Statement
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 gap-1.5 px-2.5 text-xs xl:text-sm">
                <MoreHorizontal className="h-4 w-4" /> More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {moreNav.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem key={href} asChild>
                  <Link href={href} className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />{label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-5 pb-28 sm:px-5 sm:py-7 lg:pb-8">{children}</main>
      <MobileBottomNav />
    </div>
  );
}


'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, BookmarkCheck, FileText, LogOut, MessageCircle, PackageSearch, ReceiptText, Settings, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileBottomNav } from '@/components/public/mobile-bottom-nav';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';

const nav = [
  { href: '/portal/catalog', label: 'Stock', icon: PackageSearch },
  { href: '/portal/reservations', label: 'Reserved', icon: BookmarkCheck },
  { href: '/portal/invoices', label: 'Invoices', icon: ReceiptText },
  { href: '/portal/profile', label: 'Account', icon: UserRound },
  { href: '/portal/support', label: 'Support', icon: MessageCircle },
  { href: '/portal/settings', label: 'Settings', icon: Settings },
] as const;

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

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/portal');
  };

  return (
    <div className="min-h-screen bg-secondary/25">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-3 sm:h-20 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              aria-label="Go back"
              title="Back"
              className="h-10 w-10 shrink-0 rounded-full border border-white/60 bg-background/70 shadow-sm backdrop-blur-xl dark:border-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Link href="/" className="flex min-w-0 items-center" aria-label="ANSHA home">
              <Image
                src="/images/ansha-logo-transparent.webp"
                alt="Ansha Trading Co. LLC-FZ"
                width={210}
                height={104}
                priority
                className="h-12 w-auto max-w-[132px] object-contain object-left sm:h-16 sm:max-w-[210px]"
              />
            </Link>
          </div>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Customer portal navigation">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
            <Link
              href="/portal/account"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith('/portal/account') ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <FileText className="h-4 w-4" />
              Statement
            </Link>
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden max-w-36 truncate text-sm text-muted-foreground lg:inline">{name}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void signOut()} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-5 pb-28 sm:px-5 sm:py-7 lg:pb-8">{children}</main>
      <MobileBottomNav />
    </div>
  );
}


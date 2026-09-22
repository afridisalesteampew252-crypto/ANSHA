'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookmarkCheck, FileText, LogOut, PackageSearch, ReceiptText, Settings, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';

const nav = [
  { href: '/portal/catalog', label: 'Stock', icon: PackageSearch },
  { href: '/portal/reservations', label: 'Reserved', icon: BookmarkCheck },
  { href: '/portal/invoices', label: 'Invoices', icon: ReceiptText },
  { href: '/portal/profile', label: 'Account', icon: UserRound },
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
          <Link href="/portal/catalog" className="flex min-w-0 items-center" aria-label="ANSHA customer portal">
            <Image
              src="/images/ansha-logo-transparent.webp"
              alt="Ansha Trading Co. LLC-FZ"
              width={210}
              height={104}
              priority
              className="h-12 w-auto max-w-[165px] object-contain object-left sm:h-16 sm:max-w-[210px]"
            />
          </Link>

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

      <main className="mx-auto max-w-6xl px-3 py-5 pb-28 sm:px-5 sm:py-7 md:pb-8">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t bg-background/98 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden"
        aria-label="Mobile customer portal navigation"
      >
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold',
                active ? 'bg-accent/10 text-accent' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

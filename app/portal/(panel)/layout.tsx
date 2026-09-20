'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookmarkCheck, LogOut, ReceiptText, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';

const nav = [
  { href: '/portal/reservations', label: 'Reservations', icon: BookmarkCheck },
  { href: '/portal/invoices', label: 'Invoices', icon: ReceiptText },
  { href: '/portal/account', label: 'Account', icon: WalletCards },
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
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Link href="/portal/invoices" className="flex items-center gap-2 font-bold">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-white">
                <ReceiptText className="h-4 w-4" />
              </span>
              ANSHA Portal
            </Link>
            <nav className="flex items-center gap-1">
              {nav.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

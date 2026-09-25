'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CarFront, Home, PackageSearch, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/mobile', label: 'Home', icon: Home },
  { href: '/mobile/stock', label: 'Vehicles', icon: CarFront },
  { href: '/mobile/parts', label: 'Parts', icon: PackageSearch },
  { href: '/mobile/account', label: 'Account', icon: UserRound },
] as const;

export function MobileAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mobile-app-shell min-h-screen bg-[#f4f6f8] text-[#15171a]">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f4f6f8]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-xl items-center justify-between px-4">
          <Link href="/mobile" className="flex items-center gap-2" aria-label="ANSHA mobile home">
            <Image src="/images/ansha-logo-transparent.webp" alt="ANSHA Trading" width={112} height={56} priority className="h-10 w-auto object-contain" />
          </Link>
          <Link href="/mobile/account" className="rounded-full bg-[#16181c] px-3.5 py-2 text-xs font-bold text-white shadow-sm">
            Customer portal
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-28 pt-5">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(.7rem,env(safe-area-inset-bottom))]" aria-label="Mobile app navigation">
        <div className="mx-auto grid h-[4.35rem] max-w-xl grid-cols-4 rounded-[1.4rem] border border-white/70 bg-[#17191d]/95 p-1.5 text-white shadow-[0_20px_50px_rgba(10,12,16,.28)] backdrop-blur-xl">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/mobile' && pathname.startsWith(`${href}/`));
            return (
              <Link key={href} href={href} className={cn('flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold transition', active ? 'bg-[#d21e1e] text-white shadow-lg shadow-red-900/20' : 'text-white/60 hover:bg-white/10 hover:text-white')}>
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

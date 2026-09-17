'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CarFront, Home, MessageCircle, Search, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/site-config';

const items = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/parts', label: 'Parts', icon: Wrench },
  { href: '/vehicles', label: 'Vehicles', icon: CarFront },
  { href: '/categories', label: 'Search', icon: Search },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const whatsappUrl = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent('Hello ANSHA TRADING, I need help finding an automotive part or vehicle.')}`;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/96 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.1)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
      <div className="grid h-16 grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className={cn(
              'flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors',
              active ? 'text-accent' : 'text-muted-foreground'
            )}>
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-[#199c4b]">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#25D366] text-white shadow-lg"><MessageCircle className="h-4 w-4" /></span>
          <span>WhatsApp</span>
        </a>
      </div>
    </nav>
  );
}

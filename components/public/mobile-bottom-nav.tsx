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
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 w-full max-w-full border-t border-border bg-background/96 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_30px_rgba(15,23,42,0.1)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/90 lg:hidden"
      aria-label="Mobile navigation"
      style={{ overscrollBehavior: 'none' }}
    >
      <div className="mx-auto grid h-16 max-w-full grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold transition-colors',
                active ? 'text-accent' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold text-[#199c4b]"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#25D366] text-white shadow-md">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="max-w-full truncate">WhatsApp</span>
        </a>
      </div>
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CarFront, Heart, MessageCircle, Search, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/site-config';
import { useCustomerLists } from '@/hooks/use-customer-lists';

const items = [
  { href: '/parts', label: 'Parts', icon: Wrench },
  { href: '/vehicles', label: 'Vehicles', icon: CarFront },
  { href: '/parts#catalog-search', label: 'Search', icon: Search },
  { href: '/favorites', label: 'Favorites', icon: Heart },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { favoritesCount } = useCustomerLists();
  // Display-only: same WhatsApp number + greeting payload as before (no URL logic change).
  const whatsappUrl = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent('Hello ANSHA TRADING, I need help finding an automotive part or vehicle.')}`;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[55] w-full max-w-full overflow-x-clip border-t border-border bg-background/96 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_30px_rgba(15,23,42,0.1)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/90 lg:hidden"
      aria-label="Mobile navigation"
      style={{
        overscrollBehavior: 'none',
        touchAction: 'manipulation',
        transform: 'translateZ(0)',
      }}
    >
      <div className="mx-auto grid h-[4.25rem] w-full max-w-full grid-cols-5">
        {items.map((item) => {
          const hrefPath = item.href.split('#')[0];
          const active =
            item.href === '/favorites'
              ? pathname.startsWith('/favorites')
              : item.label === 'Search'
                ? false
                : pathname === hrefPath || (hrefPath !== '/' && pathname.startsWith(hrefPath));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5 shrink-0', active && 'text-accent')} />
              <span className="max-w-full truncate">{item.label}</span>
              {item.href === '/favorites' && favoritesCount > 0 ? (
                <span className="absolute right-[18%] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-black text-white">
                  {favoritesCount > 99 ? '99+' : favoritesCount}
                </span>
              ) : null}
            </Link>
          );
        })}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold text-[#199c4b]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#128C7E] text-white shadow-md">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="max-w-full truncate">WhatsApp</span>
        </a>
      </div>
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CarFront, Home, MessageCircle, UserRound, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/', label: 'Home', icon: Home, match: 'home' },
  { href: '/vehicles', label: 'Stock', icon: CarFront, match: 'stock' },
  { href: '/parts', label: 'Parts', icon: Wrench, match: 'parts' },
  { href: '/portal/account', label: 'Account', icon: UserRound, match: 'portal' },
  { href: '/portal/support', label: 'Chat', icon: MessageCircle, match: 'support' },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const isActive = (match: (typeof items)[number]['match']) => {
    if (match === 'home') return pathname === '/';
    if (match === 'stock') return pathname.startsWith('/vehicles') || pathname.startsWith('/machinery');
    if (match === 'parts') return pathname.startsWith('/parts') || pathname.startsWith('/categories');
    if (match === 'support') return pathname.startsWith('/portal/support');
    return pathname.startsWith('/portal/account') || pathname.startsWith('/portal/profile') || pathname.startsWith('/portal/settings');
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[55] w-full max-w-full overflow-x-clip border-t border-border bg-background/96 pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] shadow-[0_-8px_30px_rgba(15,23,42,0.1)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/90 lg:hidden"
      aria-label="ANSHA mobile app navigation"
      style={{ overscrollBehavior: 'none', touchAction: 'manipulation', transform: 'translateZ(0)' }}
    >
      <div className="mx-auto grid h-[4.25rem] w-full max-w-full grid-cols-5">
        {items.map((item) => {
          const active = isActive(item.match);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[10px] font-semibold transition-colors',
                active ? 'bg-accent/10 text-accent' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

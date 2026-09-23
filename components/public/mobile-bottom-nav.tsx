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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] w-full max-w-full px-2 pb-[max(0.45rem,env(safe-area-inset-bottom,0px))] lg:hidden"
      aria-label="ANSHA mobile app navigation"
      style={{ overscrollBehavior: 'none', touchAction: 'manipulation', transform: 'translateZ(0)' }}
    >
      <div className="mobile-nav-glass pointer-events-auto mx-auto grid h-[4.5rem] w-full max-w-xl grid-cols-5 rounded-2xl border border-white/10 px-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.30)] backdrop-blur-2xl">
        {items.map((item) => {
          const active = isActive(item.match);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative my-1 flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[1rem] px-0.5 text-[10px] font-bold transition-all duration-200 active:scale-95',
                active ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
              )}
            >
              <span className={cn(
                'grid h-7 w-9 place-items-center rounded-full transition-all duration-200',
                active && 'bg-accent text-white shadow-[0_6px_18px_rgba(210,30,30,.32)]'
              )}>
                <item.icon className={cn('h-[19px] w-[19px] shrink-0', active && 'stroke-[2.4]')} />
              </span>
              <span className="max-w-full truncate">{item.label}</span>
              {active ? <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-current" aria-hidden /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

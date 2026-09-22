'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CarFront, Home, MessageCircle, Tag, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/site-config';

const items = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/parts', label: 'Parts', icon: Wrench, priority: true },
  { href: '/vehicles', label: 'Vehicles', icon: CarFront },
  { href: '/offers', label: 'Deals', icon: Tag },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const whatsappUrl = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent('Hello ANSHA TRADING, I need help finding an automotive part or vehicle.')}`;

  return (
    <nav
      className="glass-header fixed bottom-0 left-0 right-0 z-[55] w-full max-w-full overflow-x-clip border-t border-white/40 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-10px_32px_rgba(23,20,21,0.08)] lg:hidden"
      aria-label="Mobile navigation"
      style={{
        overscrollBehavior: 'none',
        touchAction: 'manipulation',
        transform: 'translateZ(0)',
      }}
    >
      <div className="mx-auto grid h-16 w-full max-w-full grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold transition-colors',
                active ? 'text-[#d21e1e]' : item.priority ? 'text-[#c35252]' : 'text-muted-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5 shrink-0', (active || item.priority) && 'text-accent')} />
              <span className={cn('max-w-full truncate', item.priority && !active && 'font-bold')}>{item.label}</span>
            </Link>
          );
        })}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold text-[#199c4b]"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#128C7E] text-white shadow-md">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="max-w-full truncate">WhatsApp</span>
        </a>
      </div>
    </nav>
  );
}

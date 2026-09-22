'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CarFront, Home, MessageCircle, UserRound, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/site-config';

const items = [
  { href: '/', label: 'Home', icon: Home, match: 'home' },
  { href: '/vehicles', label: 'Stock', icon: CarFront, match: 'stock' },
  { href: '/parts', label: 'Parts', icon: Wrench, match: 'parts' },
  { href: '/portal/profile', label: 'Account', icon: UserRound, match: 'portal' },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const whatsappUrl = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent('Hello ANSHA TRADING, I need help finding an automotive part or vehicle.')}`;

  const isActive = (match: (typeof items)[number]['match']) => {
    if (match === 'home') return pathname === '/';
    if (match === 'stock') return pathname.startsWith('/vehicles') || pathname.startsWith('/machinery');
    if (match === 'parts') return pathname.startsWith('/parts') || pathname.startsWith('/categories');
    return pathname === '/portal' || pathname.startsWith('/portal/');
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
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold text-[#199c4b]"
          aria-label="Chat with ANSHA on WhatsApp"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#128C7E] text-white shadow-md">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="max-w-full truncate">Chat</span>
        </a>
      </div>
    </nav>
  );
}

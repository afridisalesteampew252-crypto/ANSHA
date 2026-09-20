'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export type RemittanceNavItem = {
  href: string;
  label: string;
  badge?: number;
  financeOnly?: boolean;
};

const ITEMS: RemittanceNavItem[] = [
  { href: '/admin/remittances/dashboard', label: 'Dashboard', financeOnly: true },
  { href: '/admin/remittances', label: 'Remittances', financeOnly: true },
  { href: '/admin/remittances/mine', label: 'My remittances' },
  { href: '/admin/remittances/unknown', label: 'Unknown TTS', financeOnly: true },
];

export function RemittanceSubNav({
  canManageFinance,
  unknownCount = 0,
}: {
  canManageFinance: boolean;
  unknownCount?: number;
}) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => canManageFinance || !item.financeOnly);

  return (
    <nav
      className="-mx-1 flex gap-1 overflow-x-auto pb-1"
      aria-label="Remittances sections"
    >
      {items.map((item) => {
        const active =
          item.href === '/admin/remittances'
            ? pathname === '/admin/remittances'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const badge = item.href === '/admin/remittances/unknown' ? unknownCount : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-accent/12 text-accent'
                : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
            )}
          >
            {item.label}
            {badge > 0 ? (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

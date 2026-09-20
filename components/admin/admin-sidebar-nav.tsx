'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Banknote,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  BookmarkPlus,
  Building2,
  Calculator,
  CalendarCheck,
  Car,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileBarChart,
  FileSpreadsheet,
  Globe2,
  Headphones,
  Inbox,
  LayoutDashboard,
  Mail,
  MailPlus,
  MapPin,
  Megaphone,
  MessageCircle,
  Package,
  PackagePlus,
  Phone,
  Receipt,
  ReceiptText,
  ScrollText,
  Ship,
  Sparkles,
  Star,
  Tag,
  Truck,
  Upload,
  UserCog,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

export type AdminNavItem = { href: string; label: string; icon: LucideIcon };
export type AdminNavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: AdminNavItem[];
};

const OPEN_STORAGE_KEY = 'ansha-admin-nav-open';

/** Existing admin routes only — regrouped for accordion UX. */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/admin/ai', label: 'AI assistant', icon: Sparkles },
      { href: '/admin/audit-log', label: 'Audit log', icon: ScrollText },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    icon: Package,
    items: [
      { href: '/admin/parts', label: 'Parts', icon: Package },
      { href: '/admin/vehicles', label: 'Vehicles', icon: Car },
      { href: '/admin/vehicles?class=machinery', label: 'Machinery & trucks', icon: Truck },
      { href: '/admin/categories', label: 'Categories', icon: Tag },
      { href: '/admin/imports', label: 'Bulk Import', icon: Upload },
    ],
  },
  {
    id: 'purchase',
    label: 'Purchase & stock',
    icon: PackagePlus,
    items: [
      { href: '/admin/suppliers', label: 'Suppliers', icon: Truck },
      { href: '/admin/purchase-orders', label: 'Purchase orders', icon: ClipboardList },
      { href: '/admin/inventory/receive', label: 'Receive stock', icon: PackagePlus },
      { href: '/admin/landed-cost', label: 'Landed cost', icon: Calculator },
      { href: '/admin/export-shipments', label: 'Export shipments', icon: Ship },
    ],
  },
  {
    id: 'sales',
    label: 'Sales & customers',
    icon: Users,
    items: [
      { href: '/admin/customers', label: 'Customers & portal', icon: Users },
      { href: '/admin/reservations', label: 'Reserve vehicle', icon: BookmarkPlus },
      { href: '/admin/invoices', label: 'Invoices', icon: ReceiptText },
      { href: '/admin/remittances', label: 'Remittances', icon: WalletCards },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: Building2,
    items: [
      { href: '/admin/bank-accounts', label: 'Bank accounts', icon: Building2 },
      { href: '/admin/expenses', label: 'Expenses', icon: Receipt },
      { href: '/admin/invoices/supplier', label: 'Supplier invoices', icon: ReceiptText },
      { href: '/admin/ledger', label: 'General ledger', icon: BookMarked },
      { href: '/admin/reports', label: 'Reports', icon: FileBarChart },
      { href: '/admin/vat-return', label: 'VAT return', icon: FileSpreadsheet },
    ],
  },
  {
    id: 'inbox',
    label: 'Inbox',
    icon: Inbox,
    items: [
      { href: '/admin/inquiries', label: 'Inquiries', icon: Inbox },
      { href: '/admin/live-chat', label: 'Live chat', icon: Headphones },
      { href: '/admin/requests', label: 'Requests', icon: ClipboardList },
      { href: '/admin/chat', label: 'Team Chat', icon: MessageCircle },
      { href: '/admin/mail', label: 'Internal Mail', icon: Mail },
      { href: '/admin/email', label: 'Outbound email', icon: MailPlus },
      { href: '/admin/whatsapp', label: 'WhatsApp', icon: Phone },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    items: [
      { href: '/admin/blog', label: 'Insights / Blog', icon: BookOpen },
      { href: '/admin/reviews', label: 'Reviews', icon: Star },
      { href: '/admin/offers', label: 'Deals & offers', icon: Megaphone },
      { href: '/admin/subscribers', label: 'PWA subscribers', icon: Bell },
      { href: '/admin/campaigns', label: 'Campaigns', icon: MailPlus },
      { href: '/admin/trade-config', label: 'Trade config', icon: Globe2 },
    ],
  },
  {
    id: 'hr',
    label: 'HR',
    icon: Clock3,
    items: [
      { href: '/admin/hr', label: 'Workforce', icon: Clock3 },
      { href: '/admin/hr/locations', label: 'Shift locations', icon: MapPin },
      { href: '/admin/hr/shifts', label: 'Shifts & assignments', icon: ClipboardList },
      { href: '/admin/hr/attendance', label: 'Attendance', icon: CalendarCheck },
      { href: '/admin/payroll', label: 'Payroll', icon: Banknote },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    icon: UserCog,
    items: [{ href: '/admin/users', label: 'Users', icon: UserCog }],
  },
];

export function isAdminNavActive(pathname: string, href: string, search = '') {
  const [hrefPath, hrefQuery = ''] = href.split('?');
  if (pathname !== hrefPath && !pathname.startsWith(`${hrefPath}/`)) return false;

  const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const expected = new URLSearchParams(hrefQuery);

  if (hrefQuery) {
    for (const [key, value] of Array.from(expected.entries())) {
      if (current.get(key) !== value) return false;
    }
    return true;
  }

  // Plain /admin/vehicles should not stay active when a class filter is applied.
  if (hrefPath === '/admin/vehicles') {
    const classFilter = current.get('class');
    if (classFilter && classFilter !== 'all' && classFilter !== 'passenger') return false;
  }

  if (pathname === hrefPath) return true;
  if (!pathname.startsWith(`${hrefPath}/`)) return false;
  // Avoid marking customer invoices active on supplier invoice routes
  if (hrefPath === '/admin/invoices' && pathname.startsWith('/admin/invoices/supplier')) return false;
  // Avoid marking /admin/hr active on nested HR pages that have their own nav items
  if (hrefPath === '/admin/hr') {
    const nested = ['/admin/hr/locations', '/admin/hr/shifts', '/admin/hr/attendance'];
    if (nested.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return false;
  }
  return true;
}

function readStoredOpenIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OPEN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeStoredOpenIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(ids));
}

function NavLinkRow({
  item,
  active,
  collapsed,
  mobile,
  chatUnread,
  nested = false,
}: {
  item: AdminNavItem;
  active: boolean;
  collapsed: boolean;
  mobile: boolean;
  chatUnread: number;
  nested?: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={!mobile && collapsed ? item.label : undefined}
      className={cn(
        'flex min-h-9 items-center rounded-lg text-sm font-medium transition-colors',
        mobile || !collapsed ? 'gap-3 px-3 py-2' : 'justify-center px-2 py-2.5',
        nested && (mobile || !collapsed) && 'ml-2 border-l border-border/70 pl-3',
        active
          ? 'bg-accent/12 text-accent shadow-[inset_3px_0_0_hsl(var(--accent))]'
          : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
      )}
    >
      <item.icon className={cn('h-[1.125rem] w-[1.125rem] shrink-0', active && 'text-accent')} />
      <span className={cn('flex min-w-0 flex-1 items-center justify-between gap-2', !mobile && collapsed && 'sr-only')}>
        <span className="truncate">{item.label}</span>
        {item.href === '/admin/chat' && chatUnread > 0 ? (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
            {chatUnread > 99 ? '99+' : chatUnread}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function GroupFlyoutLinks({
  group,
  pathname,
  search,
  chatUnread,
}: {
  group: AdminNavGroup;
  pathname: string;
  search: string;
  chatUnread: number;
}) {
  return (
    <div className="space-y-0.5 p-1">
      <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {group.label}
      </p>
      {group.items.map((item) => {
        const active = isAdminNavActive(pathname, item.href, search);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex min-h-9 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-accent/12 text-accent'
                : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
            )}
          >
            <item.icon className={cn('h-4 w-4 shrink-0', active && 'text-accent')} />
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="truncate">{item.label}</span>
              {item.href === '/admin/chat' && chatUnread > 0 ? (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {chatUnread > 99 ? '99+' : chatUnread}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

type AdminSidebarNavProps = {
  groups: AdminNavGroup[];
  collapsed?: boolean;
  mobile?: boolean;
  chatUnread?: number;
};

export function AdminSidebarNav({
  groups,
  collapsed = false,
  mobile = false,
  chatUnread = 0,
}: AdminSidebarNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const activeGroupId = useMemo(
    () => groups.find((group) => group.items.some((item) => isAdminNavActive(pathname, item.href, search)))?.id ?? null,
    [groups, pathname, search]
  );

  const [openIds, setOpenIds] = useState<string[]>(() => (activeGroupId ? [activeGroupId] : []));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredOpenIds();
    const next = new Set(stored);
    if (activeGroupId) next.add(activeGroupId);
    setOpenIds(Array.from(next));
    setHydrated(true);
    // Hydrate once from localStorage; pathname-driven open is handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated || !activeGroupId) return;
    setOpenIds((current) => {
      if (current.includes(activeGroupId)) return current;
      const next = [...current, activeGroupId];
      writeStoredOpenIds(next);
      return next;
    });
  }, [activeGroupId, hydrated, pathname]);

  const setGroupOpen = (id: string, open: boolean) => {
    setOpenIds((current) => {
      // Keep the route's parent open even if the user tries to collapse it
      const forced = activeGroupId === id ? true : open;
      const next = forced
        ? Array.from(new Set(current.concat(id)))
        : current.filter((value) => value !== id);
      writeStoredOpenIds(next);
      return next;
    });
  };

  const iconOnly = !mobile && collapsed;

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Admin navigation">
      {groups.map((group) => {
        const groupActive = group.items.some((item) => isAdminNavActive(pathname, item.href, search));
        const isOpen = openIds.includes(group.id);
        const GroupIcon = group.icon;

        if (iconOnly) {
          return (
            <HoverCard key={group.id} openDelay={80} closeDelay={120}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  aria-label={group.label}
                  title={group.label}
                  className={cn(
                    'flex w-full items-center justify-center rounded-lg px-2 py-2.5 transition-colors',
                    groupActive
                      ? 'bg-accent/12 text-accent shadow-[inset_3px_0_0_hsl(var(--accent))]'
                      : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                  )}
                >
                  <GroupIcon className={cn('h-5 w-5 shrink-0', groupActive && 'text-accent')} />
                </button>
              </HoverCardTrigger>
              <HoverCardContent side="right" align="start" sideOffset={10} className="w-56 p-1.5">
                <GroupFlyoutLinks group={group} pathname={pathname} search={search} chatUnread={chatUnread} />
              </HoverCardContent>
            </HoverCard>
          );
        }

        // Single child: skip accordion chrome and link directly
        if (group.items.length === 1) {
          const item = group.items[0];
          return (
            <div key={group.id} className="space-y-1">
              <p className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">
                {group.label}
              </p>
              <NavLinkRow
                item={item}
                active={isAdminNavActive(pathname, item.href, search)}
                collapsed={collapsed}
                mobile={mobile}
                chatUnread={chatUnread}
              />
            </div>
          );
        }

        return (
          <Collapsible
            key={group.id}
            open={isOpen}
            onOpenChange={(open) => setGroupOpen(group.id, open)}
            className="space-y-0.5"
          >
            <CollapsibleTrigger
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors',
                groupActive
                  ? 'bg-accent/8 text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
              )}
            >
              <GroupIcon className={cn('h-4 w-4 shrink-0', groupActive && 'text-accent')} />
              <span className="min-w-0 flex-1 truncate text-[13px]">{group.label}</span>
              {group.items.some((item) => item.href === '/admin/chat') && chatUnread > 0 ? (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {chatUnread > 99 ? '99+' : chatUnread}
                </span>
              ) : null}
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                  isOpen && 'rotate-180',
                  groupActive && 'text-accent'
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
              {group.items.map((item) => (
                <NavLinkRow
                  key={item.href}
                  item={item}
                  active={isAdminNavActive(pathname, item.href, search)}
                  collapsed={false}
                  mobile={mobile}
                  chatUnread={chatUnread}
                  nested
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </nav>
  );
}

/** Resolve page title from visible nav items. */
export function findAdminNavLabel(groups: AdminNavGroup[], pathname: string, search = ''): string | undefined {
  for (const group of groups) {
    for (const item of group.items) {
      if (isAdminNavActive(pathname, item.href, search)) return item.label;
    }
  }
  return undefined;
}

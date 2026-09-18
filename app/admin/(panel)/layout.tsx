'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  BookOpen, BookmarkPlus, Car, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, Inbox, LayoutDashboard,
  Loader2, Mail, Megaphone, Menu, MessageCircle, Package, PackagePlus, Plus, ReceiptText, Ship, Tag, Truck,
  Upload, WalletCards, UserCog, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile } from '@/lib/types';
import { ThemeToggle } from '@/components/theme-toggle';
import { AdminProfileMenu } from '@/components/admin/admin-profile-menu';
import { AdminNotificationCenter } from '@/components/admin/admin-notification-center';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { href: '/admin/parts', label: 'Parts', icon: Package },
      { href: '/admin/vehicles', label: 'Vehicles', icon: Car },
      { href: '/admin/categories', label: 'Categories', icon: Tag },
      { href: '/admin/imports', label: 'Bulk Import', icon: Upload },
      { href: '/admin/suppliers', label: 'Suppliers', icon: Truck },
      { href: '/admin/purchase-orders', label: 'Purchase orders', icon: ClipboardList },
      { href: '/admin/inventory/receive', label: 'Receive stock', icon: PackagePlus },
      { href: '/admin/export-shipments', label: 'Export shipments', icon: Ship },
    ],
  },
  {
    label: 'Sales & customers',
    items: [
      { href: '/admin/customers', label: 'Customers & portal', icon: Users },
      { href: '/admin/reservations', label: 'Reserve vehicle', icon: BookmarkPlus },
      { href: '/admin/invoices', label: 'Invoices', icon: ReceiptText },
      { href: '/admin/invoices/supplier', label: 'Supplier Invoices', icon: ReceiptText },
      { href: '/admin/remittances', label: 'Remittances', icon: WalletCards },
    ],
  },
  {
    label: 'Inbox',
    items: [
      { href: '/admin/inquiries', label: 'Inquiries', icon: Inbox },
      { href: '/admin/requests', label: 'Requests', icon: ClipboardList },
      { href: '/admin/chat', label: 'Team Chat', icon: MessageCircle },
      { href: '/admin/mail', label: 'Internal Mail', icon: Mail },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/admin/blog', label: 'Insights / Blog', icon: BookOpen },
      { href: '/admin/offers', label: 'Deals & PWA push', icon: Megaphone },
    ],
  },
  {
    label: 'Team',
    items: [
      { href: '/admin/users', label: 'Users', icon: UserCog },
    ],
  },
];

const SALES_ALLOWED_HREFS = new Set([
  '/admin/dashboard',
  '/admin/parts',
  '/admin/vehicles',
  '/admin/customers',
  '/admin/reservations',
  '/admin/invoices',
  '/admin/inquiries',
  '/admin/requests',
  '/admin/chat',
  '/admin/mail',
]);

const isNavActive = (pathname: string, href: string) => pathname === href || (pathname.startsWith(`${href}/`) && !(href === '/admin/invoices' && pathname.startsWith('/admin/invoices/supplier')));

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('ansha-admin-sidebar') === 'collapsed');
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.replace('/admin');
      const { data: prof } = await supabase.from('admin_profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (!prof || prof.is_active === false) {
        await supabase.auth.signOut();
        return router.replace(prof?.is_active === false ? '/admin?error=inactive' : '/admin');
      }
      setProfile(prof as AdminProfile);
      if (prof.avatar_url) {
        const { data } = await supabase.storage.from('profile-images').createSignedUrl(prof.avatar_url, 3600);
        setAvatarUrl(data?.signedUrl || '');
      }
      const { data: memberships } = await supabase.from('chat_participants').select('conversation_id,last_read_at').eq('user_id', session.user.id);
      if (memberships?.length) {
        const { data: recent } = await supabase
          .from('chat_messages')
          .select('conversation_id,sender_id,created_at')
          .in('conversation_id', memberships.map((row) => row.conversation_id))
          .neq('sender_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(200);
        const readAt = new Map(memberships.map((row) => [row.conversation_id, row.last_read_at]));
        setChatUnread((recent || []).filter((message) => {
          const lastRead = readAt.get(message.conversation_id);
          return !lastRead || message.created_at > lastRead;
        }).length);
      }
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('ansha-admin-sidebar', next ? 'collapsed' : 'expanded');
      return next;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/admin');
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-secondary/30"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!profile) return null;

  const isSales = profile.role === 'sales';
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !isSales || SALES_ALLOWED_HREFS.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);
  const visibleItems = visibleGroups.flatMap((group) => group.items);
  const activeItem = visibleItems.find((item) => isNavActive(pathname, item.href));
  const pageTitle = pathname === '/admin/profile' ? 'My profile' : activeItem?.label || 'Admin workspace';

  const navigation = (mobile = false) => (
    <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label="Admin navigation">
      {visibleGroups.map((group) => (
        <div key={group.label} className="space-y-1">
          {(mobile || !collapsed) && (
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">{group.label}</p>
          )}
          {group.items.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={!mobile && collapsed ? item.label : undefined}
                className={cn(
                  'flex min-h-10 items-center rounded-lg text-sm font-medium transition-colors',
                  mobile || !collapsed ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-2.5',
                  active ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className={cn('flex min-w-0 flex-1 items-center justify-between gap-2', !mobile && collapsed && 'sr-only')}>
                  <span className="truncate">{item.label}</span>
                  {item.href === '/admin/chat' && chatUnread > 0 ? (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">{chatUnread > 99 ? '99+' : chatUnread}</span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen min-w-0 bg-secondary/20">
      <aside className={cn('relative hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex', collapsed ? 'w-20' : 'w-64')}>
        <div className={cn('flex h-24 items-center border-b border-border', collapsed ? 'justify-center px-2' : 'px-4')}>
          <Link href="/admin/dashboard" className="flex min-w-0 items-center" aria-label="ANSHA operations dashboard">
            <Image src="/images/ansha-logo-transparent.webp" alt="ANSHA Trading" width={1000} height={497} priority className={cn('w-auto object-contain transition-all', collapsed ? 'h-12 max-w-[62px]' : 'h-20 max-w-[220px]')} />
          </Link>
        </div>
        {navigation()}
        <div className="space-y-2 border-t border-border p-3">
          {!collapsed && <div className="flex items-center justify-between px-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Appearance</span><ThemeToggle /></div>}
          {collapsed && <div className="flex justify-center"><ThemeToggle /></div>}
          <AdminProfileMenu compact={collapsed} profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
        </div>
        <Button variant="outline" size="icon" onClick={toggleCollapsed} className="absolute -right-4 top-28 z-10 h-8 w-8 rounded-full bg-background shadow-sm" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </aside>

      {mobileOpen && <>
        <button className="fixed inset-0 z-[60] bg-black/45 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close admin menu overlay" />
        <aside className="fixed inset-y-0 left-0 z-[70] flex w-[min(86vw,20rem)] flex-col border-r bg-card shadow-2xl md:hidden">
          <div className="flex h-20 items-center justify-between border-b px-3">
            <Image src="/images/ansha-logo-transparent.webp" alt="ANSHA Trading" width={1000} height={497} priority className="h-16 w-auto max-w-[220px] object-contain" />
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close admin menu"><X className="h-5 w-5" /></Button>
          </div>
          {navigation(true)}
          <div className="space-y-2 border-t p-3"><div className="flex items-center justify-between px-2"><span className="text-xs text-muted-foreground">Appearance</span><ThemeToggle /></div><AdminProfileMenu profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} /></div>
        </aside>
      </>}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-20 items-center justify-between border-b border-border bg-card/95 px-3 backdrop-blur md:hidden">
          <div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open admin menu"><Menu className="h-6 w-6" /></Button><div className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">ANSHA operations</p><h1 className="truncate text-base font-bold">{pageTitle}</h1></div></div>
          <div className="flex shrink-0 items-center"><AdminNotificationCenter userId={profile.id} /><ThemeToggle /><AdminProfileMenu compact profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} /></div>
        </header>

        <header className="hidden h-20 items-center justify-between border-b border-border bg-card/95 px-6 backdrop-blur md:flex xl:px-8">
          <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">ANSHA operations</p><h1 className="text-xl font-bold tracking-tight">{pageTitle}</h1></div>
          <div className="flex items-center gap-2">
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="accent"><Plus className="h-4 w-4" />Quick add</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel>Create or import</DropdownMenuLabel><DropdownMenuItem asChild><Link href="/admin/parts/new">New part</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/admin/vehicles/new">New vehicle</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/admin/invoices/new">New invoice</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/admin/customers">Customer / enable portal</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/admin/remittances">Record remittance</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/admin/offers">Deal + PWA push</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/admin/imports">Bulk import</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            <Button asChild variant="outline" size="icon" aria-label="View website"><Link href="/" target="_blank"><ExternalLink className="h-4 w-4" /></Link></Button>
            <AdminNotificationCenter userId={profile.id} />
            <ThemeToggle /><AdminProfileMenu compact profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-5 md:p-6 xl:p-8">{children}</main>
      </div>
    </div>
  );
}

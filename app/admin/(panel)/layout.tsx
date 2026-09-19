'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { BookmarkPlus, ChevronLeft, ChevronRight, ExternalLink, Loader2, Menu, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile } from '@/lib/types';
import {
  ACCOUNTS_NAV_HREFS,
  canAccessHr,
  canManageReceivables,
  FIELD_AGENT_NAV_HREFS,
  isAccountAdminRole,
  isAccountsRole,
  isFieldAgentRole,
} from '@/lib/admin-rbac';
import { ThemeToggle } from '@/components/theme-toggle';
import { AdminProfileMenu } from '@/components/admin/admin-profile-menu';
import { AdminNotificationCenter } from '@/components/admin/admin-notification-center';
import { AdminMarketChrome } from '@/components/admin/admin-market-chrome';
import {
  ADMIN_NAV_GROUPS,
  AdminSidebarNav,
  findAdminNavLabel,
  type AdminNavGroup,
} from '@/components/admin/admin-sidebar-nav';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const MANAGER_NAV_HREFS = new Set([
  '/admin/dashboard',
  '/admin/hr',
  '/admin/hr/locations',
  '/admin/hr/shifts',
  '/admin/hr/attendance',
  '/admin/chat',
]);

function filterNavGroups(profile: AdminProfile): AdminNavGroup[] {
  const fieldAgent = isFieldAgentRole(profile.role);
  const accounts = isAccountsRole(profile.role);
  const isAccountAdmin = isAccountAdminRole(profile.role);
  const isManager = profile.role === 'manager';
  const hrAccess = canAccessHr(profile.role);

  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.href === '/admin/users' && !isAccountAdmin) return false;
      if (item.href === '/admin/audit-log' && !isAccountAdmin) return false;
      // HR section + payroll (now nested under HR)
      if ((group.id === 'hr' || item.href.startsWith('/admin/hr') || item.href === '/admin/payroll') && !hrAccess) {
        return false;
      }
      if (fieldAgent && !FIELD_AGENT_NAV_HREFS.has(item.href)) return false;
      if (accounts && !ACCOUNTS_NAV_HREFS.has(item.href)) return false;
      if (isManager && !MANAGER_NAV_HREFS.has(item.href)) return false;
      return true;
    }),
  })).filter((group) => group.items.length > 0);
}

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

  const fieldAgent = isFieldAgentRole(profile.role);
  const accounts = isAccountsRole(profile.role);
  const isManager = profile.role === 'manager';
  const receivables = canManageReceivables(profile.role);
  const visibleGroups = filterNavGroups(profile);
  const pageTitle =
    pathname === '/admin/profile' ? 'My profile' : findAdminNavLabel(visibleGroups, pathname) || 'Admin workspace';

  return (
    <div className="admin-shell flex min-h-screen min-w-0">
      <aside className={cn('admin-sidebar relative hidden shrink-0 flex-col border-r border-border/80 transition-[width] duration-200 md:flex', collapsed ? 'w-20' : 'w-64')}>
        <div className={cn('flex h-24 items-center border-b border-border/80', collapsed ? 'justify-center px-2' : 'px-4')}>
          <Link href="/admin/dashboard" className="flex min-w-0 items-center" aria-label="ANSHA operations dashboard">
            <Image src="/images/ansha-logo-transparent.webp" alt="ANSHA Trading" width={1000} height={497} priority className={cn('w-auto object-contain transition-all', collapsed ? 'h-12 max-w-[62px]' : 'h-20 max-w-[220px]')} />
          </Link>
        </div>
        <AdminSidebarNav groups={visibleGroups} collapsed={collapsed} chatUnread={chatUnread} />
        <div className="space-y-2 border-t border-border/80 p-3">
          {!collapsed && <div className="flex items-center justify-between px-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Appearance</span><ThemeToggle /></div>}
          {collapsed && <div className="flex justify-center"><ThemeToggle /></div>}
          <AdminProfileMenu compact={collapsed} profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
        </div>
        <Button variant="outline" size="icon" onClick={toggleCollapsed} className="absolute -right-4 top-28 z-10 h-8 w-8 rounded-full bg-background shadow-sm" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </aside>

      {mobileOpen && <>
        <button className="fixed inset-0 z-[60] bg-[#0b0c0f]/50 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close admin menu overlay" />
        <aside className="admin-sidebar fixed inset-y-0 left-0 z-[70] flex w-[min(86vw,20rem)] flex-col border-r border-border/80 shadow-2xl md:hidden">
          <div className="flex h-20 items-center justify-between border-b border-border/80 px-3">
            <Image src="/images/ansha-logo-transparent.webp" alt="ANSHA Trading" width={1000} height={497} priority className="h-16 w-auto max-w-[220px] object-contain" />
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close admin menu"><X className="h-5 w-5" /></Button>
          </div>
          <AdminSidebarNav groups={visibleGroups} mobile chatUnread={chatUnread} />
          <div className="space-y-2 border-t border-border/80 p-3"><div className="flex items-center justify-between px-2"><span className="text-xs text-muted-foreground">Appearance</span><ThemeToggle /></div><AdminProfileMenu profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} /></div>
        </aside>
      </>}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="admin-topbar sticky top-0 z-40 border-b border-border/80 backdrop-blur md:hidden">
          <div className="flex h-14 items-center justify-between px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open admin menu"><Menu className="h-6 w-6" /></Button>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">ANSHA ops</p>
                <h1 className="truncate text-base font-bold">{pageTitle}</h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <AdminNotificationCenter userId={profile.id} />
              <ThemeToggle />
              <AdminProfileMenu compact profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
            </div>
          </div>
          <div className="border-t border-border/60 px-3 py-2">
            <AdminMarketChrome compact />
          </div>
        </header>

        <header className="admin-topbar hidden min-h-[4.5rem] items-center gap-4 border-b border-border/80 px-6 py-3 backdrop-blur md:flex xl:px-8">
          <div className="min-w-0 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">ANSHA operations</p>
            <h1 className="text-xl font-bold tracking-tight">{pageTitle}</h1>
          </div>
          <div className="mx-2 hidden min-w-0 flex-1 justify-center lg:flex xl:mx-6">
            <AdminMarketChrome className="w-full max-w-3xl justify-center" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!fieldAgent && !isManager && !accounts ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="accent"><Plus className="h-4 w-4" />Quick add</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Create or import</DropdownMenuLabel>
                <DropdownMenuItem asChild><Link href="/admin/parts/new">New part</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/admin/vehicles/new">New vehicle</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/admin/invoices/new">New invoice</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/admin/customers">Customer / enable portal</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/admin/remittances">Record remittance</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/admin/offers">Deal + PWA push</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/admin/subscribers">PWA subscribers</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/admin/imports">Bulk import</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            ) : fieldAgent ? (
              <div className="flex gap-2">
                <Button asChild variant="accent"><Link href="/admin/invoices/new"><Plus className="h-4 w-4" />Draft proforma</Link></Button>
                <Button asChild variant="outline"><Link href="/admin/reservations"><BookmarkPlus className="h-4 w-4" />Reserve</Link></Button>
              </div>
            ) : accounts || receivables ? (
              <Button asChild variant="accent"><Link href="/admin/invoices/new"><Plus className="h-4 w-4" />New invoice</Link></Button>
            ) : null}
            <Button asChild variant="outline" size="icon" aria-label="View website"><Link href="/" target="_blank"><ExternalLink className="h-4 w-4" /></Link></Button>
            <AdminNotificationCenter userId={profile.id} />
            <ThemeToggle />
            <AdminProfileMenu compact profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
          </div>
        </header>

        <div className="admin-topbar hidden border-b border-border/60 px-6 py-2 lg:hidden md:block xl:px-8">
          <AdminMarketChrome compact />
        </div>

        <main className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-5 md:p-6 xl:p-8">{children}</main>
      </div>
    </div>
  );
}

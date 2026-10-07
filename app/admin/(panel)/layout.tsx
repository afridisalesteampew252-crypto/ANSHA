'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { BookmarkPlus, ChevronLeft, ChevronRight, ExternalLink, Loader2, Menu, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile } from '@/lib/types';
import {
  ACCOUNTS_NAV_HREFS,
  canAccessHr,
  canAccessLiveChat,
  canManageReceivables,
  FIELD_AGENT_NAV_HREFS,
  isAccountAdminRole,
  isAccountsRole,
  isFieldAgentRole,
  MANAGER_NAV_HREFS,
} from '@/lib/admin-rbac';
import { AdminProfileMenu } from '@/components/admin/admin-profile-menu';
import { AdminNotificationCenter } from '@/components/admin/admin-notification-center';
import { AdminCommandCenter, AdminCommandTrigger } from '@/components/admin/admin-command-center';
import { AdminMarketChrome } from '@/components/admin/admin-market-chrome';
import { UnifiedRecordSearch } from '@/components/admin/unified-record-search';
import { AdminPresenceProvider } from '@/components/admin/admin-presence-provider';
import { AdminHealthMonitor } from '@/components/admin/admin-health-monitor';
import {
  ADMIN_NAV_GROUPS,
  AdminSidebarNav,
  findAdminNavLabel,
  type AdminNavGroup,
} from '@/components/admin/admin-sidebar-nav';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// Admin-only assistant drawer. Loaded on demand so non-admin roles never download it;
// the API route (/api/admin-assistant) enforces the same admin-only rule server-side.
const AdminAssistantLauncher = dynamic(
  () => import('@/components/admin/admin-assistant/admin-assistant-launcher').then((m) => m.AdminAssistantLauncher),
  { ssr: false }
);

function filterNavGroups(profile: AdminProfile): AdminNavGroup[] {
  const fieldAgent = isFieldAgentRole(profile.role);
  const accounts = isAccountsRole(profile.role);
  const isAccountAdmin = isAccountAdminRole(profile.role);
  const isManager = profile.role === 'manager';
  const hrAccess = canAccessHr(profile.role);
  const receivables = canManageReceivables(profile.role);

  const hrefAllowed = (allowed: Set<string>, href: string) =>
    allowed.has(href) || allowed.has(href.split('?')[0]);

  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.href === '/admin/users' && !isAccountAdmin) return false;
      if (item.href === '/admin/agents' && !isAccountAdmin && !fieldAgent) return false;
      if (item.href === '/admin/audit-log' && !isAccountAdmin) return false;
      if (item.href === '/admin/live-chat' && !canAccessLiveChat(profile.role)) return false;
      // Remittances: finance sees full group; others only My remittances
      if (group.id === 'remittances') {
        if (receivables) return true;
        if (item.href === '/admin/remittances/mine') return true;
        return false;
      }
      // HR section + payroll (now nested under HR)
      if ((group.id === 'hr' || item.href.startsWith('/admin/hr') || item.href === '/admin/payroll') && !hrAccess) {
        return false;
      }
      if (fieldAgent && !hrefAllowed(FIELD_AGENT_NAV_HREFS, item.href)) return false;
      if (accounts && !hrefAllowed(ACCOUNTS_NAV_HREFS, item.href)) return false;
      if (isManager && !hrefAllowed(MANAGER_NAV_HREFS, item.href)) return false;
      return true;
    }).map((item) => fieldAgent ? {
      ...item,
      label: item.href === '/admin/inquiries' ? 'My inquiries'
        : item.href === '/admin/requests' ? 'My requests'
          : item.href === '/admin/agents' ? 'My verification' : item.label,
    } : item),
  })).filter((group) => group.items.length > 0);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-secondary/30">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </Suspense>
  );
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [liveChatOpen, setLiveChatOpen] = useState(0);
  const [unknownRemittances, setUnknownRemittances] = useState(0);

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
      if (canAccessLiveChat(prof.role)) {
        const [openSessions, openTickets] = await Promise.all([
          supabase
            .from('tawk_chat_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'open')
            .is('dismissed_at', null),
          supabase
            .from('tawk_ticket_events')
            .select('id', { count: 'exact', head: true })
            .is('dismissed_at', null),
        ]);
        setLiveChatOpen((openSessions.count || 0) + (openTickets.count || 0));
      }
      if (canManageReceivables(prof.role)) {
        const { data: unknownCount } = await supabase.rpc('count_unknown_remittances');
        setUnknownRemittances(Number(unknownCount || 0));
      }
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    document.body.classList.toggle('admin-nav-open', mobileOpen);
    return () => document.body.classList.remove('admin-nav-open');
  }, [mobileOpen]);

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
  const canUseAssistant = isAccountAdminRole(profile.role) && profile.is_active !== false;
  const visibleGroups = filterNavGroups(profile);
  const pageTitle =
    pathname === '/admin/profile'
      ? 'My profile'
      : findAdminNavLabel(visibleGroups, pathname, searchParams?.toString() ?? '') || 'Admin workspace';

  return (
    <AdminPresenceProvider userId={profile.id}>
      <AdminHealthMonitor role={profile.role} />
      <div className="admin-shell flex min-h-screen min-w-0">
      <AdminCommandCenter groups={visibleGroups} />
      <aside className={cn('admin-sidebar sticky top-0 z-30 hidden h-[100dvh] min-h-0 shrink-0 self-start flex-col border-r border-border/80 transition-[width] duration-200 md:flex', collapsed ? 'w-20' : 'w-64')}>
        <div className={cn('admin-sidebar-brand flex h-24 shrink-0 items-center border-b border-border/80', collapsed ? 'justify-center px-2' : 'px-4')}>
          <Link href="/admin/dashboard" className="flex min-w-0 items-center" aria-label="ANSHA operations dashboard">
            <Image src="/images/ansha-logo-transparent.webp" alt="ANSHA Trading" width={337} height={135} priority className={cn('w-auto object-contain transition-all', collapsed ? 'h-12 max-w-[62px]' : 'h-20 max-w-[220px]')} />
          </Link>
        </div>
        <AdminSidebarNav groups={visibleGroups} collapsed={collapsed} chatUnread={chatUnread} liveChatOpen={liveChatOpen} unknownRemittances={unknownRemittances} />
        <div className="shrink-0 border-t border-border/80 p-3">
          <AdminProfileMenu compact={collapsed} profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
        </div>
        <Button variant="outline" size="icon" onClick={toggleCollapsed} className="absolute -right-4 top-28 z-10 h-8 w-8 rounded-full bg-background shadow-sm" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </aside>

      {mobileOpen && <>
        <button className="fixed inset-0 z-[60] bg-[#0b0c0f]/50 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close admin menu overlay" />
        <aside className="admin-sidebar fixed inset-y-0 left-0 z-[70] flex min-h-0 w-[min(86vw,20rem)] flex-col border-r border-border/80 shadow-2xl md:hidden">
          <div className="admin-sidebar-brand flex h-20 shrink-0 items-center justify-between border-b border-border/80 px-3">
            <Image src="/images/ansha-logo-transparent.webp" alt="ANSHA Trading" width={337} height={135} priority className="h-16 w-auto max-w-[220px] object-contain" />
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close admin menu"><X className="h-5 w-5" /></Button>
          </div>
          <AdminSidebarNav groups={visibleGroups} mobile chatUnread={chatUnread} liveChatOpen={liveChatOpen} unknownRemittances={unknownRemittances} />
          <div className="shrink-0 border-t border-border/80 p-3"><AdminProfileMenu profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} /></div>
        </aside>
      </>}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="admin-topbar sticky top-0 z-40 border-b border-border/80 backdrop-blur md:hidden">
          <div className="flex h-14 items-center justify-between px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setMobileOpen(true)} aria-label="Open admin menu"><Menu className="h-6 w-6" /></Button>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">ANSHA ops</p>
                <h1 className="truncate text-base font-bold">{pageTitle}</h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <AdminCommandTrigger compact />
              <AdminNotificationCenter userId={profile.id} />
              
              <AdminProfileMenu compact profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
            </div>
          </div>
          <div className="border-t border-border/60 px-3 py-2">
            <AdminMarketChrome compact />
          </div>
          <div className="border-t border-border/60 px-3 py-2">
            <UnifiedRecordSearch />
          </div>
        </header>

        <header className="admin-topbar hidden min-h-[4.5rem] items-center gap-3 border-b border-border/80 px-4 py-3 backdrop-blur md:flex xl:px-6">
          <div className="min-w-0 max-w-[12rem] shrink-0 xl:max-w-[16rem]">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">ANSHA operations</p>
            <h1 className="truncate text-xl font-bold tracking-tight" title={pageTitle}>{pageTitle}</h1>
          </div>
          <div className="hidden min-w-0 flex-1 lg:block"><UnifiedRecordSearch className="w-full" /></div>
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
                <DropdownMenuItem asChild><Link href="/admin/vehicles/new?pool=auction">New auction stock</Link></DropdownMenuItem>
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
            {canUseAssistant ? <AdminAssistantLauncher /> : null}
            <AdminCommandTrigger />
            <AdminNotificationCenter userId={profile.id} />
            
            <AdminProfileMenu compact profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
          </div>
        </header>

        <div className="admin-topbar hidden border-b border-border/60 px-4 py-2 md:block xl:px-6">
          <AdminMarketChrome compact />
          <div className="mt-2 lg:hidden"><UnifiedRecordSearch /></div>
        </div>

        <main className="min-w-0 flex-1 overflow-x-clip p-3 pb-8 sm:p-5 sm:pb-10 md:p-6 md:pb-12 xl:p-8">{children}</main>
      </div>
      </div>
    </AdminPresenceProvider>
  );
}

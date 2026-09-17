'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  BookOpen, Car, ChevronLeft, ChevronRight, ExternalLink, Inbox, LayoutDashboard,
  Loader2, Mail, Menu, MessageCircle, Package, Plus, ReceiptText, Tag, Upload, WalletCards,
  UserCog, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile } from '@/lib/types';
import { ThemeToggle } from '@/components/theme-toggle';
import { AdminProfileMenu } from '@/components/admin/admin-profile-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/parts', label: 'Parts', icon: Package },
  { href: '/admin/vehicles', label: 'Vehicles', icon: Car },
  { href: '/admin/categories', label: 'Categories', icon: Tag },
  { href: '/admin/invoices', label: 'Invoices', icon: ReceiptText },
  { href: '/admin/invoices/supplier', label: 'Supplier Invoices', icon: ReceiptText },
  { href: '/admin/remittances', label: 'Remittances', icon: WalletCards },
  { href: '/admin/inquiries', label: 'Inquiries', icon: Inbox },
  { href: '/admin/chat', label: 'Team Chat', icon: MessageCircle },
  { href: '/admin/mail', label: 'Internal Mail', icon: Mail },
  { href: '/admin/blog', label: 'Blog', icon: BookOpen },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/users', label: 'Users', icon: UserCog },
  { href: '/admin/imports', label: 'Bulk Import', icon: Upload },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('ansha-admin-sidebar') === 'collapsed');
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.replace('/admin');
      const { data: prof } = await supabase.from('admin_profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (!prof) {
        await supabase.auth.signOut();
        return router.replace('/admin');
      }
      setProfile(prof as AdminProfile);
      if (prof.avatar_url) {
        const { data } = await supabase.storage.from('profile-images').createSignedUrl(prof.avatar_url, 3600);
        setAvatarUrl(data?.signedUrl || '');
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

  const activeItem = navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const pageTitle = pathname === '/admin/profile' ? 'My profile' : activeItem?.label || 'Admin workspace';

  const navigation = (mobile = false) => <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Admin navigation">
    {navItems.map((item) => {
      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
      return <Link key={item.href} href={item.href} title={!mobile && collapsed ? item.label : undefined} className={cn('flex min-h-10 items-center rounded-md text-sm font-medium transition-colors', mobile || !collapsed ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-2.5', active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
        <item.icon className="h-5 w-5 shrink-0" /><span className={cn(!mobile && collapsed && 'sr-only')}>{item.label}</span>
      </Link>;
    })}
  </nav>;

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
          <div className="flex shrink-0 items-center"><ThemeToggle /><AdminProfileMenu compact profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} /></div>
        </header>

        <header className="hidden h-20 items-center justify-between border-b border-border bg-card/95 px-6 backdrop-blur md:flex xl:px-8">
          <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">ANSHA operations</p><h1 className="text-xl font-bold tracking-tight">{pageTitle}</h1></div>
          <div className="flex items-center gap-2">
            <DropdownMenu><DropdownMenuTrigger asChild><Button><Plus className="h-4 w-4" />Quick add</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuLabel>Create or import</DropdownMenuLabel><DropdownMenuItem asChild><Link href="/admin/parts/new">New part</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/admin/vehicles/new">New vehicle</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/admin/invoices/new">New invoice</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/admin/remittances">Record remittance</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/admin/imports">Bulk import</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            <Button asChild variant="outline" size="icon" aria-label="View website"><Link href="/" target="_blank"><ExternalLink className="h-4 w-4" /></Link></Button>
            <ThemeToggle /><AdminProfileMenu compact profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-5 md:p-6 xl:p-8">{children}</main>
      </div>
    </div>
  );
}

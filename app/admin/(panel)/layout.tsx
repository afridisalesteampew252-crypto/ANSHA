'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  Package,
  Tag,
  Inbox,
  Loader2,
  Car,
  BookOpen,
  Users,
  UserCog,
  Upload,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile } from '@/lib/types';
import { ThemeToggle } from '@/components/theme-toggle';
import { AdminProfileMenu } from '@/components/admin/admin-profile-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/parts', label: 'Parts', icon: Package },
  { href: '/admin/vehicles', label: 'Vehicles', icon: Car },
  { href: '/admin/categories', label: 'Categories', icon: Tag },
  { href: '/admin/inquiries', label: 'Inquiries', icon: Inbox },
  { href: '/admin/blog', label: 'Blog', icon: BookOpen },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/users', label: 'Users', icon: UserCog },
  { href: '/admin/imports', label: 'Bulk Import', icon: Upload },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/admin');
        return;
      }

      const { data: prof } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!prof) {
        await supabase.auth.signOut();
        router.replace('/admin');
        return;
      }

      setProfile(prof as AdminProfile);
      if (prof.avatar_url) {
        const { data: signed } = await supabase.storage
          .from('profile-images')
          .createSignedUrl(prof.avatar_url, 3600);
        setAvatarUrl(signed?.signedUrl || '');
      }
      setLoading(false);
    })();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/admin');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) return null;

  const activeItem = navItems.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
  const pageTitle = pathname === '/admin/profile' ? 'My profile' : activeItem?.label || 'Admin workspace';

  return (
    <div className="flex min-h-screen bg-secondary/20">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-20 items-center border-b border-border px-4">
          <Link href="/admin/dashboard" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-1 shadow-sm ring-1 ring-border">
              <Image src="/images/ansha-trading-logo.jpg" alt="ANSHA Trading" width={140} height={80} className="h-full w-full object-contain" priority />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold tracking-tight">ANSHA TRADING</span>
              <span className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Operations</span>
            </span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-border p-3">
          <div className="flex items-center justify-between px-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Appearance</span>
            <ThemeToggle />
          </div>
          <AdminProfileMenu profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-12 items-center justify-center overflow-hidden rounded bg-white p-1 ring-1 ring-border">
              <Image src="/images/ansha-trading-logo.jpg" alt="ANSHA Trading" width={120} height={64} className="h-full w-full object-contain" priority />
            </span>
            <span className="text-sm font-bold">{pageTitle}</span>
          </div>
          <div className="flex items-center">
            <ThemeToggle />
            <AdminProfileMenu compact profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
          </div>
        </header>

        <header className="hidden h-20 items-center justify-between border-b border-border bg-card/95 px-8 backdrop-blur md:flex">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">ANSHA operations</p>
            <h1 className="text-xl font-bold tracking-tight">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button><Plus className="h-4 w-4" />Quick add</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Create or import</DropdownMenuLabel>
                <DropdownMenuItem asChild><Link href="/admin/parts/new" className="cursor-pointer">New part</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/admin/vehicles/new" className="cursor-pointer">New vehicle</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/admin/imports" className="cursor-pointer">Bulk import</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild variant="outline" size="icon" aria-label="View website"><Link href="/" target="_blank"><ExternalLink className="h-4 w-4" /></Link></Button>
            <ThemeToggle />
            <AdminProfileMenu compact profile={profile} avatarUrl={avatarUrl} onSignOut={handleLogout} />
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="flex overflow-x-auto border-b border-border bg-card px-2 md:hidden">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

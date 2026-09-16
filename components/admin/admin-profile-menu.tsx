'use client';

import Link from 'next/link';
import {
  ChevronDown,
  ExternalLink,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { AdminProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type AdminProfileMenuProps = {
  profile: AdminProfile;
  avatarUrl?: string;
  compact?: boolean;
  onSignOut: () => void;
};

export function AdminProfileMenu({
  profile,
  avatarUrl,
  compact = false,
  onSignOut,
}: AdminProfileMenuProps) {
  const displayName = profile.full_name || 'ANSHA staff';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
  const accessLabel = profile.role === 'admin' ? 'Full system access' : 'Operational access';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'h-auto min-w-0 rounded-xl border border-transparent p-1.5 hover:border-border hover:bg-accent',
            !compact && 'w-full justify-start px-2 py-2'
          )}
          aria-label="Open account menu"
        >
          <Avatar className="h-9 w-9 border border-border bg-background">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={`${displayName} profile picture`} className="object-cover" /> : null}
            <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{initials || 'AS'}</AvatarFallback>
          </Avatar>
          {!compact ? (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-foreground">{displayName}</span>
                <span className="block truncate text-xs capitalize text-muted-foreground">{profile.role}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? 'end' : 'start'} side={compact ? 'bottom' : 'right'} className="w-72 p-2">
        <DropdownMenuLabel className="space-y-3 p-2 font-normal">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border border-border">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt="" className="object-cover" /> : null}
              <AvatarFallback className="bg-primary/10 font-bold text-primary">{initials || 'AS'}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{profile.email || 'Internal account'}</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-secondary/70 px-3 py-2">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {accessLabel}
            </span>
            <Badge variant="outline" className="capitalize">{profile.role}</Badge>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin/profile" className="cursor-pointer gap-2">
            <UserRound className="h-4 w-4" />
            My profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/" target="_blank" className="cursor-pointer gap-2">
            <ExternalLink className="h-4 w-4" />
            View website
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

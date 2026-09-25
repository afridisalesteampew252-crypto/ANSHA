'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, Search } from 'lucide-react';
import type { AdminNavGroup } from '@/components/admin/admin-sidebar-nav';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

const OPEN_EVENT = 'ansha:open-admin-command-center';

type QuickAction = { href: string; label: string; accessHref: string };

const quickActions: QuickAction[] = [
  { href: '/admin/vehicles/new', label: 'Create vehicle', accessHref: '/admin/vehicles' },
  { href: '/admin/parts/new', label: 'Create part', accessHref: '/admin/parts' },
  { href: '/admin/invoices/new', label: 'Create invoice', accessHref: '/admin/invoices' },
  { href: '/admin/imports', label: 'Start bulk import', accessHref: '/admin/imports' },
  { href: '/admin/remittances', label: 'Record remittance', accessHref: '/admin/remittances' },
];

export function AdminCommandTrigger({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      aria-label="Search admin pages and actions"
      title="Search admin pages and actions (Ctrl+K)"
      className={compact
        ? 'grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border/80 text-muted-foreground transition hover:bg-secondary hover:text-foreground'
        : 'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border/80 bg-background/80 px-3 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground'}
    >
      <Search className="h-4 w-4" />
      {compact ? <span className="sr-only">Search pages</span> : <><span>Find page or action</span><kbd className="ml-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-semibold">Ctrl K</kbd></>}
    </button>
  );
}

export function AdminCommandCenter({ groups }: { groups: AdminNavGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const allowedHrefs = useMemo(() => new Set(groups.flatMap((group) => group.items.map((item) => item.href))), [groups]);
  const allowedQuickActions = quickActions.filter((action) =>
    allowedHrefs.has(action.accessHref) || allowedHrefs.has(action.accessHref.split('?')[0])
  );

  useEffect(() => {
    const openPalette = () => setOpen(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_EVENT, openPalette);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener(OPEN_EVENT, openPalette);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search admin pages or actions…" />
      <CommandList className="max-h-[min(65vh,32rem)]">
        <CommandEmpty>No matching page or action.</CommandEmpty>
        {allowedQuickActions.length > 0 && (
          <>
            <CommandGroup heading="Quick actions">
              {allowedQuickActions.map((action) => (
                <CommandItem key={action.href} value={action.label} onSelect={() => navigate(action.href)}>
                  <Plus className="mr-2 h-4 w-4 text-accent" />
                  {action.label}
                  <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {groups.map((group) => (
          <CommandGroup key={group.id} heading={group.label}>
            {group.items.map(({ href, label, icon: Icon }) => (
              <CommandItem key={href} value={`${group.label} ${label}`} onSelect={() => navigate(href)}>
                <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                {label}
                <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

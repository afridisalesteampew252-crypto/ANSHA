'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { matchesQuery } from '@/lib/matches-query';
import { cn } from '@/lib/utils';

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra fields used for type-to-filter (code, phone, chassis, etc.). */
  keywords?: ReadonlyArray<string | number | boolean | null | undefined>;
  group?: string;
};

export type SearchableSelectProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Shown as the first clear row when allowClear is true. */
  clearLabel?: string;
  allowClear?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  triggerClassName?: string;
  size?: 'default' | 'sm';
};

export function SearchableSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  clearLabel = 'Clear selection',
  allowClear = true,
  disabled = false,
  required = false,
  className,
  triggerClassName,
  size = 'default',
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const selected = React.useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value]
  );

  const filtered = React.useMemo(() => {
    return options.filter((option) =>
      matchesQuery(query, [option.label, option.value, ...(option.keywords || [])])
    );
  }, [options, query]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, SearchableSelectOption[]>();
    for (const option of filtered) {
      const key = option.group || '';
      const list = map.get(key) || [];
      list.push(option);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const selectValue = (next: string) => {
    onValueChange(next);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={cn('w-full', className)}>
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          value={value}
          onChange={() => undefined}
          required
        />
      ) : null}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'w-full justify-between rounded-md border border-input bg-background font-normal shadow-none hover:bg-background hover:text-foreground',
              size === 'sm' ? 'h-9 px-2 text-xs' : 'h-10 px-3 text-sm',
              !selected && 'text-muted-foreground',
              triggerClassName
            )}
          >
            <span className="truncate text-left">{selected?.label || placeholder}</span>
            <span className="ml-2 flex shrink-0 items-center gap-1">
              {allowClear && value ? (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Clear selection"
                  className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    selectValue('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      selectValue('');
                    }
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              ) : null}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              {allowClear ? (
                <CommandGroup>
                  <CommandItem value="__clear__" onSelect={() => selectValue('')}>
                    <Check className={cn('mr-2 h-4 w-4', value ? 'opacity-0' : 'opacity-100')} />
                    <span className="text-muted-foreground">{clearLabel}</span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {grouped.map(([heading, rows]) => (
                <CommandGroup key={heading || '__ungrouped__'} heading={heading || undefined}>
                  {rows.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => selectValue(option.value)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          value === option.value ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="truncate">{option.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Build a customer option with code / name / company / phone / email searchable. */
export function customerSelectOption(row: {
  id: string;
  customer_code?: string | null;
  full_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  label?: string;
}): SearchableSelectOption {
  const display =
    row.label ||
    [row.customer_code, row.company_name || row.full_name].filter(Boolean).join(' — ') ||
    row.full_name ||
    row.id;
  return {
    value: row.id,
    label: display,
    keywords: [row.customer_code, row.full_name, row.company_name, row.phone, row.email],
  };
}

/** Build a vehicle option with stock # / chassis / title / make / model searchable. */
export function vehicleSelectOption(row: {
  id: string;
  title?: string | null;
  stock_number?: string | null;
  chassis_number?: string | null;
  chassis_code?: string | null;
  make?: string | null;
  model?: string | null;
  label?: string;
  is_published?: boolean | null;
}): SearchableSelectOption {
  const ref = row.stock_number || row.chassis_number || row.chassis_code || row.id.slice(0, 8);
  const base = row.label || `${ref} — ${row.title || 'Vehicle'}`;
  const label = row.is_published ? `${base} · public` : base;
  return {
    value: row.id,
    label,
    keywords: [
      row.title,
      row.stock_number,
      row.chassis_number,
      row.chassis_code,
      row.make,
      row.model,
      ref,
    ],
  };
}

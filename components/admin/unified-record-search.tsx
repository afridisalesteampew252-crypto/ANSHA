'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BriefcaseBusiness, CarFront, FileText, Loader2, Search, UserRound, Wrench, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SearchResult = {
  record_type: 'customer' | 'vehicle' | 'part' | 'invoice' | 'inquiry' | 'request';
  record_id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  href: string;
  updated_at: string | null;
};

const resultLabels: Record<SearchResult['record_type'], string> = {
  customer: 'Customer',
  vehicle: 'Vehicle',
  part: 'Part',
  invoice: 'Invoice',
  inquiry: 'Inquiry',
  request: 'Request',
};

function ResultIcon({ type }: { type: SearchResult['record_type'] }) {
  const Icon = {
    customer: UserRound,
    vehicle: CarFront,
    part: Wrench,
    invoice: FileText,
    inquiry: BriefcaseBusiness,
    request: BriefcaseBusiness,
  }[type];
  return <Icon className="h-4 w-4" aria-hidden />;
}

export function UnifiedRecordSearch({ className }: { className?: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      setBusy(false);
      setError('');
      return;
    }

    const currentRequest = ++requestId.current;
    setBusy(true);
    setError('');
    const timer = window.setTimeout(async () => {
      const { data, error: searchError } = await supabase.rpc('search_workspace_records', {
        p_query: normalized,
        p_limit: 30,
      });
      if (currentRequest !== requestId.current) return;
      setBusy(false);
      if (searchError) {
        setResults([]);
        setError('Search is temporarily unavailable.');
        return;
      }
      setResults((data || []) as SearchResult[]);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [query]);

  const clear = () => {
    setQuery('');
    setResults([]);
    setError('');
    setOpen(false);
  };

  const showResults = open && query.trim().length >= 2;

  return (
    <div className={cn('relative min-w-0', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') clear();
          }}
          placeholder="Search customers, stock, invoices…"
          aria-label="Search workspace records"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls="admin-unified-search-results"
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
        />
        {busy ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Searching" />
        ) : query ? (
          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" onClick={clear} aria-label="Clear search">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {showResults ? (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="Close search results" onClick={() => setOpen(false)} />
          <div id="admin-unified-search-results" role="listbox" className="absolute left-0 right-0 top-12 z-50 max-h-[min(70vh,30rem)] overflow-y-auto rounded-xl border border-border/80 bg-card p-2 shadow-2xl">
            {error ? <p className="px-3 py-6 text-center text-sm text-destructive">{error}</p> : null}
            {!error && !busy && results.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">No workspace records found.</p> : null}
            {!error && results.length > 0 ? (
              <div className="space-y-1">
                {results.map((result) => (
                  <Link
                    key={`${result.record_type}-${result.record_id}`}
                    href={result.href}
                    role="option"
                    onClick={() => setOpen(false)}
                    className="group flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none"
                  >
                    <span className="mt-0.5 rounded-md bg-accent/10 p-2 text-accent"><ResultIcon type={result.record_type} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{result.title}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">{resultLabels[result.record_type]}</Badge>
                      </span>
                      {result.subtitle ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.subtitle}</span> : null}
                      {result.status ? <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{result.status.replaceAll('_', ' ')}</span> : null}
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

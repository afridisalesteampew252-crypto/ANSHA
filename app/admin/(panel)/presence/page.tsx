'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';

type Staff = { id: string; full_name: string | null; email: string | null; role: string; last_seen_at: string | null };
type Customer = { id: string; customer_id: string | null; full_name: string | null; email: string | null; last_seen_at: string | null; is_active: boolean };
type Owner = { id: string; owner_id: string | null };

const FRESH_MS = 120_000;
const isFresh = (date: string | null, now: number) => Boolean(date && now - new Date(date).getTime() < FRESH_MS);

export default function OnlinePresencePage() {
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [checkedAt, setCheckedAt] = useState('');

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setReady(true); return; }
    const profile = await supabase.from('admin_profiles').select('role,is_active').eq('id', user.id).maybeSingle();
    if (!profile.data?.is_active || !['admin', 'manager'].includes(profile.data.role)) {
      setReady(true);
      setAllowed(false);
      return;
    }
    setAllowed(true);
    const since = new Date(Date.now() - FRESH_MS).toISOString();
    const [team, portal] = await Promise.all([
      supabase.from('admin_profiles').select('id,full_name,email,role,last_seen_at').eq('is_active', true)
        .gte('last_seen_at', since).order('last_seen_at', { ascending: false }).limit(500),
      supabase.from('customer_profiles').select('id,customer_id,full_name,email,last_seen_at,is_active').eq('is_active', true)
        .gte('last_seen_at', since).order('last_seen_at', { ascending: false }).limit(500),
    ]);
    if (team.error || portal.error) {
      setError('Presence could not be loaded. Check your connection and permissions.');
    } else {
      setError('');
      const customerRows = (portal.data || []) as Customer[];
      setStaff((team.data || []) as Staff[]);
      setCustomers(customerRows);
      const ids = customerRows.map((row) => row.customer_id).filter((id): id is string => Boolean(id));
      if (ids.length) {
        const ownerResult = await supabase.from('customers').select('id,owner_id').in('id', ids);
        setOwners((ownerResult.data || []) as Owner[]);
      } else setOwners([]);
    }
    setNow(Date.now());
    setCheckedAt(new Date().toLocaleTimeString());
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const ownerByCustomer = useMemo(() => new Map(owners.map((row) => [row.id, row.owner_id])), [owners]);
  const staffById = useMemo(() => new Map(staff.map((row) => [row.id, row.full_name || row.email || 'Staff member'])), [staff]);
  const onlineStaff = staff.filter((row) => isFresh(row.last_seen_at, now));
  const onlineCustomers = customers.filter((row) => isFresh(row.last_seen_at, now));

  if (!ready) return <div className="p-8 text-sm text-muted-foreground">Loading online activity…</div>;
  if (!allowed) return <div className="p-8 text-sm">Online activity is available to admins and managers.</div>;
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Activity className="h-6 w-6 text-accent" />Online now</h1>
        <p className="mt-1 text-sm text-muted-foreground">Staff and customer portal activity within the last two minutes. Updated {checkedAt || 'now'}.</p>
      </div>
      <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Refresh</Button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <Card><CardHeader><CardTitle>{onlineStaff.length} staff online</CardTitle></CardHeader><CardContent className="space-y-2">
        {onlineStaff.length === 0 && <p className="text-sm text-muted-foreground">No active staff sessions.</p>}
        {onlineStaff.map((row) => <div key={row.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
          <span className="min-w-0"><span className="block truncate font-semibold">{row.full_name || row.email || 'Staff member'}</span><span className="text-xs capitalize text-muted-foreground">{row.role} · last active {new Date(row.last_seen_at!).toLocaleTimeString()}</span></span>
        </div>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{onlineCustomers.length} customers online</CardTitle></CardHeader><CardContent className="space-y-2">
        {onlineCustomers.length === 0 && <p className="text-sm text-muted-foreground">No active customer portal sessions.</p>}
        {onlineCustomers.map((row) => {
          const ownerId = row.customer_id ? ownerByCustomer.get(row.customer_id) : null;
          return <div key={row.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{row.full_name || row.email || 'Customer'}</span><span className="block truncate text-xs text-muted-foreground">{row.email || 'No email'} · Agent: {ownerId ? staffById.get(ownerId) || 'Assigned staff' : 'Unassigned'}</span></span>
            <Link href="/admin/customers" className="shrink-0 text-xs font-semibold text-accent hover:underline">Customers</Link>
          </div>;
        })}
      </CardContent></Card>
    </div>
    <p className="text-xs text-muted-foreground">Online means a recent visible admin or customer portal session. It does not track which page a customer is viewing. Lists show up to 500 active accounts per group.</p>
  </div>;
}

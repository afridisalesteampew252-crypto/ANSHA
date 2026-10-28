'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, CircleAlert, CircleCheck, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';

type Check = { name: string; state: 'passed' | 'failed' | 'unknown'; detail: string };
type Incident = {
  service: string;
  status: string;
  consecutive_failures: number;
  details: string | null;
  checked_at: string;
  opened_at: string | null;
  resolved_at: string | null;
};

export default function SystemHealthPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    let website: Check = { name: 'Website and API', state: 'unknown', detail: 'No response yet' };
    let database: Check = { name: 'Public database access', state: 'unknown', detail: 'No response yet' };
    try {
      const response = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const payload = await response.json();
      website = { name: 'Website and API', state: response.ok ? 'passed' : 'failed', detail: response.ok ? 'Health endpoint responding' : 'Health endpoint returned an error' };
      database = { name: 'Public database access', state: payload.checks?.database === 'passed' ? 'passed' : 'failed', detail: payload.checks?.database === 'passed' ? 'Catalog query succeeded' : 'Catalog query failed' };
      setLatency(typeof payload.latencyMs === 'number' ? payload.latencyMs : null);
    } catch {
      website = { name: 'Website and API', state: 'failed', detail: 'Health endpoint unreachable' };
      setLatency(null);
    }
    const [feed, history] = await Promise.all([
      supabase.from('admin_notifications').select('id', { head: true, count: 'exact' }).limit(1),
      supabase.from('system_health_incidents').select('service,status,consecutive_failures,details,checked_at,opened_at,resolved_at').order('service'),
    ]);
    const notifications: Check = {
      name: 'Admin notifications',
      state: feed.error ? 'failed' : 'passed',
      detail: feed.error ? 'Notification feed could not be read' : 'Notification feed query succeeded',
    };
    setChecks([website, database, notifications]);
    setIncidents((history.data || []) as Incident[]);
    setCheckedAt(new Date().toLocaleString());
    setBusy(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const failed = checks.filter((check) => check.state === 'failed').length;
  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><Button asChild variant="ghost" className="-ml-3"><Link href="/admin/dashboard"><ArrowLeft className="h-4 w-4" />Dashboard</Link></Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Activity className="h-6 w-6 text-accent" />System health</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last checked {checkedAt || 'not yet checked'}{latency !== null ? ` · API ${latency} ms` : ''}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link href="/admin/image-optimization"><ImageIcon className="h-4 w-4" />Image optimizer</Link></Button>
        <Button variant="outline" disabled={busy} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Check now</Button>
      </div>
    </div>
    <div className="rounded-xl border bg-card p-4 text-sm font-semibold">{checks.length === 0 ? 'Checking…' : failed ? `${failed} service check${failed === 1 ? '' : 's'} need attention` : 'All checked services operational'}</div>
    <div className="grid gap-3 md:grid-cols-3">
      {checks.map((check) => <Card key={check.name}><CardHeader><CardTitle className="flex items-center gap-2 text-base">{check.state === 'passed' ? <CircleCheck className="h-5 w-5 text-emerald-600" /> : <CircleAlert className="h-5 w-5 text-amber-600" />}{check.name}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{check.detail}</CardContent></Card>)}
    </div>
    <Card><CardHeader><CardTitle>Admin alerts</CardTitle></CardHeader><CardContent className="space-y-3">
      {incidents.length === 0 ? <p className="text-sm text-muted-foreground">No recorded incidents.</p> : incidents.map((row) => <div key={row.service} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
        <div><p className="font-semibold capitalize">{row.service} · {row.status}</p><p className="text-muted-foreground">{row.details || 'Checks passing'} · Checked {new Date(row.checked_at).toLocaleString()}</p></div>
        <span className="text-xs text-muted-foreground">{row.opened_at && row.status === 'degraded' ? `Open since ${new Date(row.opened_at).toLocaleString()}` : row.resolved_at ? `Recovered ${new Date(row.resolved_at).toLocaleString()}` : 'No incident'}</span>
      </div>)}
      <p className="text-xs text-muted-foreground">Two failed checks create one alert for each admin; recovery creates one more. Checks run while an admin has the workspace open. A complete website or database outage needs an independent external monitor to alert when nobody is online.</p>
    </CardContent></Card>
  </div>;
}

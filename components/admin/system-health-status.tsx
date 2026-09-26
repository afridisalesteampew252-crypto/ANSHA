'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Health = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks?: { configuration?: string; database?: string };
  latencyMs?: number;
};

export function SystemHealthStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [checkedAt, setCheckedAt] = useState('');

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const result = (await response.json()) as Health;
      setHealth(response.ok ? result : { ...result, status: result.status || 'degraded' });
    } catch {
      setHealth({ status: 'degraded' });
    } finally {
      setCheckedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    const timer = window.setInterval(() => void checkHealth(), 60_000);
    return () => window.clearInterval(timer);
  }, [checkHealth]);

  const healthy = health?.status === 'healthy';
  const Icon = health ? healthy ? CircleCheck : CircleAlert : Loader2;

  return (
    <Card className="border-border/80 shadow-sm" aria-live="polite">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <Activity className="h-4 w-4 text-accent" />
          <Link href="/admin/system-health" className="hover:underline">System health</Link>
        </CardTitle>
        <Icon className={`h-4 w-4 ${health ? healthy ? 'text-emerald-600' : 'text-amber-600' : 'animate-spin text-muted-foreground'}`} />
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="min-w-0">
          <p className="font-semibold">
            {!health ? 'Checking services…' : healthy ? 'All services operational' : 'Service needs attention'}
          </p>
          <p className="text-xs text-muted-foreground">
            {!health ? 'Checking database connection' : health.checks?.database === 'passed' ? 'Database connected' : 'Database connection unavailable'}
            {typeof health?.latencyMs === 'number' ? ` · ${health.latencyMs} ms` : ''}
          </p>
        </div>
        <Link href="/admin/system-health" className="text-xs font-semibold text-accent hover:underline">
          {checkedAt ? `Checked ${checkedAt} · View details` : 'View details'}
        </Link>
      </CardContent>
    </Card>
  );
}

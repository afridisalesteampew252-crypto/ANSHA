'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';

type HealthPayload = {
  status?: string;
  checks?: { database?: string; configuration?: string };
};

export function AdminHealthMonitor({ role }: { role: string }) {
  const previousFailure = useRef('');

  useEffect(() => {
    if (role !== 'admin') return;
    let cancelled = false;
    let running = false;

    const check = async () => {
      if (running || document.hidden || !navigator.onLine) return;
      running = true;
      try {
        let response: Response | null = null;
        let health: HealthPayload | null = null;
        try {
          response = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
          health = await response.json() as HealthPayload;
        } catch { /* A failed website request is still a health signal. */ }

        const notificationCheck = await supabase.from('admin_notifications')
          .select('id', { count: 'exact', head: true }).limit(1);
        if (cancelled) return;

        const failures = [
          !response || !response.ok || health?.status !== 'healthy' ? 'website' : '',
          health?.checks?.database === 'failed' ? 'database' : '',
          notificationCheck.error ? 'notifications' : '',
        ].filter(Boolean);
        const signature = failures.join(',') || '';
        if (signature && signature !== previousFailure.current) {
          toast.error(`System check needs attention: ${failures.join(', ')}. Open System health for details.`, { id: 'admin-system-health' });
        } else if (!signature && previousFailure.current) {
          toast.success('System checks are passing again.', { id: 'admin-system-health' });
        }
        previousFailure.current = signature;

        // Database incidents are stored only while Supabase is reachable.
        const checks: Array<[string, boolean]> = [
          ['website', !failures.includes('website')],
          ['notifications', !failures.includes('notifications')],
        ];
        if (health?.checks?.database) checks.push(['database', health.checks.database === 'passed']);
        for (const [service, healthy] of checks) {
          if (cancelled) break;
          await supabase.rpc('record_system_health_check', {
            p_service: service,
            p_healthy: healthy,
            p_details: healthy ? null : `${service} health check failed`,
          });
        }
      } finally {
        running = false;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    window.addEventListener('focus', check);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', check); };
  }, [role]);

  return null;
}

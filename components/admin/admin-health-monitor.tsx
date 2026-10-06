'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { isAccountAdminRole } from '@/lib/admin-rbac';

type HealthPayload = {
  status?: string;
  checks?: { database?: string; configuration?: string };
};

const CHECK_INTERVAL_MS = 5 * 60_000;
const MIN_CHECK_GAP_MS = 60_000;
/** Re-send an unchanged healthy status at most this often (the DB keeps the last state). */
const HEALTHY_RECORD_EVERY_MS = 15 * 60_000;

/**
 * Background health check for platform admins only.
 *
 * record_system_health_check() requires private.is_platform_admin() (admin_profiles.role =
 * 'admin'). The role prop comes from the profile loaded when the admin shell mounted, so a
 * long-lived tab can be stale (e.g. a user demoted from admin to manager kept calling the RPC
 * every minute and got HTTP 403s). On the first permission error recording stops for the rest
 * of the session.
 */
export function AdminHealthMonitor({ role }: { role: string }) {
  const previousFailure = useRef('');

  useEffect(() => {
    if (!isAccountAdminRole(role)) return;
    let cancelled = false;
    let running = false;
    let recordingAllowed = true;
    let lastCheckAt = 0;
    const lastRecorded = new Map<string, { healthy: boolean; at: number }>();

    const check = async () => {
      if (running || document.hidden || cancelled) return;
      if (Date.now() - lastCheckAt < MIN_CHECK_GAP_MS) return;
      if (!navigator.onLine) {
        toast.error('This device is offline. Health checks will resume when the connection returns.', { id: 'admin-system-health' });
        return;
      }
      running = true;
      lastCheckAt = Date.now();
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

        if (!recordingAllowed) return;

        // Database incidents are stored only while Supabase is reachable.
        const checks: Array<[string, boolean]> = [
          ['website', !failures.includes('website')],
          ['notifications', !failures.includes('notifications')],
        ];
        if (health?.checks?.database) checks.push(['database', health.checks.database === 'passed']);
        for (const [service, healthy] of checks) {
          if (cancelled || !recordingAllowed) break;
          const previous = lastRecorded.get(service);
          const unchangedHealthy = healthy && previous?.healthy === true && Date.now() - previous.at < HEALTHY_RECORD_EVERY_MS;
          if (unchangedHealthy) continue;
          const { error } = await supabase.rpc('record_system_health_check', {
            p_service: service,
            p_healthy: healthy,
            p_details: healthy ? null : `${service} health check failed`,
          });
          if (error) {
            if (error.code === '42501' || /admin access required/i.test(error.message)) recordingAllowed = false;
            break;
          }
          lastRecorded.set(service, { healthy, at: Date.now() });
        }
      } catch {
        toast.error('System health check could not complete.', { id: 'admin-system-health' });
      } finally {
        running = false;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [role]);

  return null;
}

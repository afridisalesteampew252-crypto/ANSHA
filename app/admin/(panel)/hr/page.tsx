'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Clock3, Loader2, MapPin, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canManageHr } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole } from '@/lib/types';

export default function HrOverviewPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [todayStatus, setTodayStatus] = useState<string | null>(null);
  const manage = canManageHr(role);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setUserId(session.user.id);
    const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
    setRole((prof?.role as AdminRole) || null);
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('attendance_records')
      .select('status,check_in_at,check_out_at')
      .eq('user_id', session.user.id)
      .eq('work_date', today)
      .maybeSingle();
    if (data?.check_out_at) setTodayStatus('checked_out');
    else if (data?.check_in_at) setTodayStatus('checked_in');
    else if (data) setTodayStatus(data.status);
    else setTodayStatus(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkIn = async () => {
    if (!userId) return;
    setBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('attendance_records').upsert(
      {
        user_id: userId,
        work_date: today,
        check_in_at: new Date().toISOString(),
        status: 'present',
        recorded_by: userId,
      },
      { onConflict: 'user_id,work_date' }
    );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Checked in.');
    await load();
  };

  const checkOut = async () => {
    if (!userId) return;
    setBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('attendance_records')
      .update({ check_out_at: new Date().toISOString(), recorded_by: userId })
      .eq('user_id', userId)
      .eq('work_date', today);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Checked out.');
    await load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">HR</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Workforce</h1>
        <p className="text-sm text-muted-foreground">
          Office shifts (Morning / Night), locations, assignments, and daily attendance.
          {manage ? ' Ops can manage all records.' : ' You can mark your own attendance; location edits are ops-only in v1.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Today&apos;s attendance</CardTitle>
          <CardDescription>
            {todayStatus === 'checked_out'
              ? 'You have checked out for today.'
              : todayStatus === 'checked_in'
                ? 'You are checked in.'
                : todayStatus
                  ? `Status: ${todayStatus}`
                  : 'No attendance recorded yet today.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="accent" disabled={busy || todayStatus === 'checked_in' || todayStatus === 'checked_out'} onClick={() => void checkIn()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
            Check in
          </Button>
          <Button variant="outline" disabled={busy || todayStatus !== 'checked_in'} onClick={() => void checkOut()}>
            Check out
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/hr/locations" className="rounded-xl border border-border/80 bg-card p-5 transition hover:border-accent/40">
          <MapPin className="h-5 w-5 text-accent" />
          <h2 className="mt-3 font-bold">Shift locations</h2>
          <p className="mt-1 text-sm text-muted-foreground">Country, city, and office names.</p>
        </Link>
        <Link href="/admin/hr/shifts" className="rounded-xl border border-border/80 bg-card p-5 transition hover:border-accent/40">
          <Users className="h-5 w-5 text-accent" />
          <h2 className="mt-3 font-bold">Shifts &amp; assignments</h2>
          <p className="mt-1 text-sm text-muted-foreground">Assign Morning or Night at a location.</p>
        </Link>
        <Link href="/admin/hr/attendance" className="rounded-xl border border-border/80 bg-card p-5 transition hover:border-accent/40">
          <CalendarCheck className="h-5 w-5 text-accent" />
          <h2 className="mt-3 font-bold">Attendance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Daily check-in / out records.</p>
        </Link>
        {manage ? (
          <Link href="/admin/payroll" className="rounded-xl border border-border/80 bg-card p-5 transition hover:border-accent/40 sm:col-span-2 lg:col-span-3">
            <h2 className="font-bold">Related: Payroll</h2>
            <p className="mt-1 text-sm text-muted-foreground">Employee pay runs stay under Payroll (Phase 48/53). HR does not replace payroll delete.</p>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

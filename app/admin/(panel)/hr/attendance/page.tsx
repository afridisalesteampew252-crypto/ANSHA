'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canManageHr } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, AttendanceRecord, AttendanceStatus } from '@/lib/types';

type ProfileOpt = { id: string; full_name: string | null; email: string | null };
type Row = AttendanceRecord & { profile?: ProfileOpt | null };

export default function HrAttendancePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<ProfileOpt[]>([]);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [selfId, setSelfId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [userFilter, setUserFilter] = useState('all');
  const [newUserId, setNewUserId] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('present');
  const manage = canManageHr(role);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setSelfId(session.user.id);
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
      if (!newUserId) setNewUserId(session.user.id);
    }
    const [attRes, profRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('*')
        .gte('work_date', dateFrom)
        .order('work_date', { ascending: false })
        .limit(300),
      supabase.from('admin_profiles').select('id,full_name,email').eq('is_active', true).order('full_name'),
    ]);
    if (attRes.error) toast.error(attRes.error.message);
    const profs = (profRes.data || []) as ProfileOpt[];
    setProfiles(profs);
    const map = new Map(profs.map((p) => [p.id, p]));
    setRows(
      ((attRes.data || []) as AttendanceRecord[]).map((row) => ({
        ...row,
        profile: map.get(row.user_id) || null,
      }))
    );
    setLoading(false);
  }, [dateFrom, newUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (!manage && row.user_id !== selfId) return false;
      if (userFilter !== 'all' && row.user_id !== userFilter) return false;
      return true;
    });
  }, [manage, rows, selfId, userFilter]);

  const saveRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manage && newUserId !== selfId) return;
    setBusy(true);
    const { error } = await supabase.from('attendance_records').upsert(
      {
        user_id: newUserId,
        work_date: newDate,
        status: newStatus,
        recorded_by: selfId || null,
        check_in_at: newStatus === 'present' ? new Date(`${newDate}T09:00:00`).toISOString() : null,
      },
      { onConflict: 'user_id,work_date' }
    );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Attendance saved.');
    await load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">HR</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">Daily check-in / out and status. Ops can edit all; users can mark their own.</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="att-from">From date</Label>
            <Input id="att-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          {manage ? (
            <div className="space-y-1.5">
              <Label htmlFor="att-user-filter">User</Label>
              <select id="att-user-filter" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
                <option value="all">All users</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                ))}
              </select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={(e) => void saveRecord(e)} className="grid gap-3 sm:grid-cols-4">
            {manage ? (
              <div className="space-y-1.5">
                <Label htmlFor="att-new-user">User</Label>
                <select id="att-new-user" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} disabled={busy}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="att-new-date">Date</Label>
              <Input id="att-new-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="att-new-status">Status</Label>
              <select id="att-new-status" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={newStatus} onChange={(e) => setNewStatus(e.target.value as AttendanceStatus)} disabled={busy}>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="leave">Leave</option>
                <option value="remote">Remote</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="accent" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save record
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="min-w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Check in</th>
                <th className="px-3 py-2 font-semibold">Check out</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-border/60">
                  <td className="px-3 py-2 whitespace-nowrap">{row.work_date}</td>
                  <td className="px-3 py-2">{row.profile?.full_name || row.profile?.email || row.user_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 capitalize">{row.status}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.check_in_at ? format(new Date(row.check_in_at), 'HH:mm') : '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.check_out_at ? format(new Date(row.check_out_at), 'HH:mm') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No attendance rows in this range.</p> : null}
        </div>
      )}
    </div>
  );
}

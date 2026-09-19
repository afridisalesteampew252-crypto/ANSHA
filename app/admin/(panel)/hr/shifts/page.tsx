'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canManageHr } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, OfficeShift, ShiftAssignment, ShiftLocation } from '@/lib/types';

type ProfileOpt = { id: string; full_name: string | null; email: string | null };
type AssignmentRow = ShiftAssignment & {
  location?: ShiftLocation | null;
  profile?: ProfileOpt | null;
};

export default function HrShiftsPage() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [locations, setLocations] = useState<ShiftLocation[]>([]);
  const [profiles, setProfiles] = useState<ProfileOpt[]>([]);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [selfId, setSelfId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [shift, setShift] = useState<OfficeShift>('morning');
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const manage = canManageHr(role);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setSelfId(session.user.id);
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
    }
    const [asgRes, locRes, profRes] = await Promise.all([
      supabase.from('shift_assignments').select('*').order('effective_from', { ascending: false }).limit(200),
      supabase.from('shift_locations').select('*').eq('is_active', true).order('country'),
      supabase.from('admin_profiles').select('id,full_name,email').eq('is_active', true).order('full_name'),
    ]);
    if (asgRes.error) toast.error(asgRes.error.message);
    const locs = (locRes.data || []) as ShiftLocation[];
    const profs = (profRes.data || []) as ProfileOpt[];
    setLocations(locs);
    setProfiles(profs);
    const locMap = new Map(locs.map((l) => [l.id, l]));
    const profMap = new Map(profs.map((p) => [p.id, p]));
    // Also map inactive locations referenced by assignments
    const missingLocIds = Array.from(
      new Set((asgRes.data || []).map((a) => a.location_id).filter((id) => !locMap.has(id)))
    );
    if (missingLocIds.length) {
      const { data: more } = await supabase.from('shift_locations').select('*').in('id', missingLocIds);
      (more || []).forEach((l) => locMap.set(l.id, l as ShiftLocation));
    }
    setAssignments(
      ((asgRes.data || []) as ShiftAssignment[]).map((row) => ({
        ...row,
        location: locMap.get(row.location_id) || null,
        profile: profMap.get(row.user_id) || null,
      }))
    );
    if (!userId && session) setUserId(session.user.id);
    if (!locationId && locs[0]) setLocationId(locs[0].id);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (manage) return assignments;
    return assignments.filter((row) => row.user_id === selfId);
  }, [assignments, manage, selfId]);

  const assign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manage) return;
    setBusy(true);
    const { error } = await supabase.from('shift_assignments').insert({
      user_id: userId,
      location_id: locationId,
      shift,
      effective_from: from,
      created_by: selfId || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Shift assigned.');
    await load();
  };

  const endAssignment = async (row: AssignmentRow) => {
    if (!manage) return;
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('shift_assignments').update({ effective_to: today }).eq('id', row.id);
    if (error) return toast.error(error.message);
    toast.success('Assignment ended.');
    await load();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">HR</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Shifts &amp; assignments</h1>
        <p className="text-sm text-muted-foreground">Fixed office shifts: Morning and Night. Assign users to a location.</p>
      </div>

      {manage ? (
        <Card>
          <CardHeader><CardTitle className="text-lg">New assignment</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={(e) => void assign(e)} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="asg-user">User</Label>
                <select id="asg-user" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)} required disabled={busy}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email || p.id}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asg-loc">Location</Label>
                <select id="asg-loc" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)} required disabled={busy}>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{[l.office_name, l.city, l.country].filter(Boolean).join(' · ')}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asg-shift">Shift</Label>
                <select id="asg-shift" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={shift} onChange={(e) => setShift(e.target.value as OfficeShift)} disabled={busy}>
                  <option value="morning">Morning</option>
                  <option value="night">Night</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asg-from">Effective from</Label>
                <Input id="asg-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required disabled={busy} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="accent" disabled={busy || !locations.length}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Assign shift
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/80 bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{row.profile?.full_name || row.profile?.email || row.user_id}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold capitalize text-foreground/80">{row.shift}</span>
                  {' · '}
                  {[row.location?.office_name, row.location?.city, row.location?.country].filter(Boolean).join(', ') || 'Location'}
                  {' · from '}
                  {row.effective_from}
                  {row.effective_to ? ` → ${row.effective_to}` : ' (open)'}
                </p>
              </div>
              {manage && !row.effective_to ? (
                <Button variant="outline" size="sm" onClick={() => void endAssignment(row)}>End today</Button>
              ) : null}
            </div>
          ))}
          {visible.length === 0 ? <p className="text-sm text-muted-foreground">No assignments yet.</p> : null}
        </div>
      )}
    </div>
  );
}

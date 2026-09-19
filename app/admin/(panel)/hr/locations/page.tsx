'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canManageHr } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, ShiftLocation } from '@/lib/types';

export default function HrLocationsPage() {
  const [rows, setRows] = useState<ShiftLocation[]>([]);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [officeName, setOfficeName] = useState('');
  const manage = canManageHr(role);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: { session } }, locRes] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from('shift_locations').select('*').order('country').order('city'),
    ]);
    if (session) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
    }
    if (locRes.error) toast.error(locRes.error.message);
    setRows((locRes.data || []) as ShiftLocation[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manage) return;
    setBusy(true);
    const { error } = await supabase.from('shift_locations').insert({
      country: country.trim(),
      city: city.trim() || null,
      office_name: officeName.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Location added.');
    setCountry('');
    setCity('');
    setOfficeName('');
    await load();
  };

  const toggleActive = async (row: ShiftLocation) => {
    if (!manage) return;
    const { error } = await supabase.from('shift_locations').update({ is_active: !row.is_active }).eq('id', row.id);
    if (error) return toast.error(error.message);
    await load();
  };

  const remove = async (row: ShiftLocation) => {
    if (!manage || !window.confirm(`Remove ${row.office_name || row.city || row.country}?`)) return;
    const { error } = await supabase.from('shift_locations').delete().eq('id', row.id);
    if (error) return toast.error(error.message);
    toast.success('Location removed.');
    await load();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">HR</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Shift locations</h1>
        <p className="text-sm text-muted-foreground">Country plus optional city and office name.</p>
      </div>

      {manage ? (
        <Card>
          <CardHeader><CardTitle className="text-lg">Add location</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={(e) => void add(e)} className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="loc-country">Country</Label>
                <Input id="loc-country" required value={country} onChange={(e) => setCountry(e.target.value)} disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-city">City</Label>
                <Input id="loc-city" value={city} onChange={(e) => setCity(e.target.value)} disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-office">Office name</Label>
                <Input id="loc-office" value={officeName} onChange={(e) => setOfficeName(e.target.value)} disabled={busy} />
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" variant="accent" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add location
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
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/80 bg-card px-4 py-3">
              <MapPin className="h-4 w-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{row.office_name || row.city || row.country}</p>
                <p className="text-xs text-muted-foreground">
                  {[row.city, row.country].filter(Boolean).join(', ')}
                  {!row.is_active ? ' · inactive' : ''}
                </p>
              </div>
              {manage ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void toggleActive(row)}>
                    {row.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(row)} aria-label="Delete location">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">No locations yet.</p> : null}
        </div>
      )}
    </div>
  );
}

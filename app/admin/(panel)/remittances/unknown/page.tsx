'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Link2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { RemittanceSubNav } from '@/components/admin/remittance-sub-nav';
import { SearchableSelect, customerSelectOption } from '@/components/admin/searchable-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { canManageReceivables } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, Remittance, RemittanceOffice, RemittanceShift } from '@/lib/types';

type Customer = { id: string; full_name: string; company_name: string | null; customer_code?: string | null; phone?: string | null; email?: string | null };
type Staff = {
  id: string;
  full_name: string | null;
  email: string | null;
  office_id: string | null;
  shift_id: string | null;
};

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(Number(value || 0));

export default function UnknownRemittancesPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Remittance[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [offices, setOffices] = useState<RemittanceOffice[]>([]);
  const [shifts, setShifts] = useState<RemittanceShift[]>([]);
  const [unknownCount, setUnknownCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [shiftId, setShiftId] = useState('');

  const finance = canManageReceivables(role);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
      if (!canManageReceivables(prof?.role)) {
        setLoading(false);
        return;
      }
    }

    const [remRes, custRes, staffRes, officeRes, shiftRes, unknownRes] = await Promise.all([
      supabase
        .from('remittances')
        .select('*')
        .or('is_unknown.eq.true,status.eq.unknown')
        .order('received_date', { ascending: false }),
      supabase.from('customers').select('id,full_name,company_name,customer_code,phone,email').eq('is_active', true).order('company_name'),
      supabase.from('admin_profiles').select('id,full_name,email,office_id,shift_id').eq('is_active', true).order('full_name'),
      supabase.from('remittance_offices').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('remittance_shifts').select('*').eq('is_active', true).order('sort_order'),
      supabase.rpc('count_unknown_remittances'),
    ]);
    if (remRes.error) toast.error(remRes.error.message);
    setRows((remRes.data || []) as Remittance[]);
    setCustomers((custRes.data || []) as Customer[]);
    setStaff((staffRes.data || []) as Staff[]);
    setOffices((officeRes.data || []) as RemittanceOffice[]);
    setShifts((shiftRes.data || []) as RemittanceShift[]);
    setUnknownCount(Number(unknownRes.data || 0));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const customerOptions = useMemo(() => customers.map(customerSelectOption), [customers]);
  const staffOptions = useMemo(
    () =>
      staff.map((u) => ({
        value: u.id,
        label: u.full_name || u.email || u.id.slice(0, 8),
        keywords: [u.full_name, u.email],
      })),
    [staff]
  );
  const officeOptions = useMemo(
    () => offices.map((o) => ({ value: o.id, label: o.code ? `${o.name} (${o.code})` : o.name, keywords: [o.name, o.code] })),
    [offices]
  );
  const shiftOptions = useMemo(() => {
    const filtered = officeId ? shifts.filter((s) => !s.office_id || s.office_id === officeId) : shifts;
    return filtered.map((s) => ({
      value: s.id,
      label: s.hours_label ? `${s.name} — ${s.hours_label}` : s.name,
      keywords: [s.name, s.hours_label],
    }));
  }, [shifts, officeId]);

  const startLink = (row: Remittance) => {
    setLinkingId(row.id);
    setCustomerId(row.customer_id || '');
    setReceivedBy(row.received_by || '');
    setOfficeId(row.office_id || '');
    setShiftId(row.shift_id || '');
  };

  const submitLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!linkingId || !customerId) {
      toast.error('Select a customer to link.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('link_remittance', {
      p_remittance_id: linkingId,
      p_customer_id: customerId,
      p_received_by: receivedBy || null,
      p_office_id: officeId || null,
      p_shift_id: shiftId || null,
      p_status: 'pending',
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Remittance linked.');
    setLinkingId(null);
    await load();
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!finance) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">Unknown TTS queue is finance-only.</p>
        <Button asChild><Link href="/admin/remittances/mine">My remittances</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Remittances</p>
        <h1 className="text-2xl font-black tracking-tight">Unknown TTS</h1>
        <p className="text-sm text-muted-foreground">
          Unmatched bank transfers — link a customer and user. Office/shift come from the user&apos;s profile (override optional).
        </p>
        <RemittanceSubNav canManageFinance unknownCount={unknownCount} />
      </div>

      {linkingId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Link remittance</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitLink} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Customer *</Label>
                <SearchableSelect
                  value={customerId}
                  onValueChange={setCustomerId}
                  options={customerOptions}
                  placeholder="Select customer"
                  searchPlaceholder="Search customer…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Linked user</Label>
                <SearchableSelect
                  value={receivedBy}
                  onValueChange={(v) => {
                    const profile = staff.find((u) => u.id === v);
                    setReceivedBy(v);
                    setOfficeId(profile?.office_id || '');
                    setShiftId(profile?.shift_id || '');
                  }}
                  options={staffOptions}
                  placeholder="Staff who received"
                  searchPlaceholder="Search staff…"
                  clearLabel="No user"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Office</Label>
                <SearchableSelect
                  value={officeId}
                  onValueChange={(v) => {
                    setOfficeId(v);
                    setShiftId('');
                  }}
                  options={officeOptions}
                  placeholder="From linked user"
                  clearLabel="No office"
                />
                <p className="text-xs text-muted-foreground">Defaults from the linked user; override if needed.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Shift</Label>
                <SearchableSelect
                  value={shiftId}
                  onValueChange={setShiftId}
                  options={shiftOptions}
                  placeholder="From linked user"
                  clearLabel="No shift"
                />
              </div>
              <div className="flex items-center gap-2 md:col-span-2 xl:col-span-3">
                <Button disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Save link</Button>
                <Button type="button" variant="outline" onClick={() => setLinkingId(null)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-4">Record</th>
                <th className="p-4">TTS / reference</th>
                <th className="p-4">Date</th>
                <th className="p-4 text-right">Amount</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-4 font-semibold">{row.remittance_number}</td>
                  <td className="p-4">
                    {row.bank_reference || '—'}
                    <p className="text-xs text-muted-foreground">{row.customer_name}</p>
                  </td>
                  <td className="p-4">{row.received_date}</td>
                  <td className="p-4 text-right font-semibold">{money(row.amount, row.currency)}</td>
                  <td className="p-4 text-right">
                    <Button variant="outline" size="sm" onClick={() => startLink(row)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Link
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground">No unknown remittances.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

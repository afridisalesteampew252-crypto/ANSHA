'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Loader2, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { RemittanceSubNav } from '@/components/admin/remittance-sub-nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canManageReceivables } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, Remittance, RemittanceAllocation, RemittanceOffice } from '@/lib/types';

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

type OfficeBreakdownRow = {
  officeKey: string;
  officeName: string;
  currency: string;
  received: number;
  allocated: number;
  unallocated: number;
  count: number;
};

export default function RemittancesDashboardPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [allocations, setAllocations] = useState<RemittanceAllocation[]>([]);
  const [offices, setOffices] = useState<RemittanceOffice[]>([]);
  const [unknownCount, setUnknownCount] = useState(0);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

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

    const [remRes, allocRes, officeRes, unknownRes] = await Promise.all([
      supabase
        .from('remittances')
        .select('id,amount,currency,status,is_unknown,office_id,received_date,customer_id')
        .gte('received_date', fromDate)
        .lte('received_date', toDate)
        .order('received_date', { ascending: false }),
      supabase.from('remittance_allocations').select('id,remittance_id,amount'),
      supabase.from('remittance_offices').select('*').order('sort_order').order('name'),
      supabase.rpc('count_unknown_remittances'),
    ]);

    if (remRes.error) toast.error(remRes.error.message);
    if (allocRes.error) toast.error(allocRes.error.message);
    setRemittances((remRes.data || []) as Remittance[]);
    setAllocations((allocRes.data || []) as RemittanceAllocation[]);
    setOffices((officeRes.data || []) as RemittanceOffice[]);
    setUnknownCount(Number(unknownRes.data || 0));
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const allocatedByRemittance = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of allocations) {
      map[row.remittance_id] = (map[row.remittance_id] || 0) + Number(row.amount);
    }
    return map;
  }, [allocations]);

  const summary = useMemo(() => {
    const received = remittances.filter((r) => r.status === 'confirmed' || r.status === 'pending' || r.status === 'unknown');
    const byCurrency: Record<string, { received: number; allocated: number; unallocated: number }> = {};
    for (const row of received) {
      const cur = row.currency || 'AED';
      if (!byCurrency[cur]) byCurrency[cur] = { received: 0, allocated: 0, unallocated: 0 };
      const amt = Number(row.amount);
      const alloc = Math.min(amt, allocatedByRemittance[row.id] || 0);
      byCurrency[cur].received += amt;
      byCurrency[cur].allocated += alloc;
      byCurrency[cur].unallocated += Math.max(0, amt - alloc);
    }
    return {
      count: remittances.length,
      unknownInRange: remittances.filter((r) => r.is_unknown || r.status === 'unknown').length,
      byCurrency,
    };
  }, [remittances, allocatedByRemittance]);

  const officeBreakdown = useMemo(() => {
    const officeName = (id: string | null) => {
      if (!id) return 'Unassigned';
      return offices.find((o) => o.id === id)?.name || 'Unknown office';
    };
    const map = new Map<string, OfficeBreakdownRow>();
    for (const row of remittances) {
      if (row.status === 'rejected' || row.status === 'reversed') continue;
      const officeKey = row.office_id || '__none__';
      const currency = row.currency || 'AED';
      const key = `${officeKey}::${currency}`;
      const amt = Number(row.amount);
      const alloc = Math.min(amt, allocatedByRemittance[row.id] || 0);
      const existing = map.get(key);
      if (existing) {
        existing.received += amt;
        existing.allocated += alloc;
        existing.unallocated += Math.max(0, amt - alloc);
        existing.count += 1;
      } else {
        map.set(key, {
          officeKey,
          officeName: officeName(row.office_id),
          currency,
          received: amt,
          allocated: alloc,
          unallocated: Math.max(0, amt - alloc),
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.officeName === b.officeName) return a.currency.localeCompare(b.currency);
      if (a.officeName === 'Unassigned') return 1;
      if (b.officeName === 'Unassigned') return -1;
      return a.officeName.localeCompare(b.officeName);
    });
  }, [remittances, allocations, offices, allocatedByRemittance]);

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
        <p className="text-sm text-muted-foreground">Remittance dashboard is for accounts and ops. View remittances tagged to you instead.</p>
        <Button asChild><Link href="/admin/remittances/mine">My remittances</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Remittances</p>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <WalletCards className="h-6 w-6 text-accent" />
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Received, allocated, and unallocated funds — plus office-wise totals by currency.
            </p>
          </div>
          <Button asChild><Link href="/admin/remittances">Receive remittance</Link></Button>
        </div>
        <RemittanceSubNav canManageFinance unknownCount={unknownCount} />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={() => void load()}>Refresh</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Records in range</p>
            <p className="mt-1 text-2xl font-bold">{summary.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Unknown TTS (all)</p>
            <p className="mt-1 text-2xl font-bold">{unknownCount}</p>
            <p className="text-xs text-muted-foreground">{summary.unknownInRange} in date range</p>
          </CardContent>
        </Card>
        {Object.entries(summary.byCurrency).slice(0, 2).map(([currency, totals]) => (
          <Card key={currency}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Received {currency}</p>
              <p className="mt-1 text-2xl font-bold">{money(totals.received, currency)}</p>
              <p className="text-xs text-muted-foreground">
                Alloc {money(totals.allocated, currency)} · Unalloc {money(totals.unallocated, currency)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5 text-accent" />
            Office-wise breakdown
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Totals per office and currency for the selected dates (no FX conversion — amounts stay in received currency).
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-4">Office</th>
                <th className="p-4">Currency</th>
                <th className="p-4 text-right">Records</th>
                <th className="p-4 text-right">Received</th>
                <th className="p-4 text-right">Allocated</th>
                <th className="p-4 text-right">Unallocated</th>
              </tr>
            </thead>
            <tbody>
              {officeBreakdown.map((row) => (
                <tr key={`${row.officeKey}-${row.currency}`} className="border-t">
                  <td className="p-4 font-semibold">{row.officeName}</td>
                  <td className="p-4">{row.currency}</td>
                  <td className="p-4 text-right">{row.count}</td>
                  <td className="p-4 text-right font-semibold">{money(row.received, row.currency)}</td>
                  <td className="p-4 text-right">{money(row.allocated, row.currency)}</td>
                  <td className="p-4 text-right">{money(row.unallocated, row.currency)}</td>
                </tr>
              ))}
              {officeBreakdown.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    No remittances in this date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

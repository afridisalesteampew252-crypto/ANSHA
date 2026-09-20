'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Banknote, CheckCircle2, Loader2, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ClaimCommissionDialog } from '@/components/admin/claim-commission-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { isAccountsRole, isFieldAgentRole } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, CommissionClaim, CommissionClaimStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

type ClaimRow = CommissionClaim & {
  claimant_name?: string | null;
  vehicle_title?: string | null;
  part_name?: string | null;
};

type SoldOption = {
  id: string;
  kind: 'vehicle' | 'part';
  label: string;
  currency: string;
};

const STATUS_BADGE: Record<CommissionClaimStatus, string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  approved: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  paid: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  rejected: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200',
};

const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: currency || 'AED',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
};

export default function AdminCommissionsPage() {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CommissionClaimStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [soldOptions, setSoldOptions] = useState<SoldOption[]>([]);
  const [claimStockId, setClaimStockId] = useState('');
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);

  const fieldAgent = isFieldAgentRole(role);
  const canReview = role === 'admin' || role === 'staff' || isAccountsRole(role);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    setUserId(session.user.id);

    const { data: prof } = await supabase
      .from('admin_profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle();
    const nextRole = (prof?.role as AdminRole) || null;
    setRole(nextRole);
    const isField = isFieldAgentRole(nextRole);

    let claimsQuery = supabase
      .from('commission_claims')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (isField) claimsQuery = claimsQuery.eq('claimant_id', session.user.id);

    const [claimsRes, profilesRes, vehiclesRes, partsRes] = await Promise.all([
      claimsQuery,
      supabase.from('admin_profiles').select('id,full_name,email').limit(500),
      isField
        ? supabase
            .from('vehicles')
            .select('id,title,currency,stock_status,reserved_by,sold_by,reservation_requester_name')
            .eq('stock_status', 'sold')
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
      isField
        ? supabase
            .from('parts')
            .select('id,name,currency,stock_status,reserved_by,sold_by,reservation_requester_name')
            .eq('stock_status', 'sold')
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (claimsRes.error) toast.error(claimsRes.error.message);

    const nameMap: Record<string, string> = {};
    for (const row of profilesRes.data || []) {
      nameMap[row.id] = row.full_name || row.email || row.id.slice(0, 8);
    }

    const vehicleIds = Array.from(
      new Set((claimsRes.data || []).map((c) => c.vehicle_id).filter(Boolean))
    ) as string[];
    const partIds = Array.from(
      new Set((claimsRes.data || []).map((c) => c.part_id).filter(Boolean))
    ) as string[];

    const [vTitles, pTitles] = await Promise.all([
      vehicleIds.length
        ? supabase.from('vehicles').select('id,title').in('id', vehicleIds)
        : Promise.resolve({ data: [], error: null }),
      partIds.length
        ? supabase.from('parts').select('id,name').in('id', partIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const vehicleTitle: Record<string, string> = {};
    for (const v of vTitles.data || []) vehicleTitle[v.id] = v.title;
    const partName: Record<string, string> = {};
    for (const p of pTitles.data || []) partName[p.id] = p.name;

    setClaims(
      ((claimsRes.data || []) as CommissionClaim[]).map((row) => ({
        ...row,
        claimant_name: nameMap[row.claimant_id] || row.claimant_id.slice(0, 8),
        vehicle_title: row.vehicle_id ? vehicleTitle[row.vehicle_id] || null : null,
        part_name: row.part_id ? partName[row.part_id] || null : null,
      }))
    );

    if (isField) {
      const myName = nameMap[session.user.id]?.toLowerCase() || '';
      const opts: SoldOption[] = [];
      for (const v of vehiclesRes.data || []) {
        const eligible =
          v.reserved_by === session.user.id ||
          v.sold_by === session.user.id ||
          (v.reservation_requester_name &&
            v.reservation_requester_name.trim().toLowerCase() === myName);
        if (!eligible) continue;
        opts.push({
          id: `vehicle:${v.id}`,
          kind: 'vehicle',
          label: v.title,
          currency: v.currency || 'AED',
        });
      }
      for (const p of partsRes.data || []) {
        const eligible =
          p.reserved_by === session.user.id ||
          p.sold_by === session.user.id ||
          (p.reservation_requester_name &&
            p.reservation_requester_name.trim().toLowerCase() === myName);
        if (!eligible) continue;
        opts.push({
          id: `part:${p.id}`,
          kind: 'part',
          label: p.name,
          currency: p.currency || 'AED',
        });
      }
      setSoldOptions(opts);
    } else {
      setSoldOptions([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!q) return true;
      return [
        row.claimant_name,
        row.vehicle_title,
        row.part_name,
        row.currency,
        row.status,
        row.claim_notes,
        String(row.amount),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [claims, query, statusFilter]);

  const selectedSold = soldOptions.find((o) => o.id === claimStockId) || null;

  async function review(claimId: string, status: CommissionClaimStatus) {
    setBusyId(claimId);
    const { error } = await supabase.rpc('review_commission_claim', {
      p_claim_id: claimId,
      p_status: status,
      p_review_notes: null,
    });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(`Claim marked ${status}.`);
    await load();
  }

  async function submitClaim(payload: { amount: number; currency: string; notes: string }) {
    if (!selectedSold) return;
    setClaimBusy(true);
    const { error } = await supabase.rpc('claim_stock_commission', {
      p_amount: payload.amount,
      p_currency: payload.currency,
      p_vehicle_id: selectedSold.kind === 'vehicle' ? selectedSold.id.replace('vehicle:', '') : null,
      p_part_id: selectedSold.kind === 'part' ? selectedSold.id.replace('part:', '') : null,
      p_invoice_id: null,
      p_notes: payload.notes || null,
      p_claimant_id: null,
    });
    setClaimBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Commission claim submitted.');
    setClaimOpen(false);
    setClaimStockId('');
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Sales</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Commissions</h1>
          <p className="text-sm text-muted-foreground">
            {fieldAgent
              ? 'Claim commission on stock you reserved, requested, or marked sold.'
              : canReview
                ? 'Review and pay sales commission claims.'
                : 'View commission claims for your team.'}
          </p>
        </div>
        {fieldAgent ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Sold stock
              <select
                value={claimStockId}
                onChange={(e) => setClaimStockId(e.target.value)}
                className="mt-1 block h-10 min-w-[14rem] rounded-md border bg-background px-3 text-sm text-foreground"
              >
                <option value="">Select sold item…</option>
                {soldOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.kind === 'vehicle' ? 'Vehicle' : 'Part'}: {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="accent"
              disabled={!claimStockId}
              onClick={() => setClaimOpen(true)}
            >
              <Banknote className="h-4 w-4" />
              Claim
            </Button>
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader className="space-y-3 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Claims</CardTitle>
              <CardDescription>
                {filtered.length} of {claims.length}
                {userId && fieldAgent ? ' · your claims only' : ''}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search claims…"
                  className="pl-8"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | CommissionClaimStatus)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 p-2 sm:p-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <Banknote className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">No commission claims yet.</p>
              {fieldAgent ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Or claim from a sold vehicle/part Actions menu.
                </p>
              ) : null}
            </div>
          ) : (
            filtered.map((row) => {
              const stockLabel = row.vehicle_title || row.part_name || 'Stock item';
              const stockHref = row.vehicle_id
                ? `/admin/vehicles`
                : row.part_id
                  ? `/admin/parts`
                  : null;
              const reviewing = busyId === row.id;
              return (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={cn('font-normal', STATUS_BADGE[row.status])}>
                        {row.status}
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums">
                        {money(Number(row.amount), row.currency)}
                      </span>
                    </div>
                    <p className="truncate text-sm font-medium">{stockLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.claimant_name}
                      {' · '}
                      {new Date(row.created_at).toLocaleDateString()}
                      {row.claim_notes ? ` · ${row.claim_notes}` : ''}
                    </p>
                    {stockHref && !fieldAgent ? (
                      <Link href={stockHref} className="text-xs text-primary hover:underline">
                        Open inventory
                      </Link>
                    ) : null}
                  </div>
                  {canReview && row.status === 'pending' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busyId}
                        onClick={() => void review(row.id, 'approved')}
                      >
                        {reviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="accent"
                        disabled={!!busyId}
                        onClick={() => void review(row.id, 'paid')}
                      >
                        Mark paid
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={!!busyId}
                        onClick={() => void review(row.id, 'rejected')}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  ) : null}
                  {canReview && row.status === 'approved' ? (
                    <Button
                      size="sm"
                      variant="accent"
                      disabled={!!busyId}
                      onClick={() => void review(row.id, 'paid')}
                    >
                      {reviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Mark paid
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <ClaimCommissionDialog
        open={claimOpen}
        onOpenChange={(open) => {
          if (!claimBusy) setClaimOpen(open);
        }}
        title={selectedSold?.label || ''}
        defaultCurrency={selectedSold?.currency}
        busy={claimBusy}
        onSubmit={submitClaim}
      />
    </div>
  );
}

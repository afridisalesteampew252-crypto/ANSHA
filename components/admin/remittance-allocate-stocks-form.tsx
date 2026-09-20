'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/admin/searchable-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import type { Remittance } from '@/lib/types';
import { cn } from '@/lib/utils';

type StockTarget = {
  vehicleId: string;
  stockNumber: string | null;
  chassisNumber: string | null;
  title: string | null;
  invoiceId: string;
  invoiceNumber: string;
  soldPrice: number;
  balanceDue: number;
  currency: string;
};

type AllocRow = {
  key: string;
  vehicleId: string;
  mode: 'amt' | 'pct';
  amount: string;
  percent: string;
};

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: currency || 'AED',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatPlain = (value: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

function newRow(): AllocRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    vehicleId: '',
    mode: 'amt',
    amount: '',
    percent: '',
  };
}

type Props = {
  remittance: Remittance;
  alreadyAllocated: number;
  onClose: () => void;
  onAllocated: () => Promise<void> | void;
};

export function RemittanceAllocateStocksForm({ remittance, alreadyAllocated, onClose, onAllocated }: Props) {
  const totalAvailable = Math.max(0, Number(remittance.amount) - Number(alreadyAllocated || 0));
  const [targets, setTargets] = useState<StockTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [allocateTo, setAllocateTo] = useState<'stock'>('stock');
  const [rows, setRows] = useState<AllocRow[]>([newRow()]);

  const loadTargets = useCallback(async () => {
    if (!remittance.customer_id) {
      setTargets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('id,invoice_number,currency,balance_due,total_amount,status')
      .eq('customer_id', remittance.customer_id)
      .eq('currency', remittance.currency)
      .gt('balance_due', 0)
      .neq('status', 'cancelled')
      .order('issue_date', { ascending: false });

    if (invError) {
      toast.error(invError.message);
      setTargets([]);
      setLoading(false);
      return;
    }

    const invoiceRows = invoices || [];
    if (invoiceRows.length === 0) {
      setTargets([]);
      setLoading(false);
      return;
    }

    const { data: items, error: itemError } = await supabase
      .from('invoice_items')
      .select('invoice_id,vehicle_id,line_total,inventory_reference')
      .in(
        'invoice_id',
        invoiceRows.map((row) => row.id)
      )
      .not('vehicle_id', 'is', null);

    if (itemError) {
      toast.error(itemError.message);
      setTargets([]);
      setLoading(false);
      return;
    }

    const vehicleIds = Array.from(
      new Set((items || []).map((row) => row.vehicle_id).filter((id): id is string => Boolean(id)))
    );
    if (vehicleIds.length === 0) {
      setTargets([]);
      setLoading(false);
      return;
    }

    const { data: vehicles, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id,stock_number,chassis_number,title')
      .in('id', vehicleIds);

    if (vehicleError) {
      toast.error(vehicleError.message);
      setTargets([]);
      setLoading(false);
      return;
    }

    const invoiceById = new Map(invoiceRows.map((row) => [row.id, row]));
    const vehicleById = new Map((vehicles || []).map((row) => [row.id, row]));
    const byVehicle = new Map<string, StockTarget>();

    for (const item of items || []) {
      if (!item.vehicle_id) continue;
      const invoice = invoiceById.get(item.invoice_id);
      const vehicle = vehicleById.get(item.vehicle_id);
      if (!invoice || !vehicle) continue;
      const existing = byVehicle.get(item.vehicle_id);
      // Prefer the open invoice with the highest remaining balance for this stock.
      if (existing && Number(existing.balanceDue) >= Number(invoice.balance_due)) continue;
      byVehicle.set(item.vehicle_id, {
        vehicleId: item.vehicle_id,
        stockNumber: vehicle.stock_number,
        chassisNumber: vehicle.chassis_number,
        title: vehicle.title,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        soldPrice: Number(invoice.total_amount || 0),
        balanceDue: Number(invoice.balance_due || 0),
        currency: invoice.currency,
      });
    }

    setTargets(
      Array.from(byVehicle.values()).sort((a, b) =>
        String(a.stockNumber || a.chassisNumber || '').localeCompare(String(b.stockNumber || b.chassisNumber || ''))
      )
    );
    setLoading(false);
  }, [remittance.customer_id, remittance.currency]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  const targetByVehicle = useMemo(() => new Map(targets.map((row) => [row.vehicleId, row])), [targets]);

  const stockIdOptions = useMemo(
    () =>
      targets.map((row) => ({
        value: row.vehicleId,
        label: row.stockNumber || row.chassisNumber || row.vehicleId.slice(0, 8),
        keywords: [row.stockNumber, row.chassisNumber, row.title, row.invoiceNumber],
      })),
    [targets]
  );

  const chassisOptions = useMemo(
    () =>
      targets.map((row) => ({
        value: row.vehicleId,
        label: row.chassisNumber || row.stockNumber || row.vehicleId.slice(0, 8),
        keywords: [row.chassisNumber, row.stockNumber, row.title, row.invoiceNumber],
      })),
    [targets]
  );

  const rowAmount = (row: AllocRow) => {
    if (row.mode === 'pct') {
      const pct = Number(row.percent);
      if (!(pct > 0)) return 0;
      return Math.round(((totalAvailable * pct) / 100) * 100) / 100;
    }
    return Number(row.amount) || 0;
  };

  const allocatedDraft = rows.reduce((sum, row) => sum + rowAmount(row), 0);
  const remaining = Math.round((totalAvailable - allocatedDraft) * 100) / 100;

  const reset = () => setRows([newRow()]);

  const updateRow = (key: string, patch: Partial<AllocRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const selectVehicle = (key: string, vehicleId: string) => {
    const target = targetByVehicle.get(vehicleId);
    const availableForRow = Math.max(0, remaining + rowAmount(rows.find((r) => r.key === key) || newRow()));
    const suggested = target ? Math.min(availableForRow, target.balanceDue) : 0;
    updateRow(key, {
      vehicleId,
      mode: 'amt',
      amount: suggested > 0 ? String(suggested) : '',
      percent: '',
    });
  };

  const submit = async () => {
    if (!remittance.customer_id) {
      toast.error('Link a customer before allocating.');
      return;
    }
    if (remittance.status !== 'confirmed' || remittance.is_unknown) {
      toast.error('Only confirmed, known remittances can be allocated.');
      return;
    }
    if (!(totalAvailable > 0)) {
      toast.error('No remaining balance on this remittance.');
      return;
    }

    const planned = rows
      .map((row) => {
        const target = targetByVehicle.get(row.vehicleId);
        const amount = rowAmount(row);
        return target && amount > 0 ? { row, target, amount } : null;
      })
      .filter((entry): entry is { row: AllocRow; target: StockTarget; amount: number } => Boolean(entry));

    if (planned.length === 0) {
      toast.error('Add at least one stock row with an allocate amount.');
      return;
    }

    const total = planned.reduce((sum, entry) => sum + entry.amount, 0);
    if (total - totalAvailable > 0.009) {
      toast.error('Allocation exceeds the available remittance balance.');
      return;
    }

    const seenVehicles = new Set<string>();
    const seenInvoices = new Set<string>();
    for (const entry of planned) {
      if (seenVehicles.has(entry.target.vehicleId)) {
        toast.error('Each stock can only appear once per allocation.');
        return;
      }
      if (seenInvoices.has(entry.target.invoiceId)) {
        toast.error('Two rows point at the same invoice — combine amounts into one stock row.');
        return;
      }
      if (entry.amount - entry.target.balanceDue > 0.009) {
        toast.error(`Amount exceeds balance on ${entry.target.invoiceNumber}.`);
        return;
      }
      seenVehicles.add(entry.target.vehicleId);
      seenInvoices.add(entry.target.invoiceId);
    }

    setBusy(true);
    try {
      for (const entry of planned) {
        const { error } = await supabase.rpc('allocate_remittance', {
          p_remittance_id: remittance.id,
          p_invoice_id: entry.target.invoiceId,
          p_amount: entry.amount,
        });
        if (error) throw new Error(error.message);
      }
      toast.success(
        planned.length === 1
          ? `Allocated ${money(planned[0].amount, remittance.currency)} to stock.`
          : `Allocated ${money(total, remittance.currency)} across ${planned.length} stocks.`
      );
      await onAllocated();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Allocation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-accent/30">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Allocate</p>
            <CardTitle className="text-lg">
              {remittance.remittance_number} · {remittance.customer_name}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Apply remaining funds to open invoices linked to stock for this customer.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </div>
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="alloc-to">Allocate To *</Label>
          <select
            id="alloc-to"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={allocateTo}
            onChange={(event) => setAllocateTo(event.target.value as 'stock')}
            disabled={busy}
          >
            <option value="stock">Stock</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground">Allocate To Stocks</h3>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || loading}
              onClick={() => setRows((current) => [...current, newRow()])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add More
            </Button>
          </div>
          <div className="text-right text-sm">
            <p>
              Total Available:{' '}
              <span className="font-semibold text-rose-600">{formatPlain(totalAvailable)}</span>
            </p>
            <p>
              Remaining:{' '}
              <span className={cn('font-semibold', remaining === 0 ? 'text-emerald-600' : remaining < 0 ? 'text-rose-600' : 'text-foreground')}>
                {formatPlain(remaining)}
              </span>
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : targets.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            No open stock invoices for this customer in {remittance.currency}. Create or reopen an invoice that
            includes a vehicle line, then allocate again.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((row, index) => {
              const target = targetByVehicle.get(row.vehicleId);
              const amountValue = rowAmount(row);
              return (
                <div
                  key={row.key}
                  className="grid gap-3 rounded-lg border bg-secondary/20 p-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto]"
                >
                  <div className="space-y-1.5">
                    <Label>Stock ID *</Label>
                    <SearchableSelect
                      value={row.vehicleId}
                      onValueChange={(value) => selectVehicle(row.key, value)}
                      options={stockIdOptions}
                      placeholder="Search stock ID"
                      searchPlaceholder="Stock ID, chassis…"
                      disabled={busy}
                      size="sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Chassis No.</Label>
                    <SearchableSelect
                      value={row.vehicleId}
                      onValueChange={(value) => selectVehicle(row.key, value)}
                      options={chassisOptions}
                      placeholder="Search chassis no."
                      searchPlaceholder="Chassis, stock ID…"
                      disabled={busy}
                      size="sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Allocate Amount *</Label>
                      <div className="inline-flex overflow-hidden rounded-md border text-[11px] font-semibold">
                        <button
                          type="button"
                          className={cn(
                            'px-2 py-0.5',
                            row.mode === 'amt' ? 'bg-rose-600 text-white' : 'bg-background text-muted-foreground'
                          )}
                          onClick={() =>
                            updateRow(row.key, {
                              mode: 'amt',
                              amount: amountValue > 0 ? String(amountValue) : row.amount,
                              percent: '',
                            })
                          }
                          disabled={busy}
                        >
                          Amt
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'px-2 py-0.5',
                            row.mode === 'pct' ? 'bg-rose-600 text-white' : 'bg-background text-muted-foreground'
                          )}
                          onClick={() => {
                            const pct =
                              totalAvailable > 0 && amountValue > 0
                                ? String(Math.round((amountValue / totalAvailable) * 10000) / 100)
                                : row.percent;
                            updateRow(row.key, { mode: 'pct', percent: pct, amount: '' });
                          }}
                          disabled={busy}
                        >
                          %
                        </button>
                      </div>
                    </div>
                    {row.mode === 'pct' ? (
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={row.percent}
                        disabled={busy || !row.vehicleId}
                        onChange={(event) => updateRow(row.key, { percent: event.target.value })}
                        placeholder="%"
                      />
                    ) : (
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.amount}
                        disabled={busy || !row.vehicleId}
                        onChange={(event) => updateRow(row.key, { amount: event.target.value })}
                        placeholder="0.00"
                      />
                    )}
                    {row.mode === 'pct' && amountValue > 0 ? (
                      <p className="text-[11px] text-muted-foreground">= {formatPlain(amountValue)}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sold Price</Label>
                    <Input
                      readOnly
                      disabled
                      value={target ? formatPlain(target.soldPrice) : ''}
                      className="bg-muted/60"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Balance Amount</Label>
                    <Input
                      readOnly
                      disabled
                      value={target ? formatPlain(target.balanceDue) : ''}
                      className="bg-muted/60"
                    />
                    {target ? (
                      <p className="text-[11px] text-muted-foreground">{target.invoiceNumber}</p>
                    ) : null}
                  </div>
                  <div className="flex items-end justify-end pb-0.5">
                    {rows.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        disabled={busy}
                        aria-label={`Remove allocation row ${index + 1}`}
                        onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="h-9 w-9" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={reset}>
            Reset
          </Button>
          <Button
            type="button"
            className="bg-rose-600 text-white hover:bg-rose-700"
            disabled={busy || loading || targets.length === 0 || remaining < -0.009}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Allocate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

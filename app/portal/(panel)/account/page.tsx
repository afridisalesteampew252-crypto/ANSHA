'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Banknote, CheckCircle2, Loader2, ReceiptText, ShoppingBag, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MoneyBreakdown } from '@/components/money-breakdown';
import { addToCurrencyMap } from '@/lib/money';
import { supabase } from '@/lib/supabase/client';

type SoaSummary = {
  currency: string;
  total_invoiced: number;
  total_allocated: number;
  outstanding: number;
  available_funds: number;
};

type SoaInvoice = {
  id: string;
  invoice_number: string;
  document_type: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  status: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
};

type SoaRemittance = {
  id: string;
  remittance_number: string;
  received_date: string;
  amount: number;
  currency: string;
  method: string;
  bank_reference: string | null;
  allocated_amount: number;
  available_amount: number;
};

type SoaAllocation = {
  id: string;
  remittance_id: string;
  remittance_number: string;
  invoice_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  created_at: string;
};

type SoaBuying = {
  id: string;
  source: 'reservation' | 'invoice' | string;
  inventory_type: string | null;
  description: string;
  inventory_reference: string | null;
  quantity: number;
  line_total: number;
  currency: string;
  stock_status: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
};

type SoaPayload = {
  summary: SoaSummary;
  invoices: SoaInvoice[];
  remittances: SoaRemittance[];
  allocations: SoaAllocation[];
  buying?: SoaBuying[];
};

const money = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

const receivableDocument = (type: string) => type === 'tax_invoice' || type === 'commercial_invoice';

function PortalAccountInner() {
  const [data, setData] = useState<SoaPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: payload, error } = await supabase.rpc('get_my_customer_soa');
    if (error) {
      toast.error(error.message);
      setData(null);
    } else {
      setData(payload as SoaPayload);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.summary;
  const invoices = data?.invoices || [];
  const remittances = data?.remittances || [];
  const allocations = data?.allocations || [];
  const buying = data?.buying || [];
  const fallbackCurrency = summary?.currency || 'AED';

  // Build per-currency KPIs from line data so mixed books never sum AED+USD as one total.
  const soaTotals = useMemo(() => {
    const invoiced: Record<string, number> = {};
    const allocated: Record<string, number> = {};
    const outstanding: Record<string, number> = {};
    const available: Record<string, number> = {};

    for (const row of invoices) {
      if (!receivableDocument(row.document_type)) continue;
      addToCurrencyMap(invoiced, row.currency, Number(row.total_amount || 0));
      addToCurrencyMap(outstanding, row.currency, Number(row.balance_due || 0));
    }
    for (const row of allocations) {
      addToCurrencyMap(allocated, row.currency, Number(row.amount || 0));
    }
    for (const row of remittances) {
      addToCurrencyMap(available, row.currency, Number(row.available_amount || 0));
    }

    return { invoiced, allocated, outstanding, available };
  }, [allocations, invoices, remittances]);

  const ledger = useMemo(() => {
    const rows: Array<{
      key: string;
      date: string;
      reference: string;
      href?: string;
      type: string;
      debit: number;
      credit: number;
      balance: number;
      currency: string;
    }> = [];

    for (const invoice of invoices) {
      const debit = receivableDocument(invoice.document_type) ? Number(invoice.total_amount) : 0;
      rows.push({
        key: `inv-${invoice.id}`,
        date: invoice.issue_date,
        reference: invoice.invoice_number,
        href: `/portal/invoices/${invoice.id}`,
        type: invoice.document_type.replaceAll('_', ' '),
        debit,
        credit: Number(invoice.amount_paid),
        balance: Number(invoice.balance_due),
        currency: invoice.currency,
      });
    }

    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [invoices]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!summary) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Unable to load your account statement. Try again later.
        </CardContent>
      </Card>
    );
  }

  const cards = [
    { label: 'Receivable invoices', amounts: soaTotals.invoiced, icon: ReceiptText },
    { label: 'Payments allocated', amounts: soaTotals.allocated, icon: CheckCircle2 },
    { label: 'Outstanding balance', amounts: soaTotals.outstanding, icon: WalletCards },
    { label: 'Unallocated remittance', amounts: soaTotals.available, icon: Banknote },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account statement</h1>
        <p className="text-sm text-muted-foreground">
          Read-only summary of your invoices, confirmed remittances, and how payments were applied.
          Balances are listed per currency — amounts are not converted.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, amounts, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-start justify-between gap-3 p-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">{label}</p>
                <div className="mt-1.5">
                  <MoneyBreakdown amounts={amounts} emptyCurrency={fallbackCurrency} size="md" />
                </div>
              </div>
              <span className="rounded-xl bg-primary/10 p-3 text-primary">
                <Icon className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Statement ledger</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ledger.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No documents on your statement yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4">Reference</th>
                    <th className="p-4">Type</th>
                    <th className="p-4 text-right">Debit</th>
                    <th className="p-4 text-right">Credit</th>
                    <th className="p-4 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row) => (
                    <tr key={row.key} className="border-t">
                      <td className="p-4">{format(new Date(row.date), 'dd MMM yyyy')}</td>
                      <td className="p-4">
                        {row.href ? (
                          <Link href={row.href} className="font-semibold text-primary hover:underline">
                            {row.reference}
                          </Link>
                        ) : (
                          <span className="font-semibold">{row.reference}</span>
                        )}
                      </td>
                      <td className="p-4 capitalize">{row.type}</td>
                      <td className="p-4 text-right">{row.debit ? money(row.debit, row.currency) : '—'}</td>
                      <td className="p-4 text-right">{row.credit ? money(row.credit, row.currency) : '—'}</td>
                      <td className="p-4 text-right font-medium">{money(row.balance, row.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShoppingBag className="h-5 w-5" />
            Buying details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {buying.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No reserved stock or open buying lines on your account.
            </p>
          ) : (
            buying.map((item) => (
              <div
                key={item.id}
                className={`flex items-start justify-between gap-4 rounded-lg border p-4 ${
                  item.source === 'reservation' ? 'border-accent/30 bg-accent/[0.04]' : ''
                }`}
              >
                <div>
                  <p className="font-medium">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.source === 'reservation'
                      ? `Reserved${item.inventory_type ? ` · ${item.inventory_type}` : ''}`
                      : item.invoice_number || 'Invoice'}
                    {item.inventory_reference ? ` · Ref ${item.inventory_reference}` : ''}
                    {item.quantity ? ` · Qty ${item.quantity}` : ''}
                  </p>
                </div>
                <span className="shrink-0 font-semibold">{money(item.line_total, item.currency || fallbackCurrency)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Confirmed remittances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {remittances.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No confirmed remittances yet.</p>
          ) : (
            remittances.map((row) => (
              <div key={row.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{row.remittance_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(row.received_date), 'dd MMM yyyy')} · {row.method.replaceAll('_', ' ')}
                      {row.bank_reference ? ` · Ref ${row.bank_reference}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{money(row.amount, row.currency)}</p>
                    <p className="text-xs text-muted-foreground">{money(row.available_amount, row.currency)} unallocated</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {allocations
                    .filter((item) => item.remittance_id === row.id)
                    .map((allocation) => (
                      <div key={allocation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/40 px-3 py-2 text-sm">
                        <span>
                          Applied to{' '}
                          <Link href={`/portal/invoices/${allocation.invoice_id}`} className="font-medium text-primary hover:underline">
                            {allocation.invoice_number}
                          </Link>
                        </span>
                        <span className="font-medium">{money(allocation.amount, allocation.currency)}</span>
                      </div>
                    ))}
                  {allocations.every((item) => item.remittance_id !== row.id) ? (
                    <p className="text-xs text-muted-foreground">No allocations on this remittance yet.</p>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {invoices.some((row) => Number(row.balance_due) > 0) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Open balances</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invoices
              .filter((row) => receivableDocument(row.document_type) && Number(row.balance_due) > 0)
              .map((row) => (
                <Link
                  key={row.id}
                  href={`/portal/invoices/${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 transition hover:border-accent/40"
                >
                  <span className="flex items-center gap-2">
                    <strong className="font-mono text-sm">{row.invoice_number}</strong>
                    <Badge variant="outline" className="capitalize">{row.status.replaceAll('_', ' ')}</Badge>
                  </span>
                  <span className="font-semibold">{money(row.balance_due, row.currency)}</span>
                </Link>
              ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default function PortalAccountPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PortalAccountInner />
    </Suspense>
  );
}

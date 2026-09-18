'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Loader2, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';

type PortalInvoice = {
  id: string;
  invoice_number: string;
  document_type: string;
  issue_date: string;
  currency: string;
  status: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function PortalInvoicesInner() {
  const [rows, setRows] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, document_type, issue_date, currency, status, total_amount, amount_paid, balance_due')
      .order('issue_date', { ascending: false });
    if (error) toast.error(error.message);
    setRows((data || []) as PortalInvoice[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your invoices</h1>
        <p className="text-sm text-muted-foreground">Read-only view of documents linked to your customer account.</p>
      </div>
      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ReceiptText className="h-10 w-10 text-muted-foreground/30" />
            <p className="font-medium">No invoices yet</p>
            <p className="text-sm text-muted-foreground">When ANSHA posts a document to your account, it will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/portal/invoices/${row.id}`} className="block rounded-xl border bg-card p-4 transition hover:border-accent/40 hover:shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="font-mono text-sm">{row.invoice_number}</strong>
                  <Badge variant="outline" className="capitalize">{row.document_type.replaceAll('_', ' ')}</Badge>
                  <Badge variant="outline" className="capitalize">{row.status.replaceAll('_', ' ')}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">{format(new Date(row.issue_date), 'dd MMM yyyy')}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span>Total {money(row.total_amount, row.currency)}</span>
                  <span className="text-muted-foreground">Paid {money(row.amount_paid, row.currency)}</span>
                  <span className="font-semibold">Balance {money(row.balance_due, row.currency)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PortalInvoicesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PortalInvoicesInner />
    </Suspense>
  );
}

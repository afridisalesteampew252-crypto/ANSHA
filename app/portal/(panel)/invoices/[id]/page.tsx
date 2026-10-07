'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import type { CustomerFinanceHistory } from '@/lib/customer-finance';

type PortalInvoice = {
  id: string;
  invoice_number: string;
  document_type: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  status: string;
  customer_name: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
};

type PortalItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

const money = formatMoney;

export default function PortalInvoiceDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [invoice, setInvoice] = useState<PortalInvoice | null>(null);
  const [items, setItems] = useState<PortalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<CustomerFinanceHistory | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [invoiceRes, itemsRes, historyRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_number, document_type, issue_date, due_date, currency, status, customer_name, subtotal, tax_amount, total_amount, amount_paid, balance_due')
        .eq('id', params.id)
        .maybeSingle(),
      supabase
        .from('invoice_items')
        .select('id, description, quantity, unit_price, line_total')
        .eq('invoice_id', params.id)
        .order('sort_order'),
      supabase.rpc('get_my_customer_finance_history'),
    ]);
    if (invoiceRes.error || !invoiceRes.data) {
      toast.error(invoiceRes.error?.message || 'Invoice not found.');
      router.replace('/portal/invoices');
      return;
    }
    setInvoice(invoiceRes.data as PortalInvoice);
    setItems((itemsRes.data || []) as PortalItem[]);
    setHistory(historyRes.error ? null : historyRes.data as CustomerFinanceHistory);
    if (itemsRes.error) toast.error('Invoice line items could not be loaded.');
    setLoading(false);
  }, [params.id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !invoice) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/portal/invoices"><ArrowLeft className="h-4 w-4" />Back to invoices</Link>
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-2xl font-bold">{invoice.invoice_number}</h1>
        <Badge variant="outline" className="capitalize">{invoice.document_type.replaceAll('_', ' ')}</Badge>
        <Badge variant="outline" className="capitalize">{invoice.status.replaceAll('_', ' ')}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Customer: </span>{invoice.customer_name}</p>
          <p><span className="text-muted-foreground">Currency: </span>{invoice.currency}</p>
          <p><span className="text-muted-foreground">Issue date: </span>{format(new Date(invoice.issue_date), 'dd MMM yyyy')}</p>
          {invoice.due_date ? <p><span className="text-muted-foreground">Due: </span>{format(new Date(invoice.due_date), 'dd MMM yyyy')}</p> : null}
          <p><span className="text-muted-foreground">Subtotal: </span>{money(invoice.subtotal, invoice.currency)}</p>
          <p><span className="text-muted-foreground">Tax: </span>{money(invoice.tax_amount, invoice.currency)}</p>
          <p><span className="text-muted-foreground">Total: </span>{money(invoice.total_amount, invoice.currency)}</p>
          <p><span className="text-muted-foreground">Paid: </span>{money(invoice.amount_paid, invoice.currency)}</p>
          <p className="font-semibold">Balance {money(invoice.balance_due, invoice.currency)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg">Payment and TT history</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!history ? <div role="alert" className="space-y-2 text-sm"><p>Payment history could not be loaded.</p><Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div> : history.payments.filter((payment) => payment.invoice_id === invoice.id).length === 0 ? <p className="text-sm text-muted-foreground">No payments applied to this invoice yet.</p> : history.payments.filter((payment) => payment.invoice_id === invoice.id).map((payment) => {
            const tt = history.remittances.find((remittance) => remittance.id === payment.remittance_id);
            return <div key={payment.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4 text-sm">
              <div><p className="font-semibold">{payment.remittance_number || payment.reference || 'Payment'}</p><p className="text-xs text-muted-foreground">{format(new Date(payment.payment_date), 'dd MMM yyyy')} · {payment.method.replaceAll('_', ' ')}{payment.reference ? ` · Ref ${payment.reference}` : ''}</p>
                {tt && <p className="mt-1 text-xs text-muted-foreground">TT received {format(new Date(tt.received_date), 'dd MMM yyyy')} · Receipt {money(tt.amount, tt.currency)}{tt.exchange_rate != null ? ` · Original ${money(Number(tt.source_amount), tt.source_currency || tt.currency)} · 1 ${tt.source_currency} = ${tt.exchange_rate} ${tt.currency}` : ''}</p>}
              </div><strong>{money(payment.amount, payment.currency)} applied</strong>
            </div>;
          })}
          <p className="text-xs text-muted-foreground">TT receipts can be split across invoices. The applied amount here is the payment toward this invoice.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Line items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No line items.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-3 text-sm last:border-0">
                <div>
                  <p className="font-medium">{item.description}</p>
                  <p className="text-xs text-muted-foreground">Qty {item.quantity} × {money(item.unit_price, invoice.currency)}</p>
                </div>
                <strong>{money(item.line_total, invoice.currency)}</strong>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

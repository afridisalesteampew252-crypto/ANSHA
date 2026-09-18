'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendOutboundEmail } from '@/lib/outbound-email';
import { siteConfig } from '@/lib/site-config';
import { supabase } from '@/lib/supabase/client';
import type { OutboundEmailLog } from '@/lib/types';

type InvoiceHint = {
  id: string;
  invoice_number: string;
  customer_email: string | null;
  customer_name: string | null;
  verification_code: string | null;
};

export default function OutboundEmailPage() {
  const [logs, setLogs] = useState<OutboundEmailLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoiceHint, setInvoiceHint] = useState<InvoiceHint | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const loadLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('outbound_email_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(75);
    if (error) toast.error(error.message);
    setLogs((data || []) as OutboundEmailLog[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filtered = useMemo(() => logs, [logs]);

  const lookupInvoice = async () => {
    const q = invoiceQuery.trim();
    if (!q) {
      toast.error('Enter an invoice number to look up.');
      return;
    }
    setLookingUp(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,invoice_number,customer_email,customer_name,verification_code')
        .eq('invoice_number', q)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setInvoiceHint(null);
        toast.error('No invoice found with that number.');
        return;
      }
      const hint = data as InvoiceHint;
      setInvoiceHint(hint);
      if (hint.customer_email) setToEmail(hint.customer_email);
      const verifyUrl = hint.verification_code
        ? `${siteConfig.url}/verify/invoice/${hint.verification_code}`
        : `${siteConfig.url}/verify/invoice/`;
      setSubject(`ANSHA invoice ${hint.invoice_number}`);
      setBody(
        [
          `Dear ${hint.customer_name || 'customer'},`,
          '',
          `Please find your invoice ${hint.invoice_number} verification link below:`,
          verifyUrl,
          '',
          'Thank you,',
          'ANSHA Trading',
        ].join('\n')
      );
      toast.success('Invoice stub filled — review before sending.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invoice lookup failed.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSend = async () => {
    setBusy(true);
    try {
      const result = await sendOutboundEmail({
        to_email: toEmail,
        subject,
        body,
        related_invoice_id: invoiceHint?.id || null,
      });
      toast.success(result.provider_message_id
        ? `Sent (provider id ${result.provider_message_id})`
        : 'Email sent.');
      setSubject('');
      setBody('');
      setInvoiceHint(null);
      setInvoiceQuery('');
      await loadLogs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Send failed.');
      await loadLogs();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Outbound email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ops-only transactional send via Resend. Not a campaign tool. Requires Edge secret{' '}
          <code className="text-foreground">RESEND_API_KEY</code>.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5" />
              Compose
            </CardTitle>
            <CardDescription>Send to a customer or staff address and log the result.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
              <Label htmlFor="invoice-stub">Email invoice link (stub)</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="invoice-stub"
                  placeholder="Invoice number e.g. INV-2026-0001"
                  value={invoiceQuery}
                  onChange={(event) => setInvoiceQuery(event.target.value)}
                />
                <Button type="button" variant="secondary" disabled={lookingUp} onClick={() => void lookupInvoice()}>
                  {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Fill stub
                </Button>
              </div>
              {invoiceHint ? (
                <p className="text-xs text-muted-foreground">
                  Linked invoice {invoiceHint.invoice_number}
                  {invoiceHint.verification_code ? ' · verification URL ready' : ' · no verification code'}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-email">To</Label>
              <Input
                id="to-email"
                type="email"
                autoComplete="email"
                placeholder="customer@example.com"
                value={toEmail}
                onChange={(event) => setToEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                maxLength={300}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                rows={10}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Plain-text message…"
              />
            </div>
            <Button type="button" disabled={busy || !toEmail || !subject || !body} onClick={() => void handleSend()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? 'Sending…' : 'Send email'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent sends</CardTitle>
            <CardDescription>Append-only log from <code className="text-foreground">outbound_email_log</code>.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No outbound emails logged yet.</p>
            ) : (
              <ul className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
                {filtered.map((row) => (
                  <li key={row.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{row.to_email}</span>
                      <Badge className={row.status === 'sent' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}>
                        {row.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-foreground">{row.subject}</p>
                    {row.body_preview ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.body_preview}</p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {format(new Date(row.created_at), 'dd MMM yyyy HH:mm')}
                      {row.provider_message_id ? ` · ${row.provider_message_id}` : ''}
                      {row.error_message ? ` · ${row.error_message}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

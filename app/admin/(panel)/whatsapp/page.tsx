'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Loader2, Phone, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/admin/searchable-select';
import { supabase } from '@/lib/supabase/client';
import { getWhatsAppStatus, normalizeE164, sendWhatsAppMessage } from '@/lib/whatsapp';
import type { Customer, WhatsAppMessageLog } from '@/lib/types';

type MessageKind = 'text' | 'template';

export default function AdminWhatsAppPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<WhatsAppMessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [phone, setPhone] = useState('');
  const [messageType, setMessageType] = useState<MessageKind>('text');
  const [body, setBody] = useState('');
  const [templateName, setTemplateName] = useState('hello_world');
  const [templateLanguage, setTemplateLanguage] = useState('en_US');

  const customerOptions = useMemo(
    () =>
      customers.map((customer) => ({
          value: customer.id,
          label: `${customer.full_name}${customer.company_name ? ` · ${customer.company_name}` : ''}`,
          keywords: [customer.customer_code, customer.phone, customer.whatsapp, customer.email],
        })),
    [customers]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const [status, customerRes, logRes] = await Promise.all([
      getWhatsAppStatus(),
      supabase
        .from('customers')
        .select('id, customer_code, full_name, company_name, email, phone, whatsapp, is_active')
        .eq('is_active', true)
        .order('full_name')
        .limit(500),
      supabase
        .from('whatsapp_message_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    setConfigured(status.configured);
    if (customerRes.error) toast.error(customerRes.error.message);
    else setCustomers((customerRes.data || []) as Customer[]);
    if (logRes.error) {
      // Table may exist but RLS denies sales; show empty rather than crash.
      if (!logRes.error.message.toLowerCase().includes('permission')) {
        toast.error(logRes.error.message);
      }
      setLogs([]);
    } else {
      setLogs((logRes.data || []) as WhatsAppMessageLog[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!customerId) return;
    const customer = customers.find((row) => row.id === customerId);
    if (!customer) return;
    const next = customer.whatsapp || customer.phone || '';
    if (next) setPhone(next);
  }, [customerId, customers]);

  const onSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (configured === false) {
      toast.error('Configure WhatsApp Cloud API secrets before sending.');
      return;
    }
    const e164 = normalizeE164(phone);
    if (!e164) {
      toast.error('Enter a valid E.164 phone number (e.g. +971501234567).');
      return;
    }
    if (messageType === 'text' && !body.trim()) {
      toast.error('Message body is required.');
      return;
    }
    if (messageType === 'template' && !templateName.trim()) {
      toast.error('Template name is required.');
      return;
    }

    setSending(true);
    try {
      const result = await sendWhatsAppMessage({
        to: e164,
        message_type: messageType,
        body: body.trim(),
        template_name: templateName.trim(),
        template_language: templateLanguage.trim() || 'en_US',
        customer_id: customerId || null,
      });
      toast.success(result.wa_message_id ? `Sent (${result.wa_message_id})` : 'Message sent.');
      setBody('');
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Send failed.';
      const code = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: string }).code || '')
        : '';
      if (code === 'WHATSAPP_NOT_CONFIGURED') {
        setConfigured(false);
        toast.error('WhatsApp is not configured. Follow the setup steps below.');
      } else {
        toast.error(message);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Send a Cloud API text or approved template to a customer phone (E.164) and review the send log.
        </p>
      </div>

      {configured === false && (
        <Card className="border-amber-500/40 bg-amber-500/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              WhatsApp Cloud API setup required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="text-foreground">
              Meta credentials are not set on the <code className="text-foreground">send-whatsapp</code> Edge Function.
              The page stays usable so you can finish setup without errors.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Create a Meta WhatsApp Business app and get a permanent access token + Phone number ID.</li>
              <li>
                Set Edge secrets (never commit): <code className="text-foreground">WHATSAPP_ACCESS_TOKEN</code> and{' '}
                <code className="text-foreground">WHATSAPP_PHONE_NUMBER_ID</code>.
              </li>
              <li>
                Optional: <code className="text-foreground">WHATSAPP_API_VERSION</code> (default{' '}
                <code className="text-foreground">v21.0</code>).
              </li>
              <li>Deploy <code className="text-foreground">send-whatsapp</code> and refresh this page.</li>
            </ol>
            <p>
              Full steps: <code className="text-foreground">docs/Deployment.md</code> (WhatsApp section).
            </p>
          </CardContent>
        </Card>
      )}

      {configured !== false && (
        <Card className="border-accent/20 bg-accent/[0.04]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4 text-accent" />
              How WhatsApp send works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Pick a CRM customer (uses their WhatsApp or phone) or paste an E.164 number.</li>
              <li>Send free-form text (24h session window) or an approved template name.</li>
              <li>
                Ops staff invoke <code className="text-foreground">send-whatsapp</code>; Meta replies are stored in{' '}
                <code className="text-foreground">whatsapp_message_log</code>.
              </li>
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Send message</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(event) => void onSend(event)}>
            <div className="space-y-1.5">
              <Label>Customer (optional)</Label>
              <SearchableSelect
                value={customerId}
                onValueChange={setCustomerId}
                options={customerOptions}
                placeholder="Search customers…"
                searchPlaceholder="Name, code, phone…"
                allowClear
                disabled={configured === false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-phone">Phone (E.164)</Label>
              <Input
                id="wa-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+971501234567"
                required
                disabled={configured === false}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={messageType === 'text' ? 'default' : 'outline'}
                onClick={() => setMessageType('text')}
                disabled={configured === false}
              >
                Text
              </Button>
              <Button
                type="button"
                size="sm"
                variant={messageType === 'template' ? 'default' : 'outline'}
                onClick={() => setMessageType('template')}
                disabled={configured === false}
              >
                Template
              </Button>
            </div>
            {messageType === 'text' ? (
              <div className="space-y-1.5">
                <Label htmlFor="wa-body">Message</Label>
                <Textarea
                  id="wa-body"
                  rows={4}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={4096}
                  required
                  disabled={configured === false}
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wa-template">Template name</Label>
                  <Input
                    id="wa-template"
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    required
                    disabled={configured === false}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-lang">Language code</Label>
                  <Input
                    id="wa-lang"
                    value={templateLanguage}
                    onChange={(event) => setTemplateLanguage(event.target.value)}
                    disabled={configured === false}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button type="submit" variant="accent" disabled={sending || configured === false}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent sends</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages logged yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {logs.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{row.to_phone}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {row.message_type === 'template'
                        ? `Template: ${row.template_name || '—'}`
                        : row.body || '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(row.created_at), 'dd MMM yyyy HH:mm')}
                      {row.wa_message_id ? ` · ${row.wa_message_id}` : ''}
                    </p>
                    {row.error_message ? (
                      <p className="text-xs text-destructive">{row.error_message}</p>
                    ) : null}
                  </div>
                  <Badge variant={row.status === 'sent' ? 'default' : row.status === 'failed' ? 'destructive' : 'secondary'}>
                    {row.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

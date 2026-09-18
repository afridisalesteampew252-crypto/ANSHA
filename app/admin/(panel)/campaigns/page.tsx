'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Megaphone, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendOutboundEmail } from '@/lib/outbound-email';
import { supabase } from '@/lib/supabase/client';
import type {
  MarketingCampaign,
  MarketingCampaignChannel,
  MarketingCampaignPayload,
  MarketingCampaignStatus,
  SiteOffer,
} from '@/lib/types';
import { sendWebPush, type PushTopic } from '@/lib/web-push';

const CHANNELS: { value: MarketingCampaignChannel; label: string }[] = [
  { value: 'push', label: 'PWA push' },
  { value: 'email', label: 'Outbound email' },
  { value: 'offer', label: 'Offer (deals push)' },
];

const PUSH_TOPICS: { value: PushTopic; label: string }[] = [
  { value: 'deals', label: 'Deals' },
  { value: 'insights', label: 'Insights' },
  { value: 'all', label: 'All subscribers' },
];

function statusBadgeClass(status: MarketingCampaignStatus) {
  if (status === 'sent') return 'bg-emerald-100 text-emerald-800';
  if (status === 'scheduled') return 'bg-amber-100 text-amber-800';
  return 'bg-zinc-200 text-zinc-700';
}

function payloadSummary(row: MarketingCampaign): string {
  const p = row.payload || {};
  if (row.channel === 'push') {
    return [p.topic, p.title].filter(Boolean).join(' · ') || 'Push payload';
  }
  if (row.channel === 'email') {
    return [p.to_email, p.subject].filter(Boolean).join(' · ') || 'Email payload';
  }
  return p.offer_title || p.offer_id || 'Offer link';
}

export default function MarketingCampaignsPage() {
  const [rows, setRows] = useState<MarketingCampaign[]>([]);
  const [offers, setOffers] = useState<SiteOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [channel, setChannel] = useState<MarketingCampaignChannel>('push');
  const [status, setStatus] = useState<Exclude<MarketingCampaignStatus, 'sent'>>('draft');

  const [pushTopic, setPushTopic] = useState<PushTopic>('deals');
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushUrl, setPushUrl] = useState('/offers');

  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  const [offerId, setOfferId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [campaignsRes, offersRes] = await Promise.all([
      supabase.from('marketing_campaigns').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('site_offers').select('*').eq('is_published', true).order('created_at', { ascending: false }).limit(100),
    ]);
    if (campaignsRes.error) toast.error(campaignsRes.error.message);
    if (offersRes.error) toast.error(offersRes.error.message);
    setRows((campaignsRes.data || []) as MarketingCampaign[]);
    setOffers((offersRes.data || []) as SiteOffer[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buildPayload = (): MarketingCampaignPayload | null => {
    if (channel === 'push') {
      if (!pushTitle.trim()) {
        toast.error('Push title is required.');
        return null;
      }
      return {
        topic: pushTopic,
        title: pushTitle.trim().slice(0, 120),
        body: (pushBody.trim() || 'Update from ANSHA Trading.').slice(0, 300),
        url: pushUrl.trim() || '/offers',
      };
    }
    if (channel === 'email') {
      if (!emailTo.trim() || !emailSubject.trim() || !emailBody.trim()) {
        toast.error('Email to, subject, and body are required.');
        return null;
      }
      return {
        to_email: emailTo.trim().toLowerCase(),
        subject: emailSubject.trim().slice(0, 300),
        body: emailBody.trim().slice(0, 50000),
      };
    }
    const offer = offers.find((row) => row.id === offerId);
    if (!offer) {
      toast.error('Select a published offer.');
      return null;
    }
    return {
      offer_id: offer.id,
      offer_title: offer.title,
      summary: offer.summary,
      href: offer.href || '/offers',
    };
  };

  const createCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error('Campaign name is required.');
      return;
    }
    const payload = buildPayload();
    if (!payload) return;

    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { error } = await supabase.from('marketing_campaigns').insert({
        name: name.trim(),
        channel,
        status,
        payload,
        created_by: sessionData.session?.user.id || null,
      });
      if (error) throw error;
      toast.success('Campaign saved.');
      setName('');
      setPushTitle('');
      setPushBody('');
      setPushUrl('/offers');
      setEmailTo('');
      setEmailSubject('');
      setEmailBody('');
      setOfferId('');
      setStatus('draft');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save campaign.');
    } finally {
      setSaving(false);
    }
  };

  const markSent = async (id: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('marketing_campaigns')
      .update({ status: 'sent', sent_at: now, updated_at: now })
      .eq('id', id);
    if (error) throw error;
  };

  const sendNow = async (row: MarketingCampaign) => {
    if (row.status === 'sent') {
      toast.error('Campaign already marked sent.');
      return;
    }
    setSendingId(row.id);
    try {
      const p = row.payload || {};
      if (row.channel === 'push') {
        const topic = (p.topic as PushTopic) || 'deals';
        const result = await sendWebPush({
          topic,
          title: String(p.title || row.name).slice(0, 120),
          body: String(p.body || 'Update from ANSHA Trading.').slice(0, 300),
          url: String(p.url || '/offers'),
        });
        await markSent(row.id);
        toast.success(`Push sent to ${result.sent} devices.`);
      } else if (row.channel === 'email') {
        const result = await sendOutboundEmail({
          to_email: String(p.to_email || ''),
          subject: String(p.subject || row.name),
          body: String(p.body || ''),
        });
        await markSent(row.id);
        toast.success(result.provider_message_id
          ? `Email sent (${result.provider_message_id})`
          : 'Email sent.');
      } else {
        let title = String(p.offer_title || '');
        let summary = p.summary ? String(p.summary) : '';
        let href = String(p.href || '/offers');
        if (p.offer_id) {
          const { data: offer } = await supabase
            .from('site_offers')
            .select('title,summary,href')
            .eq('id', String(p.offer_id))
            .maybeSingle();
          if (offer) {
            title = offer.title;
            summary = offer.summary || '';
            href = offer.href || '/offers';
          }
        }
        if (!title) throw new Error('Offer not found for this campaign.');
        const result = await sendWebPush({
          topic: 'deals',
          title: `Deal: ${title}`.slice(0, 120),
          body: (summary || 'New export deal from ANSHA Trading.').slice(0, 300),
          url: href,
        });
        await markSent(row.id);
        toast.success(`Offer push sent to ${result.sent} devices.`);
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Send failed.');
      await load();
    } finally {
      setSendingId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this campaign?')) return;
    const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Campaign deleted.');
    await load();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Marketing campaigns</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ops-only MVP: campaign records with Send now hooks into existing PWA push and outbound email.
          Not a full ESP or scheduled automation product.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Megaphone className="h-5 w-5" />
            New campaign
          </CardTitle>
          <CardDescription>
            Save as draft or scheduled, then Send now when ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(event) => void createCampaign(event)}>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-name">Name</Label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="campaign-channel">Channel</Label>
                <select
                  id="campaign-channel"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as MarketingCampaignChannel)}
                >
                  {CHANNELS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-status">Status</Label>
                <select
                  id="campaign-status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as 'draft' | 'scheduled')}
                >
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </div>
            </div>

            {channel === 'push' ? (
              <div className="grid gap-4 rounded-lg border border-border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="push-topic">Topic</Label>
                  <select
                    id="push-topic"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={pushTopic}
                    onChange={(event) => setPushTopic(event.target.value as PushTopic)}
                  >
                    {PUSH_TOPICS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="push-title">Title</Label>
                  <Input id="push-title" value={pushTitle} onChange={(event) => setPushTitle(event.target.value)} maxLength={120} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="push-body">Body</Label>
                  <Textarea id="push-body" rows={3} value={pushBody} onChange={(event) => setPushBody(event.target.value)} maxLength={300} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="push-url">URL path</Label>
                  <Input id="push-url" value={pushUrl} onChange={(event) => setPushUrl(event.target.value)} placeholder="/offers" />
                </div>
              </div>
            ) : null}

            {channel === 'email' ? (
              <div className="grid gap-4 rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Uses Resend via <code className="text-foreground">send-outbound-email</code> (one recipient per send).
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="email-to">To</Label>
                  <Input id="email-to" type="email" value={emailTo} onChange={(event) => setEmailTo(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-subject">Subject</Label>
                  <Input id="email-subject" value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} maxLength={300} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-body">Body</Label>
                  <Textarea id="email-body" rows={6} value={emailBody} onChange={(event) => setEmailBody(event.target.value)} />
                </div>
              </div>
            ) : null}

            {channel === 'offer' ? (
              <div className="grid gap-3 rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Links a published <code className="text-foreground">site_offers</code> row; Send now fires deals-topic PWA push.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="offer-id">Offer</Label>
                  <select
                    id="offer-id"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={offerId}
                    onChange={(event) => setOfferId(event.target.value)}
                  >
                    <option value="">Select published offer…</option>
                    {offers.map((offer) => (
                      <option key={offer.id} value={offer.id}>{offer.title}</option>
                    ))}
                  </select>
                </div>
                {offers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No published offers yet — create one under Deals &amp; PWA push.</p>
                ) : null}
              </div>
            ) : null}

            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save campaign
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Campaigns</CardTitle>
          <CardDescription>
            Records in <code className="text-foreground">marketing_campaigns</code>. Scheduled is a status label only — no cron dispatcher in this MVP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={row.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{row.name}</strong>
                    <Badge variant="outline">{row.channel}</Badge>
                    <Badge className={statusBadgeClass(row.status)}>{row.status}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {format(new Date(row.created_at), 'dd MMM yyyy HH:mm')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{payloadSummary(row)}</p>
                  {row.sent_at ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Sent {format(new Date(row.sent_at), 'dd MMM yyyy HH:mm')}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.status !== 'sent' ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={sendingId === row.id}
                        onClick={() => void sendNow(row)}
                      >
                        {sendingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send now
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="ghost" onClick={() => void remove(row.id)}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

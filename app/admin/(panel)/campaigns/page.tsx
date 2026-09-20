'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Megaphone, Pencil, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { campaignLinkUrl, parseCountryList } from '@/lib/marketing-campaigns';
import { sendOutboundEmail } from '@/lib/outbound-email';
import { STOCK_ORIGINS } from '@/lib/stock';
import { supabase } from '@/lib/supabase/client';
import type {
  BlogPost,
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

type FeaturedVehicle = { id: string; title: string; slug: string; stock_origin: string | null };
type FeaturedPart = { id: string; name: string; slug: string; stock_origin: string | null };

function statusBadgeClass(status: MarketingCampaignStatus) {
  if (status === 'sent') return 'bg-emerald-100 text-emerald-800';
  if (status === 'scheduled') return 'bg-amber-100 text-amber-800';
  return 'bg-zinc-200 text-zinc-700';
}

function payloadSummary(row: MarketingCampaign): string {
  const p = row.payload || {};
  const bits: string[] = [];
  if (row.channel === 'push') bits.push([p.topic, p.title].filter(Boolean).join(' · ') || 'Push');
  else if (row.channel === 'email') bits.push([p.to_email || (p.audience_countries?.length ? `segment: ${p.audience_countries.join(', ')}` : null), p.subject].filter(Boolean).join(' · ') || 'Email');
  else bits.push(String(p.offer_title || p.offer_id || 'Offer'));
  if (p.blog_title) bits.push(`Blog: ${p.blog_title}`);
  if (p.vehicle_title) bits.push(`Vehicle: ${p.vehicle_title}`);
  if (p.part_name) bits.push(`Part: ${p.part_name}`);
  if (p.audience_stock_origins?.length) bits.push(`Origins: ${p.audience_stock_origins.join(', ')}`);
  return bits.join(' · ');
}

export default function MarketingCampaignsPage() {
  const [rows, setRows] = useState<MarketingCampaign[]>([]);
  const [offers, setOffers] = useState<SiteOffer[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [vehicles, setVehicles] = useState<FeaturedVehicle[]>([]);
  const [parts, setParts] = useState<FeaturedPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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
  const [audienceCountries, setAudienceCountries] = useState('');
  const [audienceOrigins, setAudienceOrigins] = useState<string[]>([]);

  const [offerId, setOfferId] = useState('');
  const [blogPostId, setBlogPostId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [partId, setPartId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [campaignsRes, offersRes, blogRes, vehiclesRes, partsRes] = await Promise.all([
      supabase.from('marketing_campaigns').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('site_offers').select('*').eq('is_published', true).order('created_at', { ascending: false }).limit(100),
      supabase.from('blog_posts').select('id,title,slug,status,published_at,excerpt').eq('status', 'published').order('published_at', { ascending: false }).limit(50),
      supabase.from('vehicles').select('id,title,slug,stock_origin').eq('is_featured', true).eq('is_published', true).order('updated_at', { ascending: false }).limit(40),
      supabase.from('parts').select('id,name,slug,stock_origin').eq('is_featured', true).eq('is_published', true).order('updated_at', { ascending: false }).limit(40),
    ]);
    if (campaignsRes.error) toast.error(campaignsRes.error.message);
    if (offersRes.error) toast.error(offersRes.error.message);
    if (blogRes.error) toast.error(blogRes.error.message);
    setRows((campaignsRes.data || []) as MarketingCampaign[]);
    setOffers((offersRes.data || []) as SiteOffer[]);
    setBlogPosts((blogRes.data || []) as BlogPost[]);
    setVehicles((vehiclesRes.data || []) as FeaturedVehicle[]);
    setParts((partsRes.data || []) as FeaturedPart[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setChannel('push');
    setStatus('draft');
    setPushTopic('deals');
    setPushTitle('');
    setPushBody('');
    setPushUrl('/offers');
    setEmailTo('');
    setEmailSubject('');
    setEmailBody('');
    setAudienceCountries('');
    setAudienceOrigins([]);
    setOfferId('');
    setBlogPostId('');
    setVehicleId('');
    setPartId('');
  };

  const toggleOrigin = (value: string) => {
    setAudienceOrigins((current) =>
      current.includes(value) ? current.filter((o) => o !== value) : [...current, value]
    );
  };

  const resolveLinkFields = () => {
    const blog = blogPosts.find((row) => row.id === blogPostId);
    const vehicle = vehicles.find((row) => row.id === vehicleId);
    const part = parts.find((row) => row.id === partId);
    let url = pushUrl.trim() || '/offers';
    if (blog) url = `/blog/${blog.slug}`;
    else if (vehicle) url = `/vehicles/${vehicle.slug}`;
    else if (part) url = `/parts/${part.slug}`;
    return {
      url,
      blog_post_id: blog?.id,
      blog_slug: blog?.slug,
      blog_title: blog?.title,
      vehicle_id: vehicle?.id,
      vehicle_title: vehicle?.title,
      part_id: part?.id,
      part_name: part?.name,
    };
  };

  const buildPayload = (): MarketingCampaignPayload | null => {
    const link = resolveLinkFields();
    const countries = parseCountryList(audienceCountries);
    const baseAudience = {
      audience_countries: countries.length ? countries : undefined,
      audience_stock_origins: audienceOrigins.length ? audienceOrigins : undefined,
      ...link,
    };

    if (channel === 'push') {
      if (!pushTitle.trim()) {
        toast.error('Push title is required.');
        return null;
      }
      return {
        ...baseAudience,
        topic: pushTopic,
        title: pushTitle.trim().slice(0, 120),
        body: (pushBody.trim() || 'Update from ANSHA Trading.').slice(0, 300),
        url: link.url,
      };
    }
    if (channel === 'email') {
      if (!emailSubject.trim() || !emailBody.trim()) {
        toast.error('Email subject and body are required.');
        return null;
      }
      if (!emailTo.trim() && !countries.length) {
        toast.error('Set a single To address and/or audience countries for segment send.');
        return null;
      }
      return {
        to_email: emailTo.trim() ? emailTo.trim().toLowerCase() : undefined,
        subject: emailSubject.trim().slice(0, 300),
        body: emailBody.trim().slice(0, 50000),
        href: link.url,
        ...baseAudience,
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
      href: offer.href || link.url || '/offers',
      ...baseAudience,
    };
  };

  const fillFromRow = (row: MarketingCampaign) => {
    if (row.status === 'sent') {
      toast.error('Sent campaigns are read-only. Duplicate by creating a new draft.');
      return;
    }
    const p = row.payload || {};
    setEditingId(row.id);
    setName(row.name);
    setChannel(row.channel);
    setStatus(row.status === 'scheduled' ? 'scheduled' : 'draft');
    setPushTopic(((p.topic as PushTopic) || 'deals'));
    setPushTitle(String(p.title || ''));
    setPushBody(String(p.body || ''));
    setPushUrl(String(p.url || p.href || '/offers'));
    setEmailTo(String(p.to_email || ''));
    setEmailSubject(String(p.subject || ''));
    setEmailBody(String(p.body || ''));
    setAudienceCountries((p.audience_countries || []).join(', '));
    setAudienceOrigins([...(p.audience_stock_origins || [])]);
    setOfferId(String(p.offer_id || ''));
    setBlogPostId(String(p.blog_post_id || ''));
    setVehicleId(String(p.vehicle_id || ''));
    setPartId(String(p.part_id || ''));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveCampaign = async (event: React.FormEvent) => {
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
      if (editingId) {
        const { error } = await supabase
          .from('marketing_campaigns')
          .update({
            name: name.trim(),
            channel,
            status,
            payload,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Campaign updated.');
      } else {
        const { error } = await supabase.from('marketing_campaigns').insert({
          name: name.trim(),
          channel,
          status,
          payload,
          created_by: sessionData.session?.user.id || null,
        });
        if (error) throw error;
        toast.success('Campaign saved.');
      }
      resetForm();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save campaign.');
    } finally {
      setSaving(false);
    }
  };

  const markSent = async (id: string, sentCount: number) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('marketing_campaigns')
      .update({
        status: 'sent',
        sent_at: now,
        sent_count: sentCount,
        updated_at: now,
      })
      .eq('id', id);
    if (error) throw error;
  };

  const bumpSentCount = async (id: string, delta: number) => {
    const row = rows.find((r) => r.id === id);
    const next = Math.max(0, (row?.sent_count || 0) + delta);
    const { error } = await supabase
      .from('marketing_campaigns')
      .update({ sent_count: next, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  };

  const resolveRecipients = async (p: MarketingCampaignPayload): Promise<string[]> => {
    const countries = (p.audience_countries || []).map((c) => c.trim().toLowerCase()).filter(Boolean);
    if (!countries.length) {
      return p.to_email ? [String(p.to_email).toLowerCase()] : [];
    }
    const { data, error } = await supabase
      .from('customers')
      .select('email,country')
      .eq('is_active', true)
      .not('email', 'is', null)
      .limit(800);
    if (error) throw error;
    const emails = Array.from(
      new Set(
        (data || [])
          .filter((row) => {
            const country = String(row.country || '').trim().toLowerCase();
            return countries.some((c) => country === c || country.includes(c) || c.includes(country));
          })
          .map((row) => String(row.email || '').trim().toLowerCase())
          .filter((email) => email.includes('@'))
      )
    );
    if (p.to_email) {
      const single = String(p.to_email).toLowerCase();
      if (single.includes('@') && !emails.includes(single)) emails.unshift(single);
    }
    return emails;
  };

  const sendTestEmail = async (row: MarketingCampaign) => {
    const p = row.payload || {};
    const testTo = window.prompt('Send test email to:', String(p.to_email || ''));
    if (!testTo?.trim()) return;
    setSendingId(row.id);
    try {
      await sendOutboundEmail({
        to_email: testTo.trim().toLowerCase(),
        subject: `[TEST] ${String(p.subject || row.name)}`,
        body: String(p.body || ''),
      });
      await bumpSentCount(row.id, 1);
      toast.success(`Test email sent to ${testTo.trim().toLowerCase()}. Campaign stays ${row.status}.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Test send failed (check RESEND_API_KEY Edge secret).');
    } finally {
      setSendingId(null);
    }
  };

  const sendNow = async (row: MarketingCampaign, mode: 'full' | 'segment' = 'full') => {
    if (row.status === 'sent' && mode === 'full') {
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
          url: campaignLinkUrl(p),
        });
        await markSent(row.id, result.sent || 0);
        toast.success(`Push sent to ${result.sent} devices.`);
      } else if (row.channel === 'email') {
        const recipients =
          mode === 'segment' || (p.audience_countries && p.audience_countries.length)
            ? await resolveRecipients(p)
            : p.to_email
              ? [String(p.to_email).toLowerCase()]
              : [];
        if (!recipients.length) {
          throw new Error('No recipients. Add To email or audience countries with matching customers.');
        }
        if (recipients.length > 50 && !window.confirm(`Send to ${recipients.length} customers?`)) {
          return;
        }
        let ok = 0;
        const failures: string[] = [];
        for (const to of recipients) {
          try {
            await sendOutboundEmail({
              to_email: to,
              subject: String(p.subject || row.name),
              body: String(p.body || ''),
            });
            ok += 1;
          } catch (err) {
            failures.push(`${to}: ${err instanceof Error ? err.message : 'failed'}`);
          }
        }
        if (ok === 0) {
          throw new Error(failures[0] || 'All email sends failed. Is RESEND_API_KEY set on the Edge Function?');
        }
        await markSent(row.id, ok);
        toast.success(
          failures.length
            ? `Email sent to ${ok}/${recipients.length} (some failed).`
            : `Email sent to ${ok} recipient${ok === 1 ? '' : 's'}.`
        );
      } else {
        let title = String(p.offer_title || '');
        let summary = p.summary ? String(p.summary) : '';
        let href = String(p.href || campaignLinkUrl(p) || '/offers');
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
        await markSent(row.id, result.sent || 0);
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
    if (editingId === id) resetForm();
    await load();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Marketing campaigns</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ops campaigns with audience targeting, blog/inventory links, Resend email (test + segment), and honest sent counts.
          Not a full ESP — no open tracking, no cron scheduler.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Megaphone className="h-5 w-5" />
            {editingId ? 'Edit campaign' : 'New campaign'}
          </CardTitle>
          <CardDescription>
            Save as draft or scheduled, then Send now / Send to segment when ready.
            {editingId ? (
              <Button type="button" variant="link" className="h-auto px-1" onClick={resetForm}>
                Cancel edit
              </Button>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(event) => void saveCampaign(event)}>
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

            <div className="grid gap-3 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-foreground">Audience &amp; links</p>
              <div className="space-y-1.5">
                <Label htmlFor="audience-countries">Customer countries (email segment)</Label>
                <Input
                  id="audience-countries"
                  value={audienceCountries}
                  onChange={(event) => setAudienceCountries(event.target.value)}
                  placeholder="PNG, Fiji, Solomon Islands"
                />
                <p className="text-[11px] text-muted-foreground">
                  Comma-separated. Segment send matches active customers with email + country.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Featured stock origins (copy / targeting hint)</Label>
                <div className="flex flex-wrap gap-3">
                  {STOCK_ORIGINS.map((origin) => (
                    <label key={origin.value} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={audienceOrigins.includes(origin.value)}
                        onChange={() => toggleOrigin(origin.value)}
                      />
                      {origin.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="blog-link">Blog post</Label>
                  <select
                    id="blog-link"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={blogPostId}
                    onChange={(event) => {
                      setBlogPostId(event.target.value);
                      if (event.target.value) {
                        setVehicleId('');
                        setPartId('');
                      }
                    }}
                  >
                    <option value="">None</option>
                    {blogPosts.map((post) => (
                      <option key={post.id} value={post.id}>{post.title}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle-link">Featured vehicle</Label>
                  <select
                    id="vehicle-link"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={vehicleId}
                    onChange={(event) => {
                      setVehicleId(event.target.value);
                      if (event.target.value) {
                        setBlogPostId('');
                        setPartId('');
                      }
                    }}
                  >
                    <option value="">None</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="part-link">Featured part</Label>
                  <select
                    id="part-link"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={partId}
                    onChange={(event) => {
                      setPartId(event.target.value);
                      if (event.target.value) {
                        setBlogPostId('');
                        setVehicleId('');
                      }
                    }}
                  >
                    <option value="">None</option>
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
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
                  <Label htmlFor="push-url">URL path (overridden by blog/inventory link)</Label>
                  <Input id="push-url" value={pushUrl} onChange={(event) => setPushUrl(event.target.value)} placeholder="/offers" />
                </div>
              </div>
            ) : null}

            {channel === 'email' ? (
              <div className="grid gap-4 rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Uses Resend via <code className="text-foreground">send-outbound-email</code>.
                  Requires Edge secret <code className="text-foreground">RESEND_API_KEY</code> — otherwise send returns a clear error (no fake success).
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="email-to">To (single / test default)</Label>
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

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingId ? 'Update campaign' : 'Save campaign'}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={resetForm}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Campaigns</CardTitle>
          <CardDescription>
            <code className="text-foreground">sent_count</code> tracks successful deliveries only. Scheduled is a status label — no cron dispatcher.
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
                    <Badge variant="secondary">sent {row.sent_count ?? 0}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {format(new Date(row.created_at), 'dd MMM yyyy HH:mm')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{payloadSummary(row)}</p>
                  {row.sent_at ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Marked sent {format(new Date(row.sent_at), 'dd MMM yyyy HH:mm')}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.status !== 'sent' ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={sendingId === row.id}
                          onClick={() => fillFromRow(row)}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={sendingId === row.id}
                          onClick={() => void sendNow(row, 'full')}
                        >
                          {sendingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Send now
                        </Button>
                        {row.channel === 'email' ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={sendingId === row.id}
                              onClick={() => void sendTestEmail(row)}
                            >
                              Send test
                            </Button>
                            {(row.payload?.audience_countries?.length || 0) > 0 ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={sendingId === row.id}
                                onClick={() => void sendNow(row, 'segment')}
                              >
                                Send to segment
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </>
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

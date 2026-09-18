'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { sendWebPush } from '@/lib/web-push';
import type { SiteOffer } from '@/lib/types';

export default function AdminOffersPage() {
  const [rows, setRows] = useState<SiteOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [href, setHref] = useState('/parts');
  const [notify, setNotify] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('site_offers').select('*').order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setRows((data || []) as SiteOffer[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createOffer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required.');
      return;
    }
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { data, error } = await supabase
      .from('site_offers')
      .insert({
        title: title.trim(),
        summary: summary.trim() || null,
        href: href.trim() || '/parts',
        is_published: true,
        published_at: new Date().toISOString(),
        created_by: sessionData.session?.user.id || null,
      })
      .select('*')
      .single();
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }

    if (notify) {
      try {
        const result = await sendWebPush({
          topic: 'deals',
          title: `Deal: ${data.title}`,
          body: data.summary || 'New export deal from ANSHA Trading.',
          url: data.href || '/parts',
        });
        toast.success(`Offer published. Push sent to ${result.sent} devices.`);
      } catch (pushError) {
        toast.error(pushError instanceof Error ? pushError.message : 'Offer saved, but push failed. Check VAPID secrets.');
      }
    } else {
      toast.success('Offer published.');
    }

    setTitle('');
    setSummary('');
    setHref('/parts');
    setSaving(false);
    await load();
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this offer?')) return;
    const { error } = await supabase.from('site_offers').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Offer deleted.');
    await load();
  };

  const resend = async (row: SiteOffer) => {
    setResendingId(row.id);
    try {
      const result = await sendWebPush({
        topic: 'deals',
        title: `Deal: ${row.title}`,
        body: row.summary || 'New export deal from ANSHA Trading.',
        url: row.href || '/parts',
      });
      toast.success(`Push sent to ${result.sent} devices.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Push failed.');
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-1 sm:px-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deals &amp; PWA push</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Publish export offers and optionally notify visitors who enabled deal alerts.
        </p>
      </div>

      <Card className="border-accent/20 bg-accent/[0.04]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-accent" />
            How notifications work
          </CardTitle>
          <CardDescription>
            Staff must opt in per publish — nothing auto-sends from the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Visitors tap <strong className="text-foreground">Enable alerts</strong> on the public site.
            </li>
            <li>Publish a deal here (or an Insight with “PWA push on publish”).</li>
            <li>Subscribers get a notification that opens the offer or article URL.</li>
          </ol>
          <p className="text-xs leading-relaxed">
            Needs the public VAPID key on Vercel and matching Edge secrets for{' '}
            <code className="text-foreground">send-web-push</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">New offer</CardTitle>
          <CardDescription>Published immediately to <code className="text-xs">/offers</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(event) => void createOffer(event)}>
            <div className="space-y-1.5">
              <Label htmlFor="offer-title">Title</Label>
              <Input
                id="offer-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={160}
                placeholder="e.g. March spare-parts package"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-summary">Summary</Label>
              <Textarea
                id="offer-summary"
                rows={3}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={500}
                placeholder="Short description shown on /offers and in the push body"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-href">Link path</Label>
              <Input
                id="offer-href"
                value={href}
                onChange={(event) => setHref(event.target.value)}
                placeholder="/parts"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Relative path such as /parts or /offers.</p>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 px-3 py-3 sm:items-center">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="notify-push" className="cursor-pointer text-sm font-medium leading-snug">
                  Send PWA push to deal subscribers
                </Label>
                <p className="text-xs text-muted-foreground">
                  Uses topic <code className="text-foreground">deals</code>. Turn off to publish quietly.
                </p>
              </div>
              <Switch id="notify-push" checked={notify} onCheckedChange={setNotify} />
            </div>

            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Publishing…' : 'Publish offer'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">Published deals</h2>
          {!loading ? (
            <span className="text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? 'offer' : 'offers'}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">No offers yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Publish your first deal above.</p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-base leading-snug">{row.title}</strong>
                      {row.is_published ? (
                        <Badge variant="outline">Published</Badge>
                      ) : (
                        <Badge variant="outline">Draft</Badge>
                      )}
                    </div>
                    {row.summary ? <p className="text-sm text-muted-foreground">{row.summary}</p> : null}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-mono">
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        {row.href}
                      </span>
                      <span>{format(new Date(row.created_at), 'dd MMM yyyy HH:mm')}</span>
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={resendingId === row.id}
                      onClick={() => void resend(row)}
                    >
                      {resendingId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Bell className="h-4 w-4" />
                      )}
                      Resend push
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                      onClick={() => void remove(row.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

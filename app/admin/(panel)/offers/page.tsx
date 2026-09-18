'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { sendWebPush } from '@/lib/web-push';
import type { SiteOffer } from '@/lib/types';

export default function AdminOffersPage() {
  const [rows, setRows] = useState<SiteOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deals and offers</h1>
        <p className="text-sm text-muted-foreground">Publish offers and optionally push them to PWA subscribers.</p>
      </div>

      <Card className="border-accent/20 bg-accent/[0.04]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-accent" />
            How PWA notifications work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Visitors install or open the public site and tap <strong className="text-foreground">Enable alerts</strong>.</li>
            <li>Their browser stores a push endpoint in <code className="text-foreground">push_subscriptions</code>.</li>
            <li>When you publish a deal here (or an Insight with “PWA push on publish”), staff invokes <code className="text-foreground">send-web-push</code>.</li>
            <li>Subscribers get a notification; tapping it opens the offer or article URL.</li>
          </ol>
          <p>
            Requires <code className="text-foreground">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> on Vercel and Edge secrets
            <code className="text-foreground"> VAPID_PUBLIC_KEY</code> + <code className="text-foreground">VAPID_PRIVATE_KEY</code>.
            Notifications only fire when staff opts in — nothing is sent automatically from the database.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New offer</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(event) => void createOffer(event)}>
            <div className="space-y-1.5">
              <Label htmlFor="offer-title">Title</Label>
              <Input id="offer-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-summary">Summary</Label>
              <Textarea id="offer-summary" rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-href">Link path</Label>
              <Input id="offer-href" value={href} onChange={(event) => setHref(event.target.value)} placeholder="/parts" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
              Send PWA push to deal subscribers
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Publish offer
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{row.title}</strong>
                {row.is_published ? <Badge variant="outline">Published</Badge> : <Badge variant="outline">Draft</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {format(new Date(row.created_at), 'dd MMM yyyy HH:mm')}
                </span>
              </div>
              {row.summary ? <p className="mt-2 text-sm text-muted-foreground">{row.summary}</p> : null}
              <p className="mt-1 font-mono text-xs text-muted-foreground">{row.href}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void resend(row)}>
                  <Bell className="h-4 w-4" />
                  Resend push
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void remove(row.id)}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
          {rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No offers yet.</p> : null}
        </ul>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CarFront, ExternalLink, Loader2, Package, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDealDiscount, formatDealSalePrice, type InventoryPick } from '@/lib/site-offers';
import { supabase } from '@/lib/supabase/client';
import { sendWebPush } from '@/lib/web-push';
import type { AdminProfile, SiteOffer } from '@/lib/types';

type LinkTarget = 'general' | 'vehicle' | 'part';

export default function AdminOffersPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState<SiteOffer[]>([]);
  const [vehicles, setVehicles] = useState<InventoryPick[]>([]);
  const [parts, setParts] = useState<InventoryPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [linkTarget, setLinkTarget] = useState<LinkTarget>('general');
  const [vehicleId, setVehicleId] = useState('');
  const [partId, setPartId] = useState('');
  const [href, setHref] = useState('/parts');
  const [discountPercent, setDiscountPercent] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/admin');
        return;
      }
      const { data: prof } = await supabase
        .from('admin_profiles')
        .select('role,is_active')
        .eq('id', session.user.id)
        .maybeSingle();
      const profile = prof as Pick<AdminProfile, 'role' | 'is_active'> | null;
      if (!profile || profile.is_active === false || profile.role === 'sales') {
        toast.error('Marketing deals are limited to admin and staff.');
        router.replace('/admin/dashboard');
        return;
      }
      setAllowed(true);
    })();
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    const [offersRes, vehiclesRes, partsRes] = await Promise.all([
      supabase.from('site_offers').select('*').order('created_at', { ascending: false }),
      supabase
        .from('vehicles')
        .select('id, title, slug, stock_number, make, model, year')
        .eq('is_published', true)
        .neq('stock_status', 'sold')
        .order('created_at', { ascending: false })
        .limit(400),
      supabase
        .from('parts')
        .select('id, name, slug, part_code, brand')
        .eq('is_published', true)
        .neq('stock_status', 'sold')
        .order('created_at', { ascending: false })
        .limit(400),
    ]);
    if (offersRes.error) toast.error(offersRes.error.message);
    setRows((offersRes.data || []) as SiteOffer[]);
    setVehicles(
      ((vehiclesRes.data || []) as Array<{
        id: string;
        title: string;
        slug: string;
        stock_number: string | null;
        make: string;
        model: string;
        year: number | null;
      }>).map((row) => ({
        id: row.id,
        slug: row.slug,
        label: [row.stock_number, row.title || `${row.year || ''} ${row.make} ${row.model}`.trim()]
          .filter(Boolean)
          .join(' · '),
      })),
    );
    setParts(
      ((partsRes.data || []) as Array<{
        id: string;
        name: string;
        slug: string;
        part_code: string;
        brand: string | null;
      }>).map((row) => ({
        id: row.id,
        slug: row.slug,
        label: [row.part_code, row.brand, row.name].filter(Boolean).join(' · '),
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const resolvedHref = useMemo(() => {
    if (linkTarget === 'vehicle') {
      const pick = vehicles.find((row) => row.id === vehicleId);
      return pick ? `/vehicles/${pick.slug}` : '/vehicles';
    }
    if (linkTarget === 'part') {
      const pick = parts.find((row) => row.id === partId);
      return pick ? `/parts/${pick.slug}` : '/parts';
    }
    return href.trim() || '/parts';
  }, [href, linkTarget, partId, parts, vehicleId, vehicles]);

  const createOffer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required.');
      return;
    }
    if (linkTarget === 'vehicle' && !vehicleId) {
      toast.error('Select a vehicle for this deal.');
      return;
    }
    if (linkTarget === 'part' && !partId) {
      toast.error('Select a part for this deal.');
      return;
    }

    const discountValue = discountPercent.trim() === '' ? null : Number(discountPercent);
    const saleValue = salePrice.trim() === '' ? null : Number(salePrice);
    if (discountValue != null && (Number.isNaN(discountValue) || discountValue < 0 || discountValue > 100)) {
      toast.error('Discount must be between 0 and 100.');
      return;
    }
    if (saleValue != null && (Number.isNaN(saleValue) || saleValue < 0)) {
      toast.error('Sale price must be zero or greater.');
      return;
    }

    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { data, error } = await supabase
      .from('site_offers')
      .insert({
        title: title.trim(),
        summary: summary.trim() || null,
        href: resolvedHref,
        vehicle_id: linkTarget === 'vehicle' ? vehicleId : null,
        part_id: linkTarget === 'part' ? partId : null,
        discount_percent: discountValue,
        sale_price: saleValue,
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
          url: data.href || '/offers',
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
    setLinkTarget('general');
    setVehicleId('');
    setPartId('');
    setHref('/parts');
    setDiscountPercent('');
    setSalePrice('');
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
        url: row.href || '/offers',
      });
      toast.success(`Push sent to ${result.sent} devices.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Push failed.');
    } finally {
      setResendingId(null);
    }
  };

  const inventoryLabel = (row: SiteOffer) => {
    if (row.vehicle_id) {
      const pick = vehicles.find((item) => item.id === row.vehicle_id);
      return pick ? `Vehicle · ${pick.label}` : 'Linked vehicle';
    }
    if (row.part_id) {
      const pick = parts.find((item) => item.id === row.part_id);
      return pick ? `Part · ${pick.label}` : 'Linked part';
    }
    return null;
  };

  if (!allowed) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-1 sm:px-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deals &amp; PWA push</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Publish export offers tied to a vehicle or part, or a general catalog link. Optionally notify deal subscribers.
        </p>
      </div>

      <Card className="border-accent/20 bg-accent/[0.04]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-accent" />
            How inventory deals work
          </CardTitle>
          <CardDescription>
            Link a published vehicle or part so `/offers` and the inventory detail page show the deal clearly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Choose Vehicle or Part, then pick the stock item.</li>
            <li>Optionally set a discount % and/or sale price (display only — list price on stock is unchanged).</li>
            <li>Publish; visitors see it on `/offers` and on that item&apos;s public page.</li>
          </ol>
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
                placeholder="Short description shown on /offers, inventory detail, and push body"
              />
            </div>

            <div className="space-y-2">
              <Label>Attach to inventory</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'general', label: 'General link', icon: ExternalLink },
                    { value: 'vehicle', label: 'Vehicle', icon: CarFront },
                    { value: 'part', label: 'Part', icon: Package },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLinkTarget(option.value)}
                    className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition sm:text-sm ${
                      linkTarget === option.value
                        ? 'border-accent bg-accent/10 text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-accent/40'
                    }`}
                  >
                    <option.icon className="h-4 w-4" />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {linkTarget === 'vehicle' ? (
              <div className="space-y-1.5">
                <Label htmlFor="offer-vehicle">Vehicle</Label>
                <select
                  id="offer-vehicle"
                  value={vehicleId}
                  onChange={(event) => setVehicleId(event.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  <option value="">Select published vehicle…</option>
                  {vehicles.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Opens {resolvedHref} on the public site.</p>
              </div>
            ) : null}

            {linkTarget === 'part' ? (
              <div className="space-y-1.5">
                <Label htmlFor="offer-part">Part</Label>
                <select
                  id="offer-part"
                  value={partId}
                  onChange={(event) => setPartId(event.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  <option value="">Select published part…</option>
                  {parts.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Opens {resolvedHref} on the public site.</p>
              </div>
            ) : null}

            {linkTarget === 'general' ? (
              <div className="space-y-1.5">
                <Label htmlFor="offer-href">Link path</Label>
                <Input
                  id="offer-href"
                  value={href}
                  onChange={(event) => setHref(event.target.value)}
                  placeholder="/parts"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">Relative path such as /parts, /vehicles, or /contact.</p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="offer-discount">Discount % (optional)</Label>
                <Input
                  id="offer-discount"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={discountPercent}
                  onChange={(event) => setDiscountPercent(event.target.value)}
                  placeholder="e.g. 10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-sale">Sale / deal price (optional)</Label>
                <Input
                  id="offer-sale"
                  type="number"
                  min={0}
                  step="0.01"
                  value={salePrice}
                  onChange={(event) => setSalePrice(event.target.value)}
                  placeholder="Display price only"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Pricing fields are for public display on the deal — they do not change the inventory list price in ERP.
            </p>

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
            {rows.map((row) => {
              const linked = inventoryLabel(row);
              const discountLabel = formatDealDiscount(row.discount_percent);
              const saleLabel = formatDealSalePrice(row.sale_price);
              return (
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
                        {discountLabel ? <Badge className="bg-accent text-white">{discountLabel}</Badge> : null}
                        {saleLabel ? <Badge variant="secondary">{saleLabel}</Badge> : null}
                      </div>
                      {row.summary ? <p className="text-sm text-muted-foreground">{row.summary}</p> : null}
                      {linked ? <p className="text-xs font-medium text-foreground">{linked}</p> : null}
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
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

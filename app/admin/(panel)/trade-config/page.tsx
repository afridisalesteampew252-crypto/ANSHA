'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EXPORT_MARKETS } from '@/lib/export-markets';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile } from '@/lib/types';

type TradeSettings = {
  base_currency: string;
  usd_rate: number | null;
  eur_rate: number | null;
  gbp_rate: number | null;
  default_freight_notes: string | null;
  default_export_policy: string | null;
};

type MarketRow = {
  country_code: string;
  country_name: string;
  import_policy: string;
  freight_notes: string;
  exchange_rate_note: string;
  is_active: boolean;
};

export default function AdminTradeConfigPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<TradeSettings>({
    base_currency: 'AED',
    usd_rate: null,
    eur_rate: null,
    gbp_rate: null,
    default_freight_notes: '',
    default_export_policy: '',
  });
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [selected, setSelected] = useState('AE');

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/admin');
        return;
      }
      const { data: prof } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      const role = (prof as AdminProfile | null)?.role;
      if (!prof || prof.is_active === false || role === 'sales') {
        toast.error('Trade config is limited to admin and staff.');
        router.replace('/admin/dashboard');
        return;
      }
      setAllowed(true);

      const [{ data: trade }, { data: rows }] = await Promise.all([
        supabase.from('site_trade_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('export_market_configs').select('*'),
      ]);

      if (trade) {
        setSettings({
          base_currency: trade.base_currency || 'AED',
          usd_rate: trade.usd_rate,
          eur_rate: trade.eur_rate,
          gbp_rate: trade.gbp_rate,
          default_freight_notes: trade.default_freight_notes || '',
          default_export_policy: trade.default_export_policy || '',
        });
      }

      const byCode = new Map((rows || []).map((r) => [r.country_code as string, r]));
      setMarkets(
        EXPORT_MARKETS.map((m) => {
          const existing = byCode.get(m.code);
          return {
            country_code: m.code,
            country_name: m.name,
            import_policy: (existing?.import_policy as string) || m.defaultImportNotes,
            freight_notes: (existing?.freight_notes as string) || '',
            exchange_rate_note: (existing?.exchange_rate_note as string) || '',
            is_active: existing?.is_active !== false,
          };
        })
      );
      setLoading(false);
    })();
  }, [router]);

  const current = markets.find((m) => m.country_code === selected) || markets[0];

  const updateCurrent = (patch: Partial<MarketRow>) => {
    setMarkets((prev) =>
      prev.map((m) => (m.country_code === selected ? { ...m, ...patch } : m))
    );
  };

  const saveAll = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: settingsError } = await supabase.from('site_trade_settings').upsert({
      id: 1,
      ...settings,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    });
    if (settingsError) {
      toast.error(settingsError.message);
      setSaving(false);
      return;
    }

    const payload = markets.map((m) => ({
      ...m,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }));
    const { error: marketsError } = await supabase.from('export_market_configs').upsert(payload);
    if (marketsError) {
      toast.error(marketsError.message);
      setSaving(false);
      return;
    }

    toast.success('Trade configuration saved');
    setSaving(false);
  };

  if (loading || !allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trade configuration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Exchange rates, default freight notes, and per-country import policies shown when customers tap a flag.
          </p>
        </div>
        <Button type="button" onClick={() => void saveAll()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Exchange rates</h2>
        <p className="mt-1 text-sm text-muted-foreground">Reference rates vs {settings.base_currency} (display / quoting notes — not live FX).</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div>
            <Label htmlFor="base">Base</Label>
            <Input id="base" value={settings.base_currency} onChange={(e) => setSettings((s) => ({ ...s, base_currency: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <Label htmlFor="usd">1 USD =</Label>
            <Input id="usd" type="number" step="0.0001" value={settings.usd_rate ?? ''} onChange={(e) => setSettings((s) => ({ ...s, usd_rate: e.target.value ? Number(e.target.value) : null }))} />
          </div>
          <div>
            <Label htmlFor="eur">1 EUR =</Label>
            <Input id="eur" type="number" step="0.0001" value={settings.eur_rate ?? ''} onChange={(e) => setSettings((s) => ({ ...s, eur_rate: e.target.value ? Number(e.target.value) : null }))} />
          </div>
          <div>
            <Label htmlFor="gbp">1 GBP =</Label>
            <Input id="gbp" type="number" step="0.0001" value={settings.gbp_rate ?? ''} onChange={(e) => setSettings((s) => ({ ...s, gbp_rate: e.target.value ? Number(e.target.value) : null }))} />
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="freight">Default freight notes</Label>
            <Textarea id="freight" rows={4} value={settings.default_freight_notes || ''} onChange={(e) => setSettings((s) => ({ ...s, default_freight_notes: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="policy">Default export policy</Label>
            <Textarea id="policy" rows={4} value={settings.default_export_policy || ''} onChange={(e) => setSettings((s) => ({ ...s, default_export_policy: e.target.value }))} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Per-country import policies</h2>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row">
          <div className="flex max-h-80 shrink-0 flex-col gap-1 overflow-y-auto lg:w-56">
            {markets.map((m) => (
              <button
                key={m.country_code}
                type="button"
                onClick={() => setSelected(m.country_code)}
                className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  selected === m.country_code ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                }`}
              >
                {m.country_code} — {m.country_name}
              </button>
            ))}
          </div>
          {current ? (
            <div className="min-w-0 flex-1 space-y-3">
              <h3 className="text-lg font-bold">{current.country_name}</h3>
              <div>
                <Label>Import policy</Label>
                <Textarea rows={6} value={current.import_policy} onChange={(e) => updateCurrent({ import_policy: e.target.value })} />
              </div>
              <div>
                <Label>Freight notes</Label>
                <Textarea rows={3} value={current.freight_notes} onChange={(e) => updateCurrent({ freight_notes: e.target.value })} />
              </div>
              <div>
                <Label>Exchange / pricing note</Label>
                <Textarea rows={3} value={current.exchange_rate_note} onChange={(e) => updateCurrent({ exchange_rate_note: e.target.value })} />
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

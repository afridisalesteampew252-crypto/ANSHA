'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Ship } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EXPORT_MARKETS } from '@/lib/export-markets';
import { EXPORT_MARKET_SHIPPING_GUIDE_BY_CODE } from '@/lib/export-market-shipping';
import { isOpsRole } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole } from '@/lib/types';

type PolicyConfig = {
  country_code: string;
  country_name: string;
  import_policy: string | null;
  freight_notes: string | null;
  exchange_rate_note: string | null;
  year_restriction: string | null;
  destination_port: string | null;
  transit_time: string | null;
  vessel_schedule: string | null;
  shipping_line: string | null;
  inspection: string | null;
  route_note: string | null;
  is_active: boolean;
};

type FormState = {
  import_policy: string;
  freight_notes: string;
  exchange_rate_note: string;
  year_restriction: string;
  destination_port: string;
  transit_time: string;
  vessel_schedule: string;
  shipping_line: string;
  inspection: string;
  route_note: string;
};

const blankForm = (): FormState => ({
  import_policy: '',
  freight_notes: '',
  exchange_rate_note: '',
  year_restriction: '',
  destination_port: '',
  transit_time: '',
  vessel_schedule: '',
  shipping_line: '',
  inspection: '',
  route_note: '',
});

const detailFields: Array<{ key: keyof Pick<FormState, 'year_restriction' | 'destination_port' | 'transit_time' | 'vessel_schedule' | 'shipping_line' | 'inspection' | 'route_note'>; label: string; placeholder: string }> = [
  { key: 'year_restriction', label: 'Vehicle age / year restriction', placeholder: 'Example: Maximum 8 years old — verify with destination customs' },
  { key: 'destination_port', label: 'Destination port / inland route', placeholder: 'Example: Mombasa; inland delivery to Kampala via Kenya' },
  { key: 'transit_time', label: 'Estimated shipment time', placeholder: 'Example: 24–34 days (indicative)' },
  { key: 'vessel_schedule', label: 'Vessel schedule', placeholder: 'Example: Monthly RoRo — confirm with carrier' },
  { key: 'shipping_line', label: 'Shipping line', placeholder: 'Example: Carrier name or “Confirm with forwarder”' },
  { key: 'inspection', label: 'Inspection / customs requirements', placeholder: 'List inspection body or documents; write “Confirm” if unknown' },
  { key: 'route_note', label: 'Route notes / caveats', placeholder: 'For landlocked routes, list transit ports, inland legs, and charges to confirm' },
];

export default function CountryPoliciesPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [rows, setRows] = useState<PolicyConfig[]>([]);
  const [countryCode, setCountryCode] = useState(EXPORT_MARKETS[0]?.code || '');
  const [form, setForm] = useState<FormState>(blankForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canWrite = isOpsRole(role);
  const market = useMemo(() => EXPORT_MARKETS.find((m) => m.code === countryCode) || null, [countryCode]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase
        .from('admin_profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      setRole((profile?.role as AdminRole) || null);
    }
    const { data, error } = await supabase
      .from('export_market_configs')
      .select('*')
      .order('country_name');
    if (error) toast.error(error.message);
    setRows((data || []) as PolicyConfig[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!market) return;
    const row = rows.find((item) => item.country_code === market.code);
    const guide = EXPORT_MARKET_SHIPPING_GUIDE_BY_CODE[market.code];
    setForm({
      import_policy: row?.import_policy || market.defaultImportNotes || '',
      freight_notes: row?.freight_notes || '',
      exchange_rate_note: row?.exchange_rate_note || '',
      year_restriction: row?.year_restriction || guide?.yearRestriction || '',
      destination_port: row?.destination_port || guide?.destinationPort || '',
      transit_time: row?.transit_time || guide?.transitTime || '',
      vessel_schedule: row?.vessel_schedule || guide?.vesselSchedule || '',
      shipping_line: row?.shipping_line || guide?.shippingLine || '',
      inspection: row?.inspection || guide?.inspection || '',
      route_note: row?.route_note || guide?.routeNote || '',
    });
  }, [market, rows]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite || !market) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('export_market_configs')
      .upsert({
        country_code: market.code,
        country_name: market.name,
        ...form,
        is_active: true,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'country_code' });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Policy for ${market.name} saved.`);
    await load();
  };

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!canWrite) {
    return <div className="mx-auto max-w-lg p-6 text-center text-sm text-muted-foreground">Country policies can be changed by admin and staff users.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start gap-3">
        <Ship className="mt-1 h-6 w-6 text-accent" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Configuration</p>
          <h1 className="text-2xl font-black tracking-tight">Country import policies</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Choose a country and edit the guidance shown on its public export page. Admin entries override the supplied guide. Leave a field blank to use its supplied guide value where one exists.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Country policy</CardTitle>
          <CardDescription>Saved policy details appear on the public country page. Keep uncertain laws and sailing details marked as “Confirm”.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="policy-country">Country</Label>
                <select
                  id="policy-country"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={countryCode}
                  onChange={(event) => setCountryCode(event.target.value)}
                >
                  {EXPORT_MARKETS.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {detailFields.map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <Textarea
                    id={key}
                    value={form[key]}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder={placeholder}
                    rows={2}
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="import-policy">Import policy / buyer guidance</Label>
                <Textarea id="import-policy" value={form.import_policy} onChange={(event) => setForm((current) => ({ ...current, import_policy: event.target.value }))} rows={4} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="freight-notes">Additional freight notes</Label>
                <Textarea id="freight-notes" value={form.freight_notes} onChange={(event) => setForm((current) => ({ ...current, freight_notes: event.target.value }))} rows={4} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="exchange-rate-note">Exchange / pricing notes</Label>
                <Input id="exchange-rate-note" value={form.exchange_rate_note} onChange={(event) => setForm((current) => ({ ...current, exchange_rate_note: event.target.value }))} placeholder="Optional" />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving…' : 'Save country policy'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Save, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { FALLBACK_FINANCE_SETTINGS, type FinanceSettings } from '@/lib/use-finance-settings';

const sections = [
  { href: '/admin/configuration', title: 'Export master lists', description: 'Countries, ports, vessels and voyages' },
  { href: '/admin/trade-config', title: 'Trade and market policies', description: 'Reference rates, freight notes and country policy' },
  { href: '/admin/configuration/shipping-companies', title: 'Shipping companies', description: 'Carriers used in export operations' },
  { href: '/admin/configuration/yards', title: 'Yards', description: 'Vehicle storage locations' },
  { href: '/admin/freight-charges', title: 'Freight charges', description: 'Route and carrier charges' },
  { href: '/admin/bank-accounts', title: 'Bank accounts', description: 'Account details and bank currencies' },
];

export default function SystemConfigurationPage() {
  const [settings, setSettings] = useState<FinanceSettings>(FALLBACK_FINANCE_SETTINGS);
  const [currencyInput, setCurrencyInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const [profile, row] = await Promise.all([
        supabase.from('admin_profiles').select('role,is_active').eq('id', user.id).maybeSingle(),
        supabase.from('system_finance_settings').select('default_currency,enabled_currencies').eq('id', 1).maybeSingle(),
      ]);
      setIsAdmin(profile.data?.role === 'admin' && profile.data?.is_active !== false);
      if (row.error) toast.error('Currency settings could not be loaded.');
      else if (row.data) setSettings(row.data as FinanceSettings);
      setLoading(false);
    })();
  }, []);

  const addCurrency = () => {
    const code = currencyInput.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) { toast.error('Enter a three-letter currency code, such as USD.'); return; }
    if (settings.enabled_currencies.includes(code)) { setCurrencyInput(''); return; }
    if (settings.enabled_currencies.length >= 30) { toast.error('Maximum 30 currencies.'); return; }
    setSettings((current) => ({ ...current, enabled_currencies: [...current.enabled_currencies, code].sort() }));
    setCurrencyInput('');
  };

  const save = async () => {
    if (!isAdmin || !settings.enabled_currencies.includes(settings.default_currency)) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('system_finance_settings')
      .update({ ...settings, updated_at: new Date().toISOString(), updated_by: user?.id })
      .eq('id', 1).select('id').single();
    setSaving(false);
    if (error || !data) { toast.error(error?.message || 'Currency settings were not saved.'); return; }
    toast.success('Currency settings saved.');
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return <div className="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold"><Settings2 className="h-6 w-6 text-accent" />System configuration</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage operational lists and finance defaults from the admin workspace.</p>
    </div>
    <Card>
      <CardHeader>
        <CardTitle>Finance currencies</CardTitle>
        <CardDescription>Sets choices and defaults for expenses, manual journals and financial reports. Existing transactions keep their recorded currency. No exchange conversion is applied.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="max-w-xs space-y-2">
          <Label htmlFor="default-currency">Default currency</Label>
          <select id="default-currency" value={settings.default_currency} disabled={!isAdmin} onChange={(event) => setSettings((current) => ({ ...current, default_currency: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            {settings.enabled_currencies.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Enabled currencies</Label>
          <div className="flex flex-wrap gap-2">
            {settings.enabled_currencies.map((code) => <span key={code} className="inline-flex items-center gap-1 rounded-full border bg-secondary px-3 py-1 text-sm font-semibold">{code}
              {isAdmin && settings.enabled_currencies.length > 1 && code !== settings.default_currency ? <button type="button" aria-label={`Remove ${code}`} onClick={() => setSettings((current) => ({ ...current, enabled_currencies: current.enabled_currencies.filter((value) => value !== code) }))}><X className="h-4 w-4" /></button> : null}
            </span>)}
          </div>
          {isAdmin && <div className="flex max-w-xs gap-2"><Input aria-label="New currency code" placeholder="e.g. JMD" maxLength={3} value={currencyInput} onChange={(event) => setCurrencyInput(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCurrency(); } }} /><Button type="button" variant="outline" onClick={addCurrency}><Plus className="h-4 w-4" />Add</Button></div>}
        </div>
        {isAdmin ? <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save currency settings</Button> : <p className="text-sm text-muted-foreground">Only admins can change these defaults.</p>}
      </CardContent>
    </Card>
    <div className="grid gap-3 sm:grid-cols-2">
      {sections.map((section) => <Link key={section.href} href={section.href} className="rounded-xl border bg-card p-4 transition hover:border-accent/50 hover:bg-secondary/30">
        <span className="font-semibold">{section.title}</span><span className="mt-1 block text-sm text-muted-foreground">{section.description}</span>
      </Link>)}
    </div>
  </div>;
}

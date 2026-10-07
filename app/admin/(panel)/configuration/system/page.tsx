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
import { DEFAULT_BRAND_ACCENT, normalizeHexColor, persistBrandAccentColor } from '@/lib/brand-theme';

const sections = [
  { href: '/admin/system-health', title: 'System health', description: 'Website, database and notifications with alert history' },
  { href: '/admin/presence', title: 'Online now', description: 'Active staff and customer portal accounts' },
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
  const [brandAccentColor, setBrandAccentColor] = useState(DEFAULT_BRAND_ACCENT);
  const [savingBrandAccent, setSavingBrandAccent] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const [profile, row, brandSettings] = await Promise.all([
        supabase.from('admin_profiles').select('role,is_active').eq('id', user.id).maybeSingle(),
        supabase.from('system_finance_settings').select('default_currency,enabled_currencies').eq('id', 1).maybeSingle(),
        supabase.from('site_trade_settings').select('brand_accent_color').eq('id', 1).maybeSingle(),
      ]);
      setIsAdmin(profile.data?.role === 'admin' && profile.data?.is_active !== false);
      if (row.error) toast.error('Currency settings could not be loaded.');
      else if (row.data) setSettings(row.data as FinanceSettings);
      if (brandSettings.data?.brand_accent_color) setBrandAccentColor(normalizeHexColor(brandSettings.data.brand_accent_color) || DEFAULT_BRAND_ACCENT);
      if (brandSettings.error) toast.error('Brand color could not be loaded.');
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

  const saveBrandAccent = async () => {
    if (!isAdmin || !normalizeHexColor(brandAccentColor)) return;
    setSavingBrandAccent(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('site_trade_settings')
      .update({ brand_accent_color: brandAccentColor, updated_at: new Date().toISOString(), updated_by: user?.id })
      .eq('id', 1).select('id').single();
    setSavingBrandAccent(false);
    if (error || !data) { toast.error(error?.message || 'Brand color was not saved.'); return; }
    persistBrandAccentColor(brandAccentColor);
    toast.success('Shared brand color saved.');
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
        <CardTitle>Shared brand color</CardTitle>
        <CardDescription>Choose the accent color used across the public website and admin workspace. The site keeps one light appearance.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
            <span className="h-10 w-10 rounded-full border shadow-sm" style={{ backgroundColor: brandAccentColor }} />
            <span className="text-sm font-semibold">{brandAccentColor}</span>
            <Input aria-label="Custom brand color" type="color" value={brandAccentColor} disabled={!isAdmin} onChange={(event) => setBrandAccentColor(event.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer p-1" />
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { name: 'ANSHA red', color: '#D21E1E' },
              { name: 'Ocean blue', color: '#1565C0' },
              { name: 'Emerald', color: '#008A5B' },
              { name: 'Purple', color: '#6B42C1' },
              { name: 'Amber', color: '#D97706' },
            ].map((preset) => (
              <button key={preset.color} type="button" disabled={!isAdmin} onClick={() => setBrandAccentColor(preset.color)} aria-label={preset.name} aria-pressed={brandAccentColor === preset.color} className="h-9 w-9 rounded-full border-2 shadow-sm ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed" style={{ backgroundColor: preset.color, borderColor: brandAccentColor === preset.color ? 'var(--foreground)' : 'white' }} />
            ))}
          </div>
        </div>
        {isAdmin ? <Button type="button" disabled={savingBrandAccent} onClick={() => void saveBrandAccent()}>{savingBrandAccent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save brand color</Button> : <p className="text-sm text-muted-foreground">Only admins can change this setting.</p>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Finance currencies</CardTitle>
        <CardDescription>Sets choices and defaults for invoices, TT receipts, bank accounts, expenses, manual journals and financial reports. Add PKR or any three-letter currency code here. Existing transactions keep their recorded currency; each converted TT keeps its individual bank rate.</CardDescription>
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

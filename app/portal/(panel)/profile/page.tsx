'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookmarkCheck,
  Camera,
  FileText,
  Headphones,
  Loader2,
  LockKeyhole,
  Save,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';

type CustomerRecord = {
  customer_code: string;
  full_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  address: string | null;
  avatar_url: string | null;
  consignee_name: string | null;
  consignee_company: string | null;
  consignee_phone: string | null;
  consignee_email: string | null;
  consignee_address: string | null;
  consignee_country: string | null;
};

type ProfileRecord = {
  full_name: string | null;
  email: string;
  link_status: string;
  created_at: string;
  customers: CustomerRecord | CustomerRecord[] | null;
};

type ProfileForm = {
  fullName: string;
  companyName: string;
  phone: string;
  whatsapp: string;
  country: string;
  address: string;
  consigneeName: string;
  consigneeCompany: string;
  consigneePhone: string;
  consigneeEmail: string;
  consigneeAddress: string;
  consigneeCountry: string;
};

const EMPTY_FORM: ProfileForm = {
  fullName: '', companyName: '', phone: '', whatsapp: '', country: '', address: '',
  consigneeName: '', consigneeCompany: '', consigneePhone: '', consigneeEmail: '',
  consigneeAddress: '', consigneeCountry: '',
};

const PROFILE_FIELDS = [
  ['fullName', 'Full name', 'Your full name', 'text'],
  ['companyName', 'Company name', 'Business or company', 'text'],
  ['phone', 'Phone', '+971...', 'tel'],
  ['whatsapp', 'WhatsApp', '+971...', 'tel'],
  ['country', 'Country', 'Country', 'text'],
] as const;

const CONSIGNEE_FIELDS = [
  ['consigneeName', 'Consignee name', 'Name shown on shipping documents', 'text'],
  ['consigneeCompany', 'Consignee company', 'Company name', 'text'],
  ['consigneePhone', 'Consignee phone', '+1...', 'tel'],
  ['consigneeEmail', 'Consignee email', 'shipping@example.com', 'email'],
  ['consigneeCountry', 'Consignee country', 'Destination country', 'text'],
] as const;

const ACCOUNT_LINKS = [
  { href: '/portal/account', title: 'Statement', description: 'SOA & remittances', icon: WalletCards },
  { href: '/portal/reservations', title: 'Reservations', description: 'Reserved stock', icon: BookmarkCheck },
  { href: '/portal/invoices', title: 'Invoices', description: 'Documents & balances', icon: FileText },
  { href: '/portal/settings', title: 'Security', description: 'Password & privacy', icon: LockKeyhole },
  { href: '/portal/support', title: 'Support', description: 'Message our team', icon: Headphones },
] as const;

function toForm(profile: ProfileRecord, customer: CustomerRecord): ProfileForm {
  return {
    fullName: customer.full_name || profile.full_name || '',
    companyName: customer.company_name || '',
    phone: customer.phone || '',
    whatsapp: customer.whatsapp || '',
    country: customer.country || '',
    address: customer.address || '',
    consigneeName: customer.consignee_name || '',
    consigneeCompany: customer.consignee_company || '',
    consigneePhone: customer.consignee_phone || '',
    consigneeEmail: customer.consignee_email || '',
    consigneeAddress: customer.consignee_address || '',
    consigneeCountry: customer.consignee_country || '',
  };
}

export default function PortalProfilePage() {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const [{ data: authData }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('customer_profiles')
        .select('full_name,email,link_status,created_at,customers(customer_code,full_name,company_name,email,phone,whatsapp,country,address,avatar_url,consignee_name,consignee_company,consignee_phone,consignee_email,consignee_address,consignee_country)')
        .maybeSingle(),
    ]);
    if (error) toast.error(error.message);
    const next = (data as ProfileRecord | null) ?? null;
    const related = next?.customers;
    const customer = Array.isArray(related) ? related[0] : related;
    setVerified(Boolean(authData.user?.email_confirmed_at));
    setProfile(next);
    if (next && customer) {
      setForm(toForm(next, customer));
      setAvatarPath(customer.avatar_url);
      if (customer.avatar_url) {
        const { data: signed } = await supabase.storage.from('profile-images').createSignedUrl(customer.avatar_url, 3600);
        setAvatarUrl(signed?.signedUrl || null);
      } else {
        setAvatarUrl(null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setField = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveProfile = async (event?: FormEvent, nextAvatarPath = avatarPath) => {
    event?.preventDefault();
    if (form.fullName.trim().length < 2) {
      toast.error('Enter your full name.');
      return false;
    }
    setSaving(true);
    const { error } = await supabase.rpc('update_my_customer_profile', {
      p_full_name: form.fullName.trim(),
      p_company_name: form.companyName.trim() || null,
      p_phone: form.phone.trim() || null,
      p_whatsapp: form.whatsapp.trim() || null,
      p_country: form.country.trim() || null,
      p_address: form.address.trim() || null,
      p_avatar_url: nextAvatarPath,
      p_consignee_name: form.consigneeName.trim() || null,
      p_consignee_company: form.consigneeCompany.trim() || null,
      p_consignee_phone: form.consigneePhone.trim() || null,
      p_consignee_email: form.consigneeEmail.trim() || null,
      p_consignee_address: form.consigneeAddress.trim() || null,
      p_consignee_country: form.consigneeCountry.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success('Profile and consignee details saved.');
    return true;
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Use a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Profile image must be smaller than 5 MB.');
      return;
    }
    setUploading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError || new Error('Please sign in again.');
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const nextPath = `self/${authData.user.id}/avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('profile-images').upload(nextPath, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const saved = await saveProfile(undefined, nextPath);
      if (!saved) {
        await supabase.storage.from('profile-images').remove([nextPath]);
        return;
      }
      const previousPath = avatarPath;
      setAvatarPath(nextPath);
      const { data: signed } = await supabase.storage.from('profile-images').createSignedUrl(nextPath, 3600);
      setAvatarUrl(signed?.signedUrl || null);
      if (previousPath?.startsWith(`self/${authData.user.id}/`)) {
        await supabase.storage.from('profile-images').remove([previousPath]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload your profile picture.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>;

  const related = profile?.customers;
  const customer = Array.isArray(related) ? related[0] : related;
  if (!profile || !customer) {
    return <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Your customer profile could not be loaded. Please use support for help.</CardContent></Card>;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-red-500/10 via-background/90 to-cyan-500/10 p-4 shadow-[0_24px_70px_-40px_rgba(15,23,42,.5)] backdrop-blur-xl dark:border-white/10 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              <span className="grid h-20 w-20 overflow-hidden rounded-2xl border-2 border-white bg-accent/10 text-2xl font-black text-accent shadow-lg dark:border-white/15">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Customer profile" className="h-full w-full object-cover" />
                ) : <span className="grid place-items-center">{form.fullName.charAt(0).toUpperCase() || 'C'}</span>}
              </span>
              <label className="absolute -bottom-2 -right-2 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-accent text-white shadow-lg transition hover:scale-105" aria-label="Change profile picture">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={uploading || saving} />
              </label>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Customer account</p>
              <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">{form.fullName}</h1>
              <p className="truncate text-sm text-muted-foreground">{form.companyName || `Customer ${customer.customer_code}`}</p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />{verified ? 'Email verified' : 'Verification pending'}
          </Badge>
        </div>
      </section>

      <form onSubmit={(event) => void saveProfile(event)} className="grid gap-5 xl:grid-cols-2">
        <Card className="border-white/60 bg-card/85 shadow-lg backdrop-blur-xl dark:border-white/10">
          <CardHeader><CardTitle>Personal details</CardTitle><CardDescription>Edit the contact information used by our team.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {PROFILE_FIELDS.map(([field, label, placeholder, type]) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>{label}</Label>
                <Input id={field} type={type} value={form[field]} onChange={(event) => setField(field, event.target.value)} placeholder={placeholder} required={field === 'fullName'} />
              </div>
            ))}
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="portal-email">Portal email</Label><Input id="portal-email" value={profile.email} disabled /><p className="text-xs text-muted-foreground">Contact support to change the login email.</p></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="address">Address</Label><textarea id="address" value={form.address} onChange={(event) => setField('address', event.target.value)} rows={3} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Full billing or contact address" /></div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-card/85 shadow-lg backdrop-blur-xl dark:border-white/10">
          <CardHeader><CardTitle>Consignee details</CardTitle><CardDescription>These details help prepare shipping and delivery documents accurately.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {CONSIGNEE_FIELDS.map(([field, label, placeholder, type]) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>{label}</Label>
                <Input id={field} type={type} value={form[field]} onChange={(event) => setField(field, event.target.value)} placeholder={placeholder} />
              </div>
            ))}
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="consigneeAddress">Consignee address</Label><textarea id="consigneeAddress" value={form.consigneeAddress} onChange={(event) => setField('consigneeAddress', event.target.value)} rows={3} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Complete destination address" /></div>
            <Button type="submit" className="h-11 sm:col-span-2" disabled={saving || uploading}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save profile and consignee</Button>
          </CardContent>
        </Card>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ACCOUNT_LINKS.map(({ href, title, description, icon: Icon }) => (
          <Button key={href} asChild variant="outline" className="h-auto justify-start gap-3 p-4"><Link href={href}><Icon className="h-5 w-5 text-accent" /><span className="text-left"><strong className="block">{title}</strong><small className="text-muted-foreground">{description}</small></span></Link></Button>
        ))}
      </div>

      {profile.link_status === 'review_required' ? <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="p-4 text-sm">Your portal is active. Our team is reviewing a possible existing customer record match; use support if older records are missing.</CardContent></Card> : null}
    </div>
  );
}

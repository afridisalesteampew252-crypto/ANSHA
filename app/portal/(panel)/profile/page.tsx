'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookmarkCheck, CalendarDays, FileText, Headphones, Loader2, Mail, MapPin, Phone, Settings, ShieldCheck, UserRound, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
};

type ProfileRecord = {
  full_name: string | null;
  email: string;
  link_status: string;
  created_at: string;
  customers: CustomerRecord | CustomerRecord[] | null;
};

function valueOrDash(value: string | null | undefined) {
  return value?.trim() || 'Not provided';
}

export default function PortalProfilePage() {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: authData }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('customer_profiles')
          .select('full_name, email, link_status, created_at, customers(customer_code, full_name, company_name, email, phone, whatsapp, country, address)')
          .maybeSingle(),
      ]);
      if (error) toast.error(error.message);
      setVerified(Boolean(authData.user?.email_confirmed_at));
      setProfile((data as ProfileRecord | null) ?? null);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const related = profile?.customers;
  const customer = Array.isArray(related) ? related[0] : related;

  if (!profile || !customer) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Your customer profile could not be loaded. Please use live chat for help.
        </CardContent>
      </Card>
    );
  }

  const details = [
    { label: 'Customer ID', value: customer.customer_code, icon: UserRound },
    { label: 'Customer name', value: valueOrDash(customer.full_name || profile.full_name), icon: UserRound },
    { label: 'Company', value: valueOrDash(customer.company_name), icon: FileText },
    { label: 'Portal email', value: profile.email, icon: Mail },
    { label: 'Phone', value: valueOrDash(customer.phone), icon: Phone },
    { label: 'WhatsApp', value: valueOrDash(customer.whatsapp), icon: Phone },
    { label: 'Country', value: valueOrDash(customer.country), icon: MapPin },
    { label: 'Address', value: valueOrDash(customer.address), icon: MapPin },
  ] as const;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My account</h1>
          <p className="text-sm text-muted-foreground">Your ANSHA customer identity, contact details, records, and privacy controls.</p>
        </div>
        <Badge variant="outline" className="w-fit border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <ShieldCheck className="mr-1 h-3.5 w-3.5" />
          {verified ? 'Email verified' : 'Verification pending'}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-lg font-bold text-accent">
              {(customer.full_name || profile.full_name || 'C').charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-lg">{customer.full_name || profile.full_name}</CardTitle>
              <CardDescription className="truncate">{customer.company_name || `Customer ${customer.customer_code}`}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {details.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex min-w-0 items-start gap-3 rounded-lg border p-3.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="break-words text-sm font-medium">{value}</p>
              </div>
            </div>
          ))}
          <div className="flex items-start gap-3 rounded-lg border p-3.5">
            <CalendarDays className="mt-0.5 h-4 w-4 text-accent" />
            <div>
              <p className="text-xs text-muted-foreground">Portal member since</p>
              <p className="text-sm font-medium">{new Date(profile.created_at).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
          <Link href="/portal/account"><WalletCards className="h-5 w-5 text-accent" /><span className="text-left"><strong className="block">Statement</strong><small className="text-muted-foreground">SOA & remittances</small></span></Link>
        </Button>
        <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
          <Link href="/portal/reservations"><BookmarkCheck className="h-5 w-5 text-accent" /><span className="text-left"><strong className="block">Reservations</strong><small className="text-muted-foreground">Reserved stock</small></span></Link>
        </Button>
        <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
          <Link href="/portal/invoices"><FileText className="h-5 w-5 text-accent" /><span className="text-left"><strong className="block">Invoices</strong><small className="text-muted-foreground">Documents & balances</small></span></Link>
        </Button>
        <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
          <Link href="/portal/settings"><Settings className="h-5 w-5 text-accent" /><span className="text-left"><strong className="block">Settings</strong><small className="text-muted-foreground">Privacy & deletion</small></span></Link>
        </Button>
        <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
          <Link href="/portal/support"><Headphones className="h-5 w-5 text-accent" /><span className="text-left"><strong className="block">Support</strong><small className="text-muted-foreground">Secure support inbox</small></span></Link>
        </Button>
      </div>

      {profile.link_status === 'review_required' ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            Your portal is active. Our team is reviewing a possible existing customer record match; use live chat if older invoices are missing.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

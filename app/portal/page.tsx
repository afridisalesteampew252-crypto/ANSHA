'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';

function PortalLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (searchParams.get('error') === 'unauthorized') {
      toast.error('This account does not have customer portal access.');
    }
  }, [searchParams]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('customer_profiles')
          .select('id')
          .eq('id', session.user.id)
          .eq('is_active', true)
          .maybeSingle();
        if (profile) {
          router.replace('/portal/invoices');
          return;
        }
      }
      setChecking(false);
    })();
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setLoading(false);
      toast.error('Invalid email or password.');
      return;
    }

    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('id')
      .eq('id', data.user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error('You do not have customer portal access. Contact ANSHA.');
      return;
    }

    toast.success('Welcome to your portal.');
    router.push('/portal/invoices');
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-accent">
            <ReceiptText className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Customer portal</CardTitle>
          <CardDescription>Sign in to view your reservations, invoices, and account. Staff use the admin login.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portal-email">Email</Label>
              <Input id="portal-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-password">Password</Label>
              <Input id="portal-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PortalLoginInner />
    </Suspense>
  );
}

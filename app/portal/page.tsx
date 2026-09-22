'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ReceiptText, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';

function PortalLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error === 'unauthorized') toast.error('This account does not have active customer portal access.');
    if (error === 'confirmation') toast.error('That confirmation link is invalid or expired.');
    if (error === 'setup') toast.error('We could not finish portal setup. Please sign in again or contact ANSHA.');
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

  const ensureProfile = async (name?: string) => {
    const { error } = await supabase.rpc('ensure_customer_portal_profile', {
      p_full_name: name?.trim() || null,
    });
    if (error) throw error;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    if (mode === 'signup') {
      if (fullName.trim().length < 2) {
        toast.error('Enter your full name.');
        setLoading(false);
        return;
      }
      if (password.length < 8) {
        toast.error('Password must be at least 8 characters.');
        setLoading(false);
        return;
      }

      const callback = `${window.location.origin}/auth/callback?next=/portal/invoices`;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: callback,
          data: { full_name: fullName.trim(), portal: 'customer' },
        },
      });

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        try {
          await ensureProfile(fullName);
          toast.success('Your customer portal is ready.');
          router.push('/portal/catalog');
        } catch (setupError) {
          toast.error(setupError instanceof Error ? setupError.message : 'Portal setup failed.');
        }
      } else {
        setVerificationSent(true);
        toast.success('Check your email to verify your account.');
      }
      setLoading(false);
      return;
    }

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
      try {
        await ensureProfile();
      } catch (setupError) {
        await supabase.auth.signOut();
        setLoading(false);
        toast.error(setupError instanceof Error ? setupError.message : 'Portal access could not be created.');
        return;
      }
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
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-accent">
            {mode === 'signup' ? <UserPlus className="h-6 w-6 text-white" /> : <ReceiptText className="h-6 w-6 text-white" />}
          </div>
          <CardTitle className="text-2xl">{mode === 'signup' ? 'Create customer account' : 'Customer portal'}</CardTitle>
          <CardDescription>
            {mode === 'signup'
              ? 'Register with your customer email to securely connect existing ANSHA records.'
              : 'Sign in to view stock, reservations, invoices, remittances, and your account.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {verificationSent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                We sent a verification link to <strong className="text-foreground">{email}</strong>. Open it to finish
                creating your portal. Verification protects existing customer records.
              </p>
              <Button type="button" variant="outline" className="w-full" onClick={() => setVerificationSent(false)}>
                Use another email
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 rounded-lg bg-secondary p-1">
                <Button type="button" size="sm" variant={mode === 'signin' ? 'default' : 'ghost'} onClick={() => setMode('signin')}>
                  Sign in
                </Button>
                <Button type="button" size="sm" variant={mode === 'signup' ? 'default' : 'ghost'} onClick={() => setMode('signup')}>
                  Create account
                </Button>
              </div>
              <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
                {mode === 'signup' ? (
                  <div className="space-y-2">
                    <Label htmlFor="portal-name">Full name</Label>
                    <Input id="portal-name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="portal-email">Email</Label>
                  <Input id="portal-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portal-password">Password</Label>
                  <Input id="portal-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {mode === 'signup' ? 'Create customer account' : 'Sign in'}
                </Button>
              </form>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                By creating an account you agree to email verification. You can request deletion from Portal Settings.
              </p>
            </>
          )}
          <div className="mt-5 border-t pt-4 text-center text-xs text-muted-foreground">
            Staff use the <Link href="/admin" className="font-medium text-primary hover:underline">admin login</Link>.
          </div>
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

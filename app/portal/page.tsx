'use client';

import { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { isNativeCapacitorRuntime } from '@/lib/capacitor/runtime';
import { useLoginLockout } from '@/components/auth/use-login-lockout';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.91A6.02 6.02 0 0 1 6.1 12c0-.66.11-1.3.31-1.91V7.5H3.07A10 10 0 0 0 2 12c0 1.61.38 3.14 1.07 4.5l3.34-2.59Z" />
      <path fill="#EA4335" d="M12 5.97c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59C7.2 7.73 9.4 5.97 12 5.97Z" />
    </svg>
  );
}

function portalAuthCallback() {
  return isNativeCapacitorRuntime()
    ? 'ansha://auth/callback?next=/portal/home'
    : `${window.location.origin}/auth/callback?next=/portal/home`;
}

function PortalLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const loginLockout = useLoginLockout('customer', email);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error === 'unauthorized') toast.error('This account does not have active customer portal access.');
    if (error === 'confirmation') toast.error('That confirmation link is invalid or expired.');
    if (error === 'setup') toast.error('We could not finish portal setup. Please sign in again or contact ANSHA.');
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    const safetyTimer = window.setTimeout(() => {
      if (active) setChecking(false);
    }, 5000);

    void (async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) return;

        const { data: profile, error: profileError } = await supabase
          .from('customer_profiles')
          .select('id')
          .eq('id', session.user.id)
          .eq('is_active', true)
          .maybeSingle();
        if (profileError) throw profileError;

        if (profile) {
          // A full navigation ensures the SSR proxy receives the freshly written auth cookies.
          window.location.replace('/portal/home');
        }
      } catch {
        if (active) toast.error('Session check failed. Please sign in again.');
      } finally {
        window.clearTimeout(safetyTimer);
        if (active) setChecking(false);
      }
    })();

    return () => {
      active = false;
      window.clearTimeout(safetyTimer);
    };
  }, []);

  const ensureProfile = async (name?: string) => {
    const { error } = await supabase.rpc('ensure_customer_portal_profile', {
      p_full_name: name?.trim() || null,
    });
    if (error) throw error;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'signin' && loginLockout.refresh().lockedUntil > Date.now()) return;
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

      const callback = portalAuthCallback();
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
          window.location.assign('/portal/home');
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
      const attempt = loginLockout.recordFailure();
      setLoading(false);
      toast.error(attempt.lockedUntil > Date.now()
        ? 'Too many failed attempts. Sign-in is locked for 5 minutes.'
        : `Invalid email or password. ${3 - attempt.attempts} attempts remain before a temporary sign-in lock.`);
      return;
    }

    loginLockout.clearFailures();
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
    // Avoid Next.js prefetch racing ahead of Supabase cookie persistence.
    window.location.assign('/portal/home');
  };

  const handleGoogleSignIn = async () => {
    setOauthLoading(true);
    const callback = portalAuthCallback();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback,
        queryParams: { prompt: 'select_account' },
      },
    });

    if (error) {
      toast.error(error.message || 'Google sign-in could not start.');
      setOauthLoading(false);
    }
  };

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(145deg,hsl(210_30%_94%),hsl(0_35%_96%))] px-4 py-10 dark:bg-[linear-gradient(145deg,hsl(220_18%_7%),hsl(0_18%_10%))]">
      <div aria-hidden className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-red-500/15 blur-3xl" />
      <Button
        type="button"
        variant="ghost"
        onClick={goBack}
        className="absolute left-4 top-4 z-10 h-10 rounded-full border border-border/70 bg-background/75 px-3 shadow-sm backdrop-blur-xl sm:left-6 sm:top-6 sm:px-4"
        aria-label="Back to ANSHA home"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Back to ANSHA</span>
        <span className="sm:hidden">Back</span>
      </Button>
      <Card className="relative w-full max-w-md overflow-hidden rounded-[2rem] border-white/70 bg-card/85 shadow-[0_28px_80px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10">
        <div className="h-1.5 bg-gradient-to-r from-sky-500 via-accent to-amber-400" />
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-20 items-center justify-center">
            <Image
              src="/images/ansha-logo-transparent.webp"
              alt="Ansha Trading Co. LLC-FZ"
              width={240}
              height={119}
              priority
              className="h-20 w-auto max-w-[240px] object-contain"
            />
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
              <Button type="button" variant="outline" className="h-12 w-full rounded-2xl border-border/70 bg-white font-bold text-foreground shadow-sm hover:bg-white/80 dark:bg-white/5" onClick={() => void handleGoogleSignIn()} disabled={oauthLoading || loading}>
                {oauthLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
                Continue with Google
              </Button>
              <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <span className="h-px flex-1 bg-border" /><span>or use email</span><span className="h-px flex-1 bg-border" />
              </div>
              <div className="mb-5 grid grid-cols-2 rounded-xl bg-secondary p-1">
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
                  <div className="relative">
                    <Input id="portal-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required className="pr-11" />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  {mode === 'signin' && loginLockout.secondsRemaining > 0 ? (
                    <p role="alert" className="text-sm text-destructive">
                      Too many failed attempts. Try again in {Math.floor(loginLockout.secondsRemaining / 60)}:{String(loginLockout.secondsRemaining % 60).padStart(2, '0')}.
                    </p>
                  ) : null}
                </div>
                <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading || oauthLoading || (mode === 'signin' && loginLockout.secondsRemaining > 0)}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {mode === 'signup' ? 'Create customer account' : 'Sign in'}
                </Button>
              </form>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                By creating an account you agree to email verification. You can request deletion from Portal Settings.
              </p>
            </>
          )}
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

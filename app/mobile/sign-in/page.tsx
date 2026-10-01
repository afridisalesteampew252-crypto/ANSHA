'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { isNativeCapacitorRuntime } from '@/lib/capacitor/runtime';
import { useLoginLockout } from '@/components/auth/use-login-lockout';

function callbackUrl() {
  return isNativeCapacitorRuntime() ? 'ansha://auth/callback?next=/mobile/account' : `${window.location.origin}/auth/callback?next=/mobile/account`;
}

export default function MobileSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const loginLockout = useLoginLockout('customer', email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (loginLockout.refresh().lockedUntil > Date.now()) return;
    setBusy(true);
    setError('');
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError || !data.user) {
      const attempt = loginLockout.recordFailure();
      setError(attempt.lockedUntil > Date.now()
        ? 'Too many failed attempts. Sign-in is locked for 5 minutes.'
        : `Invalid email or password. ${3 - attempt.attempts} attempts remain before a temporary sign-in lock.`);
      setBusy(false);
      return;
    }
    loginLockout.clearFailures();
    await supabase.rpc('ensure_customer_portal_profile');
    router.replace('/mobile/account');
  };

  const google = async () => {
    setBusy(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl(), queryParams: { prompt: 'select_account' } } });
    if (oauthError) {
      setError(oauthError.message);
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-sm">
      <Link href="/mobile/account" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-black/55"><ArrowLeft className="h-4 w-4" />Back</Link>
      <div className="rounded-[2rem] bg-[#17191d] p-6 text-white shadow-xl shadow-black/10">
        <LogIn className="h-8 w-8 text-red-300" />
        <p className="mt-5 text-[10px] font-black uppercase tracking-[.22em] text-red-300">ANSHA customer portal</p>
        <h1 className="mt-2 text-3xl font-black">Sign in securely</h1>
        <p className="mt-2 text-sm leading-6 text-white/60">Access your stock, reservations, invoices, and support in the mobile app.</p>
      </div>
      <form onSubmit={(event) => void signIn(event)} className="mt-4 space-y-3 rounded-[2rem] bg-white p-5 shadow-sm">
        <button type="button" onClick={() => void google()} disabled={busy} className="flex h-12 w-full items-center justify-center rounded-xl border border-black/10 text-sm font-black">Continue with Google</button>
        <div className="flex items-center gap-3 py-1 text-[10px] font-black uppercase tracking-widest text-black/35"><span className="h-px flex-1 bg-black/10" />or email<span className="h-px flex-1 bg-black/10" /></div>
        <label className="block text-xs font-black uppercase tracking-wide text-black/55">Email<input className="mt-2 h-12 w-full rounded-xl border border-black/10 px-3 text-sm outline-none focus:border-[#d21e1e]" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="block text-xs font-black uppercase tracking-wide text-black/55">Password
          <div className="relative mt-2">
            <input className="h-12 w-full rounded-xl border border-black/10 px-3 pr-12 text-sm outline-none focus:border-[#d21e1e]" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex items-center px-3 text-black/50 hover:text-black" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </label>
        {loginLockout.secondsRemaining > 0 ? <p role="alert" className="text-sm font-semibold text-[#d21e1e]">Too many failed attempts. Try again in {Math.floor(loginLockout.secondsRemaining / 60)}:{String(loginLockout.secondsRemaining % 60).padStart(2, '0')}.</p> : null}
        {error ? <p className="text-sm font-semibold text-[#d21e1e]">{error}</p> : null}
        <button type="submit" disabled={busy || loginLockout.secondsRemaining > 0} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#d21e1e] text-sm font-black text-white">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Sign in</button>
      </form>
    </section>
  );
}

'use client';

import Link from 'next/link';
import { ArrowRight, Loader2, LogIn, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function MobileAccountPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email || null);
      setChecking(false);
    });
  }, []);

  if (checking) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#d21e1e]" /></div>;

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-[#17191d] p-6 text-white shadow-xl shadow-black/10">
        <UserRound className="h-8 w-8 text-red-300" />
        <p className="mt-5 text-[10px] font-black uppercase tracking-[.22em] text-red-300">Customer account</p>
        <h1 className="mt-2 text-3xl font-black">{email ? 'Welcome back' : 'Your ANSHA account'}</h1>
        <p className="mt-2 text-sm leading-6 text-white/60">{email ? email : 'Sign in to view invoices, reservations, payment proofs, and support conversations.'}</p>
      </div>
      {email ? (
        <div className="space-y-3">
          <Link href="/mobile/orders" className="flex items-center justify-between rounded-2xl bg-white p-4 font-black shadow-sm"><span>My reservations and invoices</span><ArrowRight className="h-5 w-5 text-[#d21e1e]" /></Link>
          <Link href="/mobile/support" className="flex items-center justify-between rounded-2xl bg-white p-4 font-black shadow-sm"><span>Contact support</span><ArrowRight className="h-5 w-5 text-[#d21e1e]" /></Link>
          <button type="button" onClick={() => void supabase.auth.signOut().then(() => setEmail(null))} className="w-full rounded-2xl border border-black/10 bg-transparent p-4 text-sm font-black">Sign out</button>
        </div>
      ) : (
        <Link href="/mobile/sign-in" className="flex items-center justify-center gap-2 rounded-2xl bg-[#d21e1e] p-4 font-black text-white shadow-lg shadow-red-900/15"><LogIn className="h-5 w-5" /> Sign in to customer portal</Link>
      )}
    </section>
  );
}

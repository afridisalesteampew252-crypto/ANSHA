'use client';

import Link from 'next/link';
import { ArrowRight, Banknote, BookmarkCheck, Loader2, LogIn, MessageCircle, PackageSearch, ReceiptText, Settings, UserRound, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

const portalActions = [
  { href: '/portal/account', label: 'Statement / SOA', detail: 'Invoices, remittances and balances', icon: WalletCards },
  { href: '/portal/reservations', label: 'Reservations', detail: 'Vehicles and parts held for you', icon: BookmarkCheck },
  { href: '/portal/invoices', label: 'Invoices', detail: 'View documents and download details', icon: ReceiptText },
  { href: '/portal/payments', label: 'Upload TT copy', detail: 'Submit transfer proof securely', icon: Banknote },
  { href: '/portal/profile', label: 'Profile & consignee', detail: 'Update contact and shipping details', icon: UserRound },
  { href: '/portal/support', label: 'Support inbox', detail: 'Message the ANSHA team', icon: MessageCircle },
  { href: '/portal/catalog', label: 'Browse all stock', detail: 'Vehicles, parts and machinery', icon: PackageSearch },
  { href: '/portal/settings', label: 'Security & privacy', detail: 'Change password or request account deletion', icon: Settings },
] as const;

export default function MobileAccountPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setEmail(data.session?.user.email || null);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email || null);
      setChecking(false);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (checking) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#d21e1e]" /></div>;

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] bg-[#17191d] p-6 text-white shadow-xl shadow-black/10">
        <UserRound className="h-8 w-8 text-red-300" />
        <p className="mt-5 text-[10px] font-black uppercase tracking-[.22em] text-red-300">Customer account</p>
        <h1 className="mt-2 text-3xl font-black">{email ? 'Welcome back' : 'Your ANSHA account'}</h1>
        <p className="mt-2 text-sm leading-6 text-white/60">{email ? email : 'Sign in to access your statement, invoices, reservations, payment proofs, profile and support.'}</p>
      </div>
      {email ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {portalActions.map(({ href, label, detail, icon: Icon }) => (
              <Link key={href} href={href} className="group min-h-32 rounded-2xl border border-black/5 bg-white p-4 shadow-sm transition active:scale-[.98] hover:border-[#d21e1e]/25 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-[#d21e1e]"><Icon className="h-5 w-5" /></span>
                  <ArrowRight className="mt-1 h-4 w-4 text-black/25 transition group-hover:translate-x-0.5 group-hover:text-[#d21e1e]" />
                </div>
                <p className="mt-4 text-sm font-black leading-5">{label}</p>
                <p className="mt-1 text-xs leading-5 text-black/45">{detail}</p>
              </Link>
            ))}
          </div>
          <button type="button" onClick={() => void supabase.auth.signOut()} className="w-full rounded-2xl border border-black/10 bg-transparent p-4 text-sm font-black">Sign out</button>
        </>
      ) : (
        <Link href="/mobile/sign-in" className="flex items-center justify-center gap-2 rounded-2xl bg-[#d21e1e] p-4 font-black text-white shadow-lg shadow-red-900/15"><LogIn className="h-5 w-5" /> Sign in to customer portal</Link>
      )}
    </section>
  );
}

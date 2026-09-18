'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [name, setName] = useState('Customer');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('customer_profiles')
        .select('full_name, email')
        .eq('id', session.user.id)
        .maybeSingle();
      if (data?.full_name || data?.email) setName(data.full_name || data.email || 'Customer');
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/portal');
  };

  return (
    <div className="min-h-screen bg-secondary/25">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/portal/invoices" className="flex items-center gap-2 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-white">
              <ReceiptText className="h-4 w-4" />
            </span>
            ANSHA Portal
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

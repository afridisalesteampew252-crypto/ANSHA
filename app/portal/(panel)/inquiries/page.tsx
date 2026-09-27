'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';

type Inquiry = {
  id: string; message: string; status: string; created_at: string;
  parts: { name: string; part_code: string; slug: string } | null;
  vehicles: { title: string; stock_number: string | null; slug: string } | null;
};

export default function PortalInquiriesPage() {
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase.from('inquiries')
      .select('id,message,status,created_at,parts(name,part_code,slug),vehicles(title,stock_number,slug)')
      .order('created_at', { ascending: false });
    setError(queryError?.message || '');
    setRows((data || []) as unknown as Inquiry[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="space-y-5">
    <header><h1 className="text-2xl font-bold">Your stock inquiries</h1>
      <p className="text-sm text-muted-foreground">Track inquiries you sent while signed in to this account.</p></header>
    {loading ? <p role="status" className="flex items-center gap-2 py-10"><Loader2 className="h-5 w-5 animate-spin" /> Loading inquiries…</p>
      : error ? <Card><CardContent className="space-y-3 p-5"><p role="alert">{error}</p><Button variant="outline" onClick={() => void load()}>Try again</Button></CardContent></Card>
      : rows.length === 0 ? <Card><CardContent className="space-y-3 py-12 text-center">
          <Send className="mx-auto h-8 w-8 text-muted-foreground" /><p className="font-semibold">No inquiries yet</p>
          <p className="text-sm text-muted-foreground">Open a part or vehicle and select Send Inquiry.</p>
          <Button asChild variant="accent"><Link href="/portal/catalog">Browse stock</Link></Button>
        </CardContent></Card>
      : <ul className="space-y-3">{rows.map((row) => {
        const href = row.parts?.slug ? `/parts/${row.parts.slug}` : row.vehicles?.slug ? `/vehicles/${row.vehicles.slug}` : null;
        const title = row.parts ? `${row.parts.name} · ${row.parts.part_code}` : row.vehicles ? `${row.vehicles.title}${row.vehicles.stock_number ? ` · #${row.vehicles.stock_number}` : ''}` : 'General inquiry';
        return <li key={row.id}><Card><CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{title}</p><span className="text-sm capitalize text-muted-foreground">{row.status.replaceAll('_', ' ')}</span></div>
          <p className="whitespace-pre-wrap text-sm">{row.message}</p>
          <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground"><span>{format(new Date(row.created_at), 'dd MMM yyyy')}</span>
            {href && <Link className="font-semibold text-primary hover:underline" href={href}>View stock item</Link>}</div>
        </CardContent></Card></li>;
      })}</ul>}
    <p className="text-sm text-muted-foreground">Need to add details? <Link href="/portal/support" className="font-semibold text-primary hover:underline">Message support</Link>.</p>
  </div>;
}

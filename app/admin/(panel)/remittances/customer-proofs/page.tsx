'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, FileSearch, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase/client';

type Proof = {
  id: string; customer_id: string; amount: number; currency: string; transfer_date: string;
  bank_reference: string | null; sender_bank: string | null; notes: string | null;
  storage_path: string; file_name: string; status: 'submitted' | 'matched' | 'rejected';
  review_note: string | null; created_at: string;
  customers: { full_name: string; company_name: string | null; customer_code: string } | { full_name: string; company_name: string | null; customer_code: string }[] | null;
};

type UnknownRemittance = { id: string; remittance_number: string; amount: number; currency: string; received_date: string; bank_reference: string | null; sender_bank: string | null };

const customer = (proof: Proof) => Array.isArray(proof.customers) ? proof.customers[0] : proof.customers;
const money = (amount: number, currency: string) => new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(Number(amount));

export default function CustomerPaymentProofsPage() {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [remittances, setRemittances] = useState<UnknownRemittance[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: proofRows, error: proofError }, { data: remittanceRows, error: remittanceError }] = await Promise.all([
      supabase.from('customer_payment_proofs').select('id, customer_id, amount, currency, transfer_date, bank_reference, sender_bank, notes, storage_path, file_name, status, review_note, created_at, customers(full_name, company_name, customer_code)').order('created_at', { ascending: false }),
      supabase.from('remittances').select('id, remittance_number, amount, currency, received_date, bank_reference, sender_bank').or('is_unknown.eq.true,status.eq.unknown').order('received_date', { ascending: false }),
    ]);
    if (proofError) toast.error(proofError.message);
    if (remittanceError) toast.error(remittanceError.message);
    setProofs((proofRows || []) as Proof[]);
    setRemittances((remittanceRows || []) as UnknownRemittance[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submitted = useMemo(() => proofs.filter((proof) => proof.status === 'submitted'), [proofs]);

  const candidates = (proof: Proof) => remittances.filter((item) => Number(item.amount) === Number(proof.amount) && item.currency.toUpperCase() === proof.currency.toUpperCase());

  const view = async (proof: Proof) => {
    const { data, error } = await supabase.storage.from('customer-payment-proofs').createSignedUrl(proof.storage_path, 60);
    if (error || !data?.signedUrl) toast.error(error?.message || 'Could not open the proof.');
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const match = async (proof: Proof) => {
    const remittanceId = selection[proof.id];
    if (!remittanceId) return toast.error('Choose the matching Unknown TTS first.');
    setBusy(proof.id);
    const { error } = await supabase.rpc('match_customer_payment_proof', { p_proof_id: proof.id, p_remittance_id: remittanceId, p_review_note: notes[proof.id] || null });
    if (error) toast.error(error.message);
    else { toast.success('Payment matched and confirmed.'); await load(); }
    setBusy(null);
  };

  const reject = async (proof: Proof) => {
    const reason = notes[proof.id]?.trim();
    if (!reason) return toast.error('Add a reason before rejecting.');
    if (!window.confirm('Reject this customer payment proof?')) return;
    setBusy(proof.id);
    const { error } = await supabase.rpc('reject_customer_payment_proof', { p_proof_id: proof.id, p_review_note: reason });
    if (error) toast.error(error.message);
    else { toast.success('Payment proof rejected.'); await load(); }
    setBusy(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Customer TT copies</h1><p className="text-sm text-muted-foreground">Compare private bank-transfer proofs with Unknown TTS records, then confirm an exact match.</p></div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Waiting review</p><p className="mt-1 text-3xl font-black text-amber-600">{submitted.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Unknown TTS</p><p className="mt-1 text-3xl font-black text-sky-600">{remittances.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Matched proofs</p><p className="mt-1 text-3xl font-black text-emerald-600">{proofs.filter((p) => p.status === 'matched').length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileSearch className="h-5 w-5 text-accent" />Review queue</CardTitle><CardDescription>The selector only shows Unknown TTS entries with exactly the same amount and currency. Reference and bank details still require human review.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-accent" /></div> : submitted.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No customer payment proofs are waiting.</p> : submitted.map((proof) => {
            const client = customer(proof);
            const matches = candidates(proof);
            return <div key={proof.id} className="rounded-2xl border bg-gradient-to-br from-background to-secondary/30 p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{client?.company_name || client?.full_name || 'Customer'}</p><Badge variant="outline">#{client?.customer_code || '—'}</Badge><Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/10">Submitted</Badge></div><p className="mt-1 text-sm text-muted-foreground">Transfer {proof.transfer_date} · {proof.sender_bank || 'Bank not supplied'} · Ref {proof.bank_reference || 'not supplied'}</p></div>
                <div className="text-right"><p className="text-lg font-black">{money(proof.amount, proof.currency)}</p><Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => void view(proof)}>{proof.file_name}<ExternalLink className="h-3.5 w-3.5" /></Button></div>
              </div>
              {proof.notes ? <p className="mt-3 rounded-lg bg-secondary/70 px-3 py-2 text-sm">Customer note: {proof.notes}</p> : null}
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)_auto]">
                <label className="space-y-1 text-xs font-semibold text-muted-foreground">Matching Unknown TTS
                  <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={selection[proof.id] || ''} onChange={(e) => setSelection((current) => ({ ...current, [proof.id]: e.target.value }))}>
                    <option value="">{matches.length ? 'Select exact amount/currency match' : 'No exact match found'}</option>
                    {matches.map((item) => <option key={item.id} value={item.id}>{item.remittance_number} · {item.received_date} · {item.bank_reference || item.sender_bank || 'No reference'}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted-foreground">Review note
                  <Input className="mt-1" value={notes[proof.id] || ''} onChange={(e) => setNotes((current) => ({ ...current, [proof.id]: e.target.value }))} placeholder="Required only to reject" />
                </label>
                <div className="flex items-end gap-2"><Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy === proof.id || !selection[proof.id]} onClick={() => void match(proof)}><CheckCircle2 className="h-4 w-4" />Match & confirm</Button><Button type="button" variant="outline" className="text-destructive" disabled={busy === proof.id} onClick={() => void reject(proof)}><XCircle className="h-4 w-4" />Reject</Button></div>
              </div>
            </div>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, Clock3, ExternalLink, FileUp, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';

type PaymentProof = {
  id: string;
  amount: number;
  currency: string;
  transfer_date: string;
  bank_reference: string | null;
  sender_bank: string | null;
  storage_path: string;
  file_name: string;
  status: 'submitted' | 'matched' | 'rejected';
  review_note: string | null;
  created_at: string;
};

const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024;

export default function PortalPaymentsPage() {
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankReference, setBankReference] = useState('');
  const [senderBank, setSenderBank] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setLoading(false);
      return;
    }
    const [{ data: profile, error: profileError }, { data, error }] = await Promise.all([
      supabase.from('customer_profiles').select('customer_id').eq('id', auth.user.id).single(),
      supabase.from('customer_payment_proofs').select('id, amount, currency, transfer_date, bank_reference, sender_bank, storage_path, file_name, status, review_note, created_at').order('created_at', { ascending: false }),
    ]);
    if (profileError) toast.error(profileError.message);
    if (error) toast.error(error.message);
    setCustomerId(profile?.customer_id || null);
    setProofs((data || []) as PaymentProof[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] || null;
    if (next && (!ACCEPTED.includes(next.type) || next.size > MAX_SIZE)) {
      toast.error('Use a PDF, JPG, PNG or WebP file up to 10 MB.');
      event.target.value = '';
      setFile(null);
      return;
    }
    setFile(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId || !file || Number(amount) <= 0) return;
    setSubmitting(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      toast.error('Please sign in again.');
      setSubmitting(false);
      return;
    }
    const proofId = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120);
    const storagePath = `${customerId}/${auth.user.id}/${proofId}/${safeName}`;
    const { error: uploadError } = await supabase.storage.from('customer-payment-proofs').upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      toast.error(uploadError.message);
      setSubmitting(false);
      return;
    }
    const { error } = await supabase.from('customer_payment_proofs').insert({
      id: proofId, customer_id: customerId, uploaded_by: auth.user.id,
      amount: Number(amount), currency: currency.trim().toUpperCase(), transfer_date: transferDate,
      bank_reference: bankReference.trim() || null, sender_bank: senderBank.trim() || null,
      notes: notes.trim() || null, storage_path: storagePath, file_name: file.name,
      mime_type: file.type, size_bytes: file.size,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('TT copy submitted for matching.');
      setAmount(''); setBankReference(''); setSenderBank(''); setNotes(''); setFile(null);
      const input = document.getElementById('tt-copy') as HTMLInputElement | null;
      if (input) input.value = '';
      await load();
    }
    setSubmitting(false);
  };

  const viewFile = async (proof: PaymentProof) => {
    const { data, error } = await supabase.storage.from('customer-payment-proofs').createSignedUrl(proof.storage_path, 60);
    if (error || !data?.signedUrl) toast.error(error?.message || 'Could not open the file.');
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const statusIcon = (status: PaymentProof['status']) => status === 'matched' ? CheckCircle2 : status === 'rejected' ? XCircle : Clock3;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Payment matching</p>
        <h1 className="text-2xl font-bold tracking-tight">Upload your TT copy</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Send the bank transfer copy once. Our receivables team will compare its amount, currency and reference with the incoming payment before confirming it on your account.</p>
      </div>

      <Card className="overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-background to-sky-500/[0.05]">
        <CardHeader><CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5 text-emerald-600" />New payment proof</CardTitle><CardDescription>PDF or image, maximum 10 MB. Files are private and visible only to you and authorized finance staff.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="tt-amount">Amount</Label><Input id="tt-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="tt-currency">Currency</Label><Input id="tt-currency" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} required /></div>
            <div className="space-y-2"><Label htmlFor="tt-date">Transfer date</Label><Input id="tt-date" type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="tt-bank">Sender bank</Label><Input id="tt-bank" value={senderBank} onChange={(e) => setSenderBank(e.target.value)} placeholder="Bank name" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="tt-reference">Bank reference / transaction number</Label><Input id="tt-reference" value={bankReference} onChange={(e) => setBankReference(e.target.value)} placeholder="Reference shown on the TT copy" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="tt-notes">Notes (optional)</Label><Input id="tt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Invoice or order reference" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="tt-copy">TT copy</Label><Input id="tt-copy" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={chooseFile} required /></div>
            <div className="sm:col-span-2"><Button type="submit" disabled={submitting || !customerId || !file} className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}Submit for matching</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your submissions</CardTitle><CardDescription>Matched payments will appear automatically in your statement.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div> : proofs.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No TT copies submitted yet.</p> : proofs.map((proof) => {
            const Icon = statusIcon(proof.status);
            return <div key={proof.id} className="rounded-2xl border bg-background/75 p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-bold">{new Intl.NumberFormat('en-AE', { style: 'currency', currency: proof.currency }).format(proof.amount)}</p><p className="text-xs text-muted-foreground">{proof.transfer_date} · {proof.bank_reference || 'No bank reference'} · {proof.file_name}</p></div>
                <Badge variant="outline" className={`capitalize ${proof.status === 'matched' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : proof.status === 'rejected' ? 'border-red-500/30 bg-red-500/10 text-red-700' : 'border-amber-500/30 bg-amber-500/10 text-amber-700'}`}><Icon className="mr-1 h-3.5 w-3.5" />{proof.status}</Badge>
              </div>
              {proof.review_note ? <p className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-xs">Team note: {proof.review_note}</p> : null}
              <Button type="button" variant="ghost" size="sm" className="mt-2 px-0" onClick={() => void viewFile(proof)}>View secure file <ExternalLink className="h-3.5 w-3.5" /></Button>
            </div>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}

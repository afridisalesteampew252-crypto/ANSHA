'use client';

import { FormEvent, useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { HoneypotField } from '@/components/public/honeypot-field';
import { FORM_LIMITS, publicFormErrorMessage, screenSubmission, useFormStartTime } from '@/lib/public-form-guard';
import { submitSalesInquiry, validateInquiryContact } from '@/lib/inquiry-referral';

type Props = { itemId: string; itemType: 'vehicle' | 'part'; itemName: string };

export function MobileInquiryForm({ itemId, itemType, itemName }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(`I'm interested in: ${itemName}`);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [inquiryNumber, setInquiryNumber] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const startedAtRef = useFormStartTime();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!name.trim() || !message.trim()) {
      setError('Please enter your name and message.');
      return;
    }
    const contactError = validateInquiryContact(email, phone);
    if (contactError) {
      setError(contactError);
      return;
    }
    if (screenSubmission({ honeypot, startedAt: startedAtRef.current, text: message }) === 'bot') {
      setSent(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const receipt = await submitSalesInquiry(supabase, {
        name, email, phone, message, partId: itemType === 'part' ? itemId : null,
        vehicleId: itemType === 'vehicle' ? itemId : null, source: 'mobile',
      });
      setInquiryNumber(receipt.inquiry_number);
    } catch (error) {
      setError(publicFormErrorMessage(error as { message?: string; hint?: string | null }, 'We could not send this request. Please try again.'));
      return;
    } finally {
      setBusy(false);
    }
    setSent(true);
  };

  if (sent) return <div role="status" className="rounded-2xl bg-green-50 p-5 text-center text-green-900"><CheckCircle2 className="mx-auto h-8 w-8 text-green-600" /><h3 className="mt-3 font-black">Request received</h3>{inquiryNumber ? <p className="mt-2 font-semibold">Reference: {inquiryNumber}</p> : null}<p className="mt-1 text-sm text-green-800/70">The ANSHA team will contact you shortly.</p></div>;

  return (
    <form onSubmit={(event) => void submit(event)} className="relative space-y-3 rounded-3xl bg-white p-5 shadow-sm">
      <HoneypotField value={honeypot} onChange={setHoneypot} />
      <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#d21e1e]">Ready to buy?</p><h2 className="mt-1 text-xl font-black">Request details</h2><p className="mt-1 text-sm text-black/45">Send an inquiry directly to the ANSHA admin team.</p></div>
      <input required aria-label="Your name" autoComplete="name" maxLength={FORM_LIMITS.name} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" className="h-12 w-full rounded-xl border border-black/10 px-3 text-sm outline-none focus:border-[#d21e1e]" />
      <div className="grid grid-cols-2 gap-2"><input type="email" aria-label="Email" autoComplete="email" maxLength={FORM_LIMITS.email} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="h-12 w-full rounded-xl border border-black/10 px-3 text-sm outline-none focus:border-[#d21e1e]" /><input type="tel" aria-label="Phone" autoComplete="tel" maxLength={FORM_LIMITS.phone} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" className="h-12 w-full rounded-xl border border-black/10 px-3 text-sm outline-none focus:border-[#d21e1e]" /></div>
      <p className="text-xs text-black/55">Provide a phone number or email address so we can reply.</p>
      <textarea required aria-label="Message" maxLength={FORM_LIMITS.message} value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className="w-full resize-none rounded-xl border border-black/10 p-3 text-sm outline-none focus:border-[#d21e1e]" />
      {error ? <p role="alert" className="text-sm font-semibold text-[#d21e1e]">{error}</p> : null}
      <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#d21e1e] text-sm font-black text-white">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send request</button>
    </form>
  );
}

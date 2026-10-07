'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, MessageCircle, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { HoneypotField } from '@/components/public/honeypot-field';
import { FORM_LIMITS, publicFormErrorMessage, screenSubmission, useFormStartTime } from '@/lib/public-form-guard';
import { submitSalesInquiry, validateInquiryContact } from '@/lib/inquiry-referral';

const SUPPORT_MESSAGE_PREFIX = '[Mobile support] ';

export default function MobileSupportPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [inquiryNumber, setInquiryNumber] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const startedAtRef = useFormStartTime();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!name.trim() || !message.trim()) { setError('Please enter your name and message.'); return; }
    const contactError = validateInquiryContact(email, phone);
    if (contactError) { setError(contactError); return; }
    if (screenSubmission({ honeypot, startedAt: startedAtRef.current, text: message }) === 'bot') { setSent(true); return; }
    setBusy(true); setError('');
    try {
      const receipt = await submitSalesInquiry(supabase, { name, email, phone, message: `${SUPPORT_MESSAGE_PREFIX}${message.trim()}`, source: 'mobile' });
      setInquiryNumber(receipt.inquiry_number);
      setSent(true);
    } catch (error) {
      setError(publicFormErrorMessage(error as { message?: string; hint?: string | null }, 'Could not send your request. Please try again.'));
    } finally { setBusy(false); }
  };
  const fieldClass = 'h-12 w-full rounded-xl border border-black/10 px-3 text-sm outline-none focus:border-[#d21e1e]';
  return (
    <section className="space-y-4">
      <Link href="/mobile" className="inline-flex items-center gap-1 text-sm font-black text-black/55"><ArrowLeft className="h-4 w-4" />Back home</Link>
      <div className="rounded-[2rem] bg-[#17191d] p-6 text-white">
        <MessageCircle className="h-8 w-8 text-red-300" /><p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-red-300">ANSHA support</p>
        <h1 className="mt-2 text-3xl font-black">How can we help?</h1><p className="mt-2 text-sm leading-6 text-white/60">Ask about stock, shipping, payments, reservations, or your account.</p>
      </div>
      {sent ? (
        <div role="status" className="rounded-2xl bg-green-50 p-8 text-center text-green-900">
          <CheckCircle2 className="mx-auto h-9 w-9 text-green-600" /><h2 className="mt-3 font-black">Message sent</h2>
          {inquiryNumber ? <p className="mt-2 font-semibold">Reference: {inquiryNumber}</p> : null}
          <p className="mt-1 text-sm text-green-800/70">Our team will follow up shortly.</p>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="relative space-y-3 rounded-3xl bg-white p-5 shadow-sm">
          <HoneypotField value={honeypot} onChange={setHoneypot} />
          <input required aria-label="Your name" autoComplete="name" maxLength={FORM_LIMITS.name} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" className={fieldClass} />
          <div className="grid grid-cols-2 gap-2">
            <input type="email" aria-label="Email" autoComplete="email" maxLength={FORM_LIMITS.email} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className={fieldClass} />
            <input type="tel" aria-label="Phone" autoComplete="tel" maxLength={FORM_LIMITS.phone} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" className={fieldClass} />
          </div>
          <p className="text-xs text-black/55">Provide a phone number or email address so we can reply.</p>
          <textarea required aria-label="Message" maxLength={FORM_LIMITS.message - SUPPORT_MESSAGE_PREFIX.length} value={message} onChange={(event) => setMessage(event.target.value)} rows={6} placeholder="Tell us what you need" className="w-full resize-none rounded-xl border border-black/10 p-3 text-sm outline-none focus:border-[#d21e1e]" />
          {error ? <p role="alert" className="text-sm font-semibold text-[#d21e1e]">{error}</p> : null}
          <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#d21e1e] text-sm font-black text-white">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to ANSHA</button>
        </form>
      )}
    </section>
  );
}

'use client';

import { FormEvent, useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

type Props = { itemId: string; itemType: 'vehicle' | 'part'; itemName: string };

export function MobileInquiryForm({ itemId, itemType, itemName }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(`I'm interested in: ${itemName}`);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !message.trim()) {
      setError('Please enter your name and message.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: insertError } = await supabase.from('inquiries').insert({
      part_id: itemType === 'part' ? itemId : null,
      customer_name: name.trim(),
      customer_email: email.trim() || null,
      customer_phone: phone.trim() || null,
      message: itemType === 'vehicle' ? `[Vehicle ${itemId}] ${message.trim()}` : message.trim(),
    });
    setBusy(false);
    if (insertError) {
      setError('We could not send this request. Please try again.');
      return;
    }
    setSent(true);
  };

  if (sent) return <div className="rounded-2xl bg-green-50 p-5 text-center text-green-900"><CheckCircle2 className="mx-auto h-8 w-8 text-green-600" /><h3 className="mt-3 font-black">Request received</h3><p className="mt-1 text-sm text-green-800/70">The ANSHA team will contact you shortly.</p></div>;

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
      <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#d21e1e]">Ready to buy?</p><h2 className="mt-1 text-xl font-black">Request details</h2><p className="mt-1 text-sm text-black/45">Send an inquiry directly to the ANSHA admin team.</p></div>
      <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" className="h-12 w-full rounded-xl border border-black/10 px-3 text-sm outline-none focus:border-[#d21e1e]" />
      <div className="grid grid-cols-2 gap-2"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="h-12 w-full rounded-xl border border-black/10 px-3 text-sm outline-none focus:border-[#d21e1e]" /><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" className="h-12 w-full rounded-xl border border-black/10 px-3 text-sm outline-none focus:border-[#d21e1e]" /></div>
      <textarea required value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className="w-full resize-none rounded-xl border border-black/10 p-3 text-sm outline-none focus:border-[#d21e1e]" />
      {error ? <p className="text-sm font-semibold text-[#d21e1e]">{error}</p> : null}
      <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#d21e1e] text-sm font-black text-white">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send request</button>
    </form>
  );
}

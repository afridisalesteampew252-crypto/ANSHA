'use client';

import { useState } from 'react';
import { Phone, Mail, MapPin, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import { supabase } from '@/lib/supabase/client';
import { siteConfig } from '@/lib/site-config';
import { toast } from 'sonner';
import { HoneypotField } from '@/components/public/honeypot-field';
import { FORM_LIMITS, publicFormErrorMessage, screenSubmission, useFormStartTime } from '@/lib/public-form-guard';
import { submitSalesInquiry, validateInquiryContact } from '@/lib/inquiry-referral';

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [inquiryNumber, setInquiryNumber] = useState<string | null>(null);
  const startedAtRef = useFormStartTime();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!name.trim() || !message.trim()) {
      toast.error('Please fill in your name and message.');
      return;
    }
    const contactError = validateInquiryContact(email, phone);
    if (contactError) {
      toast.error(contactError);
      return;
    }
    if (screenSubmission({ honeypot, startedAt: startedAtRef.current, text: message }) === 'bot') {
      // Pretend success so automated submitters get no signal.
      toast.success('Your message has been sent. We will contact you soon.');
      return;
    }
    setLoading(true);
    let reference: string;
    try {
      const receipt = await submitSalesInquiry(supabase, { name, email, phone, message, source: 'website' });
      reference = receipt.inquiry_number;
      setInquiryNumber(reference);
    } catch (error) {
      toast.error(publicFormErrorMessage(error as { message?: string; hint?: string | null }, 'Failed to send message. Please try again.'));
      return;
    } finally {
      setLoading(false);
    }
    toast.success(`Inquiry ${reference} received. We will contact you soon.`);
    setName('');
    setEmail('');
    setPhone('');
    setMessage('');
    startedAtRef.current = Date.now();
  };

  return (
    <div>
      <section className="page-band">
        <div className="container-page py-10 sm:py-14">
          <p className="eyebrow text-accent mb-1">Get in Touch</p>
          <h1 className="font-display text-2xl font-black tracking-tight md:text-4xl">Contact Us</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
            Have a question about a part or need help finding something? Send us a message or reach out on WhatsApp.
          </p>
        </div>
      </section>

      <div className="surface-warm border-t border-accent/10">
        <div className="container-page py-10 sm:py-12">
          <div className="mx-auto max-w-4xl">
            <div className="grid gap-6 md:grid-cols-2 md:gap-8">
              <div className="space-y-5">
                <Card className="border-accent/15 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Get in Touch</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                        <Phone className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Phone</p>
                        <a href={siteConfig.telHref} className="text-sm text-muted-foreground hover:text-accent">{siteConfig.phone}</a>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                        <Mail className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Sales</p>
                        <a href={`mailto:${siteConfig.salesEmail}`} className="text-sm text-muted-foreground hover:text-accent">{siteConfig.salesEmail}</a>
                        <p className="mt-2 text-sm font-medium">Customer Care</p>
                        <a href={`mailto:${siteConfig.careEmail}`} className="text-sm text-muted-foreground hover:text-accent">{siteConfig.careEmail}</a>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                        <MapPin className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Address</p>
                        <p className="text-sm text-muted-foreground">{siteConfig.address}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-accent/15 bg-[#101114] text-white shadow-sm">
                  <CardContent className="p-6">
                    <h3 className="mb-2 font-semibold">Prefer WhatsApp?</h3>
                    <p className="mb-4 text-sm text-white/60">
                      Chat with us directly for quick responses about part availability and pricing.
                    </p>
                    <WhatsAppButton size="lg" />
                  </CardContent>
                </Card>
              </div>

              <Card className="border-accent/15 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Send a Message</CardTitle>
                </CardHeader>
                <CardContent>
                  {inquiryNumber ? <p role="status" className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-3 text-sm">Your inquiry was received. Reference: <strong>{inquiryNumber}</strong></p> : null}
                  <form onSubmit={handleSubmit} className="relative space-y-4">
                    <HoneypotField value={honeypot} onChange={setHoneypot} />
                    <div className="space-y-2">
                      <Label htmlFor="contact-name">Name *</Label>
                      <Input
                        id="contact-name"
                        autoComplete="name"
                        value={name}
                        maxLength={FORM_LIMITS.name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="Your full name"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="contact-email">Email</Label>
                        <Input
                          id="contact-email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          maxLength={FORM_LIMITS.email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact-phone">Phone</Label>
                        <Input
                          id="contact-phone"
                          type="tel"
                          autoComplete="tel"
                          value={phone}
                          maxLength={FORM_LIMITS.phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+00 000 000 0000"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Provide a phone number or email address so we can reply.</p>
                    <div className="space-y-2">
                      <Label htmlFor="contact-message">Message *</Label>
                      <Textarea
                        id="contact-message"
                        value={message}
                        maxLength={FORM_LIMITS.message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                        rows={5}
                        placeholder="Describe what you're looking for..."
                      />
                    </div>
                    <Button type="submit" variant="accent" disabled={loading} className="w-full" size="lg">
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Send Message
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

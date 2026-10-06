'use client';

import { useEffect, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { HoneypotField } from '@/components/public/honeypot-field';
import { FORM_LIMITS, isValidOptionalEmail, publicFormErrorMessage, screenSubmission, useFormStartTime } from '@/lib/public-form-guard';

interface InquiryDialogProps {
  partId?: string;
  vehicleId?: string;
  partName?: string;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'accent';
  triggerSize?: 'default' | 'sm' | 'lg';
}

export function InquiryDialog({
  partId,
  vehicleId,
  partName,
  triggerLabel = 'Send Inquiry',
  triggerVariant = 'default',
  triggerSize = 'default',
}: InquiryDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [usingPortalProfile, setUsingPortalProfile] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const startedAtRef = useFormStartTime();
  const [message, setMessage] = useState(
    partName ? `I'm interested in: ${partName}` : ''
  );

  useEffect(() => {
    if (!open || usingPortalProfile) return;
    void (async () => {
      setProfileLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setProfileLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('id,customer_id,full_name,email')
        .eq('id', session.user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (!profile) {
        setProfileLoading(false);
        return;
      }

      let savedPhone = '';
      if (profile.customer_id) {
        const { data: customer } = await supabase
          .from('customers')
          .select('phone')
          .eq('id', profile.customer_id)
          .maybeSingle();
        savedPhone = customer?.phone || '';
      }

      setProfileId(profile.id);
      setName(profile.full_name || session.user.user_metadata?.full_name || 'Customer');
      setEmail(profile.email || session.user.email || '');
      setPhone(savedPhone);
      setUsingPortalProfile(true);
      setProfileLoading(false);
    })();
  }, [open, usingPortalProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) {
      toast.error('Please fill in your name and message.');
      return;
    }
    if (!isValidOptionalEmail(email)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    if (!profileId && screenSubmission({ honeypot, startedAt: startedAtRef.current, text: message }) === 'bot') {
      // Pretend success so automated submitters get no signal.
      toast.success('Your inquiry has been sent. We will contact you soon.');
      setOpen(false);
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('inquiries').insert({
      part_id: partId || null,
      vehicle_id: vehicleId || null,
      customer_profile_id: profileId,
      customer_name: name.trim(),
      customer_email: email.trim() || null,
      customer_phone: phone.trim() || null,
      message: message.trim(),
    });

    setLoading(false);

    if (error) {
      toast.error(publicFormErrorMessage(error, 'Failed to send inquiry. Please try again.'));
      return;
    }

    toast.success('Your inquiry has been sent. We will contact you soon.');
    setOpen(false);
    if (!usingPortalProfile) {
      setName('');
      setEmail('');
      setPhone('');
    }
    setMessage(partName ? `I'm interested in: ${partName}` : '');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          <Send className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send an Inquiry</DialogTitle>
          <DialogDescription>
            {partName
              ? `Ask about "${partName}". We'll get back to you shortly.`
              : 'Send us a message about any part you need. We\'ll get back to you shortly.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="relative space-y-4">
          <HoneypotField value={honeypot} onChange={setHoneypot} />
          {profileLoading ? (
            <div className="rounded-xl border border-dashed bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
              Loading your account details…
            </div>
          ) : usingPortalProfile ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Using your portal account
              </p>
              <p className="mt-1 text-sm font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">
                {[email, phone].filter(Boolean).join(' · ') || 'Signed-in customer'}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="inquiry-name">Name *</Label>
                <Input
                  id="inquiry-name"
                  value={name}
                  maxLength={FORM_LIMITS.name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Your full name"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="inquiry-email">Email</Label>
                  <Input
                    id="inquiry-email"
                    type="email"
                    value={email}
                    maxLength={FORM_LIMITS.email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inquiry-phone">Phone</Label>
                  <Input
                    id="inquiry-phone"
                    value={phone}
                    maxLength={FORM_LIMITS.phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+00 000 000 0000"
                  />
                </div>
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="inquiry-message">Message *</Label>
            <Textarea
              id="inquiry-message"
              value={message}
              maxLength={FORM_LIMITS.message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={4}
              placeholder="Describe what you're looking for..."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Inquiry
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { Send, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { HoneypotField } from '@/components/public/honeypot-field';
import { FORM_LIMITS, isValidOptionalEmail, publicFormErrorMessage, screenSubmission, useFormStartTime } from '@/lib/public-form-guard';

const STEPS = [
  { id: 'contact', label: 'Contact' },
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'part', label: 'Part' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

export function PartRequestForm() {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<StepId>('contact');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [partName, setPartName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const startedAtRef = useFormStartTime();

  const stepIndex = STEPS.findIndex((item) => item.id === step);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setMake('');
    setModel('');
    setYear('');
    setPartName('');
    setPartNumber('');
    setMessage('');
    setStep('contact');
    startedAtRef.current = Date.now();
  };

  const goNext = () => {
    if (step === 'contact') {
      if (!name.trim()) {
        toast.error('Please enter your name.');
        return;
      }
      if (!isValidOptionalEmail(email)) {
        toast.error('Please enter a valid email address.');
        return;
      }
      setStep('vehicle');
      return;
    }
    if (step === 'vehicle') {
      setStep('part');
    }
  };

  const goBack = () => {
    if (step === 'part') setStep('vehicle');
    else if (step === 'vehicle') setStep('contact');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter your name.');
      setStep('contact');
      return;
    }
    if (!make.trim() && !partName.trim() && !message.trim()) {
      toast.error('Please tell us what part you need.');
      setStep('part');
      return;
    }
    if (!isValidOptionalEmail(email)) {
      toast.error('Please enter a valid email address.');
      setStep('contact');
      return;
    }
    if (screenSubmission({ honeypot, startedAt: startedAtRef.current, text: `${partName} ${message}` }) === 'bot') {
      // Pretend success so automated submitters get no signal.
      toast.success('Your request has been submitted. We will contact you soon.');
      resetForm();
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('part_requests').insert({
      customer_name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      vehicle_make: make.trim() || null,
      vehicle_model: model.trim() || null,
      vehicle_year: year.trim() || null,
      part_name: partName.trim() || null,
      part_number: partNumber.trim() || null,
      message: message.trim() || null,
    });
    setLoading(false);
    if (error) {
      toast.error(publicFormErrorMessage(error, 'Failed to submit request. Please try again.'));
      return;
    }
    toast.success('Your request has been submitted. We will contact you soon.');
    resetForm();
  };

  return (
    <form onSubmit={handleSubmit} className="relative space-y-5">
      <HoneypotField value={honeypot} onChange={setHoneypot} />
      <ol className="flex items-center gap-2" aria-label="Request steps">
        {STEPS.map((item, index) => {
          const active = item.id === step;
          const done = index < stepIndex;
          return (
            <li key={item.id} className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (index <= stepIndex) setStep(item.id);
                }}
                className={cn(
                  'flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-bold transition sm:text-sm',
                  active
                    ? 'border-accent bg-accent text-accent-foreground'
                    : done
                      ? 'border-accent/40 bg-accent/10 text-foreground'
                      : 'border-border bg-secondary/50 text-muted-foreground'
                )}
                aria-current={active ? 'step' : undefined}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-background/20 text-[10px]">
                  {index + 1}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 'contact' ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pr-name">Your Name *</Label>
              <Input
                id="pr-name"
                value={name}
                maxLength={FORM_LIMITS.name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Full name"
                className="h-11"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-phone">Phone / WhatsApp</Label>
              <Input
                id="pr-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                maxLength={FORM_LIMITS.phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+00 000 000 0000"
                className="h-11"
                autoComplete="tel"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-email">Email</Label>
            <Input
              id="pr-email"
              type="email"
              inputMode="email"
              value={email}
              maxLength={FORM_LIMITS.email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11"
              autoComplete="email"
            />
          </div>
        </div>
      ) : null}

      {step === 'vehicle' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="pr-make">Vehicle Make</Label>
            <Input
              id="pr-make"
              value={make}
              maxLength={FORM_LIMITS.make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="Toyota"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-model">Model</Label>
            <Input
              id="pr-model"
              value={model}
              maxLength={FORM_LIMITS.model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Aqua"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-year">Year</Label>
            <Input
              id="pr-year"
              type="number"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2014"
              className="h-11"
              min={1950}
              max={2100}
            />
          </div>
        </div>
      ) : null}

      {step === 'part' ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pr-partname">Part Name</Label>
              <Input
                id="pr-partname"
                value={partName}
                maxLength={FORM_LIMITS.partName}
                onChange={(e) => setPartName(e.target.value)}
                placeholder="Headlight assembly"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-partnum">Part Number (if known)</Label>
              <Input
                id="pr-partnum"
                value={partNumber}
                maxLength={FORM_LIMITS.partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="81110-52J30"
                className="h-11"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-message">Additional Details</Label>
            <Textarea
              id="pr-message"
              value={message}
              maxLength={FORM_LIMITS.message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Any additional information that helps us find the right part..."
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {step !== 'contact' ? (
          <Button type="button" variant="outline" className="h-11 sm:w-auto" onClick={goBack}>
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        ) : null}
        {step !== 'part' ? (
          <Button type="button" className="h-11 flex-1" onClick={goNext}>
            Continue
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={loading} size="lg" className="h-11 flex-1">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Request
              </>
            )}
          </Button>
        )}
      </div>
    </form>
  );
}

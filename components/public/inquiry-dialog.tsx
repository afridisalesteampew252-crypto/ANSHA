'use client';

import { useState } from 'react';
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

interface InquiryDialogProps {
  partId?: string;
  partName?: string;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'accent';
  triggerSize?: 'default' | 'sm' | 'lg';
}

export function InquiryDialog({
  partId,
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
  const [message, setMessage] = useState(
    partName ? `I'm interested in: ${partName}` : ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) {
      toast.error('Please fill in your name and message.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('inquiries').insert({
      part_id: partId || null,
      customer_name: name.trim(),
      customer_email: email.trim() || null,
      customer_phone: phone.trim() || null,
      message: message.trim(),
    });

    setLoading(false);

    if (error) {
      toast.error('Failed to send inquiry. Please try again.');
      return;
    }

    toast.success('Your inquiry has been sent. We will contact you soon.');
    setOpen(false);
    setName('');
    setEmail('');
    setPhone('');
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inquiry-name">Name *</Label>
            <Input
              id="inquiry-name"
              value={name}
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
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inquiry-phone">Phone</Label>
              <Input
                id="inquiry-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+00 000 000 0000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inquiry-message">Message *</Label>
            <Textarea
              id="inquiry-message"
              value={message}
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

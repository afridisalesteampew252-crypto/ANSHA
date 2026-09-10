'use client';

import { useState } from 'react';
import { Send, Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';

export function PartRequestForm() {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [partName, setPartName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter your name.');
      return;
    }
    if (!make.trim() && !partName.trim() && !message.trim()) {
      toast.error('Please tell us what part you need.');
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
      toast.error('Failed to submit request. Please try again.');
      return;
    }
    toast.success('Your request has been submitted. We will contact you soon.');
    setName('');
    setEmail('');
    setPhone('');
    setMake('');
    setModel('');
    setYear('');
    setPartName('');
    setPartNumber('');
    setMessage('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pr-name">Your Name *</Label>
          <Input
            id="pr-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Full name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pr-phone">Phone / WhatsApp</Label>
          <Input
            id="pr-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+00 000 000 0000"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pr-email">Email</Label>
        <Input
          id="pr-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="pr-make">Vehicle Make</Label>
          <Input
            id="pr-make"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="Toyota"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pr-model">Model</Label>
          <Input
            id="pr-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Aqua"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pr-year">Year</Label>
          <Input
            id="pr-year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2014"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pr-partname">Part Name</Label>
          <Input
            id="pr-partname"
            value={partName}
            onChange={(e) => setPartName(e.target.value)}
            placeholder="Headlight assembly"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pr-partnum">Part Number (if known)</Label>
          <Input
            id="pr-partnum"
            value={partNumber}
            onChange={(e) => setPartNumber(e.target.value)}
            placeholder="81110-52J30"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pr-message">Additional Details</Label>
        <Textarea
          id="pr-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Any additional information that helps us find the right part..."
        />
      </div>
      <Button type="submit" disabled={loading} size="lg" className="w-full">
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
    </form>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultAmount?: number | null;
  defaultCurrency?: string | null;
  busy?: boolean;
  onSubmit: (payload: { amount: number; currency: string; notes: string }) => void | Promise<void>;
};

export function ClaimCommissionDialog({
  open,
  onOpenChange,
  title,
  defaultAmount,
  defaultCurrency,
  busy,
  onSubmit,
}: Props) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setAmount(defaultAmount != null && defaultAmount > 0 ? String(defaultAmount) : '');
    setCurrency((defaultCurrency || 'AED').toUpperCase());
    setNotes('');
  }, [open, defaultAmount, defaultCurrency]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Claim commission</DialogTitle>
          <DialogDescription>
            Claim your sales commission for <span className="font-medium text-foreground">{title}</span>.
            Accounts will approve and pay.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-[1fr_5.5rem] gap-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Amount</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                disabled={busy}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Currency</span>
              <Input
                value={currency}
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                disabled={busy}
              />
            </label>
          </div>
          <label className="space-y-1.5 text-sm">
            <Label htmlFor="commission-notes">Notes</Label>
            <Textarea
              id="commission-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Optional — deal reference, rate agreed, etc."
              disabled={busy}
            />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !(Number(amount) > 0)}
            onClick={() => void onSubmit({ amount: Number(amount), currency, notes })}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

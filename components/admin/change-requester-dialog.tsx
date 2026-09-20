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

type RequesterRole = 'sales' | 'freelancer' | 'manager' | 'admin';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultName?: string | null;
  defaultRole?: RequesterRole | null;
  allowRoleEdit?: boolean;
  busy?: boolean;
  onSubmit: (payload: { name: string; role: RequesterRole | null }) => void | Promise<void>;
};

const ROLE_OPTIONS: { value: RequesterRole; label: string }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

export function ChangeRequesterDialog({
  open,
  onOpenChange,
  title,
  defaultName,
  defaultRole,
  allowRoleEdit = true,
  busy,
  onSubmit,
}: Props) {
  const [name, setName] = useState(defaultName || '');
  const [role, setRole] = useState<RequesterRole | ''>(defaultRole || '');

  useEffect(() => {
    if (!open) return;
    setName(defaultName || '');
    setRole(defaultRole || '');
  }, [open, defaultName, defaultRole]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change requester</DialogTitle>
          <DialogDescription>
            Update who requested the reservation for{' '}
            <span className="font-medium text-foreground">{title}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <label className="space-y-1.5 text-sm">
            <Label htmlFor="requester-name">Requester name</Label>
            <Input
              id="requester-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Full name"
              disabled={busy}
            />
          </label>
          {allowRoleEdit ? (
            <label className="space-y-1.5 text-sm">
              <Label htmlFor="requester-role">Requester role</Label>
              <select
                id="requester-role"
                value={role}
                onChange={(event) => setRole(event.target.value as RequesterRole | '')}
                disabled={busy}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Unspecified</option>
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() =>
              void onSubmit({
                name: name.trim(),
                role: role || null,
              })
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

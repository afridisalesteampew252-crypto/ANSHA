'use client';

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-11', className)} />
      <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} aria-controls={props.id}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-md px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        onClick={() => setVisible((value) => !value)}>
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

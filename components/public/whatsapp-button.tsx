'use client';

import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/site-config';

interface WhatsAppButtonProps {
  message?: string;
  className?: string;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  label?: string;
}

export function WhatsAppButton({
  message,
  className,
  variant = 'default',
  size = 'default',
  label = 'WhatsApp Us',
}: WhatsAppButtonProps) {
  const text = message || `Hello ${siteConfig.name}, I'd like to inquire about a part.`;
  const href = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(text)}`;

  return (
    <Button
      asChild
      variant={variant}
      size={size}
      className={cn('bg-[#25D366] text-white hover:bg-[#1ebd5a]', className)}
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}

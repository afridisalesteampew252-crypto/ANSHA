'use client';

import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/site-config';

interface WhatsAppButtonProps {
  message?: string;
  className?: string;
  variant?: 'default' | 'accent' | 'outline' | 'secondary';
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
      className={cn(
        'border border-[#1fb858] bg-[#25D366] font-bold text-white shadow-[0_10px_24px_rgba(37,211,102,0.28)] hover:bg-[#20bd5a] hover:text-white hover:shadow-[0_12px_28px_rgba(37,211,102,0.38)] focus-visible:ring-[#25D366]',
        className
      )}
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}

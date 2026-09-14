'use client';

import { useState } from 'react';

import {
  DEFAULT_MANUFACTURER_LOGO,
  getManufacturerLogo,
} from '@/lib/manufacturer-logos';

interface BrandLogoProps {
  brand: string;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'h-5 w-8',
  md: 'h-7 w-11',
  lg: 'h-10 w-16',
};

export function BrandLogo({
  brand,
  logoUrl,
  size = 'md',
  className = '',
}: BrandLogoProps) {
  const initialLogo = getManufacturerLogo(brand, logoUrl);

  const [src, setSrc] = useState(initialLogo);

  if (!brand) return null;

  return (
    <span
      title={brand}
      className={`inline-flex shrink-0 items-center justify-center ${sizeMap[size]} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${brand} logo`}
        className="h-full w-full object-contain"
        loading="lazy"
        onError={() => {
          if (src !== DEFAULT_MANUFACTURER_LOGO) {
            setSrc(DEFAULT_MANUFACTURER_LOGO);
          }
        }}
      />
    </span>
  );
}

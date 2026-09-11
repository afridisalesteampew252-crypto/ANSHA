'use client';

interface BrandLogoProps {
  brand: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const BRAND_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  toyota: { bg: '#EB0A1E', text: '#FFFFFF', label: 'TOYOTA' },
  nissan: { bg: '#C3002F', text: '#FFFFFF', label: 'NISSAN' },
  honda: { bg: '#CC0000', text: '#FFFFFF', label: 'HONDA' },
  mazda: { bg: '#101010', text: '#FFFFFF', label: 'MAZDA' },
  mitsubishi: { bg: '#E60012', text: '#FFFFFF', label: 'MITSUBISHI' },
  subaru: { bg: '#0046AD', text: '#FFFFFF', label: 'SUBARU' },
  suzuki: { bg: '#1A3E72', text: '#FFFFFF', label: 'SUZUKI' },
  daihatsu: { bg: '#E60012', text: '#FFFFFF', label: 'DAIHATSU' },
  lexus: { bg: '#1B1B1B', text: '#FFFFFF', label: 'LEXUS' },
  isuzu: { bg: '#E60012', text: '#FFFFFF', label: 'ISUZU' },
  bmw: { bg: '#16588E', text: '#FFFFFF', label: 'BMW' },
  audi: { bg: '#BB0A30', text: '#FFFFFF', label: 'AUDI' },
  ford: { bg: '#003478', text: '#FFFFFF', label: 'FORD' },
  mercedes: { bg: '#00ADEF', text: '#FFFFFF', label: 'MERCEDES' },
  volkswagen: { bg: '#001E50', text: '#FFFFFF', label: 'VW' },
  hyundai: { bg: '#002C5F', text: '#FFFFFF', label: 'HYUNDAI' },
  kia: { bg: '#05141F', text: '#FFFFFF', label: 'KIA' },
  'land cruiser': { bg: '#EB0A1E', text: '#FFFFFF', label: 'TOYOTA' },
  'land cruser': { bg: '#EB0A1E', text: '#FFFFFF', label: 'TOYOTA' },
};

function normalizeBrand(brand: string): string {
  return brand.toLowerCase().trim();
}

const sizeMap = {
  sm: { height: 'h-5', padding: 'px-1.5', text: 'text-[8px] font-bold tracking-wider', rounded: 'rounded' },
  md: { height: 'h-7', padding: 'px-2.5', text: 'text-[10px] font-bold tracking-wider', rounded: 'rounded-md' },
  lg: { height: 'h-9', padding: 'px-3', text: 'text-xs font-bold tracking-wider', rounded: 'rounded-md' },
};

export function BrandLogo({ brand, size = 'md', className = '' }: BrandLogoProps) {
  if (!brand) return null;

  const key = normalizeBrand(brand);
  const style = BRAND_STYLES[key];

  if (!style) {
    const sz = sizeMap[size];
    return (
      <span
        className={`inline-flex items-center justify-center ${sz.height} ${sz.padding} ${sz.rounded} ${sz.text} bg-secondary text-foreground border border-border ${className}`}
      >
        {brand.toUpperCase().slice(0, 12)}
      </span>
    );
  }

  const sz = sizeMap[size];
  return (
    <span
      className={`inline-flex items-center justify-center ${sz.height} ${sz.padding} ${sz.rounded} ${sz.text} ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}

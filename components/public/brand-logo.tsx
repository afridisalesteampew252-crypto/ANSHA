'use client';

interface BrandLogoProps {
  brand: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

type LogoComponent = (props: { className?: string }) => React.ReactNode;

function ToyotaLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse
        cx="50"
        cy="50"
        rx="38"
        ry="25"
        fill="none"
        stroke="#EB0A1E"
        strokeWidth="5"
      />
      <ellipse
        cx="50"
        cy="50"
        rx="15"
        ry="25"
        fill="none"
        stroke="#EB0A1E"
        strokeWidth="5"
      />
      <ellipse
        cx="50"
        cy="40"
        rx="28"
        ry="10"
        fill="none"
        stroke="#EB0A1E"
        strokeWidth="5"
      />
    </svg>
  );
}

function HondaLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="15"
        y="22"
        width="70"
        height="56"
        rx="12"
        fill="none"
        stroke="#CC0000"
        strokeWidth="5"
      />
      <path
        d="M30 35 L36 66 L43 66 L46 48 H54 L57 66 H64 L70 35 H61 L57 51 H43 L39 35 Z"
        fill="#CC0000"
      />
    </svg>
  );
}

function NissanLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="50"
        cy="50"
        r="30"
        fill="none"
        stroke="#C3002F"
        strokeWidth="6"
      />
      <rect x="13" y="42" width="74" height="16" rx="2" fill="#C3002F" />
      <rect x="22" y="46" width="56" height="8" fill="white" />
    </svg>
  );
}

function SuzukiLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M67 14 L34 14 L20 31 L47 50 L30 65 L18 58 L18 76 L34 86 L80 50 L53 31 Z"
        fill="#E20A17"
      />
    </svg>
  );
}

function MazdaLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse
        cx="50"
        cy="50"
        rx="35"
        ry="28"
        fill="none"
        stroke="#101010"
        strokeWidth="6"
      />
      <path
        d="M27 40 Q40 42 50 59 Q60 42 73 40 Q63 58 50 68 Q37 58 27 40Z"
        fill="#101010"
      />
    </svg>
  );
}

function MitsubishiLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M50 12 L67 40 L50 49 L33 40 Z" fill="#E60012" />
      <path d="M31 43 L48 52 L31 80 L14 71 Z" fill="#E60012" />
      <path d="M69 43 L86 71 L69 80 L52 52 Z" fill="#E60012" />
    </svg>
  );
}

function SubaruLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse cx="50" cy="50" rx="39" ry="26" fill="#0046AD" />
      <g fill="#FFFFFF">
        <circle cx="34" cy="48" r="5" />
        <circle cx="54" cy="38" r="3" />
        <circle cx="64" cy="44" r="2.5" />
        <circle cx="57" cy="54" r="2.5" />
        <circle cx="69" cy="56" r="2" />
        <circle cx="47" cy="60" r="2" />
      </g>
    </svg>
  );
}

function LexusLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse
        cx="50"
        cy="50"
        rx="38"
        ry="28"
        fill="none"
        stroke="#1B1B1B"
        strokeWidth="5"
      />
      <path
        d="M48 27 L38 67 L67 67 L70 59 L50 59 L58 28 Z"
        fill="#1B1B1B"
      />
    </svg>
  );
}

function DaihatsuLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M22 27 H55 C72 27 82 36 82 50 C82 64 72 73 55 73 H22 V60 H54 C63 60 68 57 68 50 C68 43 63 40 54 40 H22 Z"
        fill="#E60012"
      />
    </svg>
  );
}

function IsuzuLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M25 23 H40 V77 H25 Z M60 23 H75 V77 H60 Z" fill="#E60012" />
      <path
        d="M25 23 L40 23 L50 40 L60 23 L75 23 L50 58 Z"
        fill="#E60012"
      />
    </svg>
  );
}

function BMWLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="38" fill="#111111" />
      <circle cx="50" cy="50" r="27" fill="#FFFFFF" />
      <path d="M50 23 A27 27 0 0 1 77 50 H50 Z" fill="#16588E" />
      <path d="M50 77 A27 27 0 0 1 23 50 H50 Z" fill="#16588E" />
    </svg>
  );
}

function AudiLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g fill="none" stroke="#BB0A30" strokeWidth="5">
        <circle cx="24" cy="50" r="16" />
        <circle cx="42" cy="50" r="16" />
        <circle cx="60" cy="50" r="16" />
        <circle cx="78" cy="50" r="16" />
      </g>
    </svg>
  );
}

function FordLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse cx="50" cy="50" rx="42" ry="25" fill="#003478" />
      <path
        d="M25 55 Q40 38 64 42 Q76 44 72 51 Q68 57 56 54 Q46 52 38 58"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MercedesLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="50"
        cy="50"
        r="37"
        fill="none"
        stroke="#111111"
        strokeWidth="5"
      />
      <path
        d="M50 17 L55 48 L82 70 L52 57 L20 72 L45 48 Z"
        fill="#111111"
      />
    </svg>
  );
}

function VolkswagenLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="50"
        cy="50"
        r="36"
        fill="none"
        stroke="#001E50"
        strokeWidth="5"
      />
      <path
        d="M28 28 L40 60 L50 42 L60 60 L72 28"
        fill="none"
        stroke="#001E50"
        strokeWidth="7"
      />
    </svg>
  );
}

function HyundaiLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse
        cx="50"
        cy="50"
        rx="39"
        ry="25"
        fill="none"
        stroke="#002C5F"
        strokeWidth="6"
      />
      <path
        d="M32 65 L43 35 M57 65 L68 35 M40 52 Q50 59 61 48"
        fill="none"
        stroke="#002C5F"
        strokeWidth="7"
      />
    </svg>
  );
}

function KiaLogo({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 63 L31 36 L31 63 M31 49 L45 63 M45 36 L45 63 M49 63 L64 36 L86 63 M59 53 H76"
        fill="none"
        stroke="#05141F"
        strokeWidth="6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const BRAND_LOGOS: Record<string, LogoComponent> = {
  toyota: ToyotaLogo,
  honda: HondaLogo,
  nissan: NissanLogo,
  suzuki: SuzukiLogo,
  mazda: MazdaLogo,
  mitsubishi: MitsubishiLogo,
  subaru: SubaruLogo,
  lexus: LexusLogo,
  daihatsu: DaihatsuLogo,
  isuzu: IsuzuLogo,
  bmw: BMWLogo,
  audi: AudiLogo,
  ford: FordLogo,
  mercedes: MercedesLogo,
  'mercedes-benz': MercedesLogo,
  benz: MercedesLogo,
  volkswagen: VolkswagenLogo,
  vw: VolkswagenLogo,
  hyundai: HyundaiLogo,
  kia: KiaLogo,

  // Model incorrectly stored as brand
  'land cruiser': ToyotaLogo,
  'land cruser': ToyotaLogo,
};

function normalizeBrand(brand: string): string {
  return brand.toLowerCase().trim();
}

const sizeMap = {
  sm: 'h-5 w-8',
  md: 'h-7 w-11',
  lg: 'h-10 w-16',
};

export function BrandLogo({
  brand,
  size = 'md',
  className = '',
}: BrandLogoProps) {
  if (!brand) return null;

  const key = normalizeBrand(brand);
  const LogoComponent = BRAND_LOGOS[key];

  if (!LogoComponent) {
    return (
      <span
        title={brand}
        className={`
          inline-flex items-center justify-center
          ${sizeMap[size]}
          rounded-md border border-border
          bg-secondary px-1
          text-[8px] font-bold uppercase
          text-foreground
          ${className}
        `}
      >
        {brand.slice(0, 5)}
      </span>
    );
  }

  return (
    <span
      title={brand}
      aria-label={`${brand} logo`}
      className={`
        inline-flex items-center justify-center
        shrink-0
        ${sizeMap[size]}
        ${className}
      `}
    >
      <LogoComponent className="h-full w-full object-contain" />
    </span>
  );
}

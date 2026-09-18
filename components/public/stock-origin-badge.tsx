import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { STOCK_ORIGINS, type StockOrigin, stockOriginLabel } from '@/lib/stock';

type FlagProps = { className?: string; title?: string };

function FlagShell({ className, title, children }: FlagProps & { children: ReactNode }) {
  return (
    <span
      title={title}
      aria-hidden
      className={cn(
        'inline-block h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px] border border-black/15 shadow-sm',
        className
      )}
    >
      {children}
    </span>
  );
}

function JapanFlag(props: FlagProps) {
  return (
    <FlagShell {...props} title="Japan">
      <span className="relative flex h-full w-full items-center justify-center bg-white">
        <span className="h-2 w-2 rounded-full bg-[#bc002d]" />
      </span>
    </FlagShell>
  );
}

function UaeFlag(props: FlagProps) {
  return (
    <FlagShell {...props} title="United Arab Emirates">
      <span className="flex h-full w-full">
        <span className="h-full w-[28%] bg-[#ff0000]" />
        <span className="flex h-full flex-1 flex-col">
          <span className="flex-1 bg-[#00732f]" />
          <span className="flex-1 bg-white" />
          <span className="flex-1 bg-black" />
        </span>
      </span>
    </FlagShell>
  );
}

function SingaporeFlag(props: FlagProps) {
  return (
    <FlagShell {...props} title="Singapore">
      <span className="flex h-full w-full flex-col">
        <span className="relative flex flex-1 items-center bg-[#ef3340] pl-0.5">
          <span className="h-1.5 w-1.5 rounded-full border border-white bg-transparent" />
        </span>
        <span className="flex-1 bg-white" />
      </span>
    </FlagShell>
  );
}

function ChinaFlag(props: FlagProps) {
  return (
    <FlagShell {...props} title="China">
      <span className="relative flex h-full w-full bg-[#de2910]">
        <span className="absolute left-0.5 top-0.5 text-[6px] leading-none text-[#ffde00]">★</span>
      </span>
    </FlagShell>
  );
}

function ThailandFlag(props: FlagProps) {
  return (
    <FlagShell {...props} title="Thailand">
      <span className="flex h-full w-full flex-col">
        <span className="h-[18%] bg-[#a51931]" />
        <span className="h-[18%] bg-white" />
        <span className="flex-1 bg-[#2d2a4a]" />
        <span className="h-[18%] bg-white" />
        <span className="h-[18%] bg-[#a51931]" />
      </span>
    </FlagShell>
  );
}

function TaiwanFlag(props: FlagProps) {
  return (
    <FlagShell {...props} title="Taiwan">
      <span className="relative flex h-full w-full bg-[#fe0000]">
        <span className="absolute left-0 top-0 h-1/2 w-[45%] bg-[#000095]" />
      </span>
    </FlagShell>
  );
}

const FLAG_BY_ORIGIN = {
  japan: JapanFlag,
  dubai: UaeFlag,
  singapore: SingaporeFlag,
  china: ChinaFlag,
  thailand: ThailandFlag,
  taiwan: TaiwanFlag,
} as const;

export function StockOriginBadge({
  origin,
  className,
  compact = false,
}: {
  origin: string | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  const value = (STOCK_ORIGINS.some((item) => item.value === origin) ? origin : 'dubai') as StockOrigin;
  const Flag = FLAG_BY_ORIGIN[value];
  const label = stockOriginLabel(value);

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md bg-background/90 font-bold uppercase tracking-[0.12em] text-foreground shadow-sm backdrop-blur',
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]',
        className
      )}
    >
      <Flag />
      <span className="truncate">{compact ? label.replace(' Stock', '') : label}</span>
    </span>
  );
}

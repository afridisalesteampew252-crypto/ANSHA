import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { JsonLd } from '@/components/seo/json-ld';
import { buildBreadcrumbListJsonLd, type BreadcrumbCrumb } from '@/lib/seo-schema';
import { cn } from '@/lib/utils';

export type { BreadcrumbCrumb };

type PageBreadcrumbsProps = {
  items: BreadcrumbCrumb[];
  /** `band` = light text on dark page-band; `muted` = default light surfaces. */
  variant?: 'band' | 'muted';
  className?: string;
  /** Emit BreadcrumbList JSON-LD (default true when 2+ crumbs). */
  includeJsonLd?: boolean;
};

export function PageBreadcrumbs({
  items,
  variant = 'band',
  className,
  includeJsonLd = true,
}: PageBreadcrumbsProps) {
  const crumbs = items.filter((item) => item.name.trim().length > 0);
  if (!crumbs.length) return null;

  const jsonLd = includeJsonLd ? buildBreadcrumbListJsonLd(crumbs) : null;
  const linkClass =
    variant === 'band'
      ? 'shrink-0 hover:text-white'
      : 'shrink-0 hover:text-foreground';
  const currentClass =
    variant === 'band'
      ? 'truncate font-medium text-white'
      : 'truncate font-medium text-foreground';
  const navClass =
    variant === 'band'
      ? 'flex min-w-0 items-center gap-1.5 text-sm text-white/55'
      : 'flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground';

  return (
    <>
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      <nav aria-label="Breadcrumb" className={cn(navClass, className)}>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <span key={`${crumb.name}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className={linkClass}>
                  {crumb.name}
                </Link>
              ) : (
                <span className={currentClass} aria-current={isLast ? 'page' : undefined}>
                  {crumb.name}
                </span>
              )}
            </span>
          );
        })}
      </nav>
    </>
  );
}

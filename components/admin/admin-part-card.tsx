'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { BookmarkPlus, Eye, Pencil, Trash2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { publicPartImageUrl } from '@/components/public/catalog-image';
import { StockOriginBadge } from '@/components/public/stock-origin-badge';
import { conditionLabels } from '@/lib/site-config';
import { stockOriginLabel } from '@/lib/stock';
import {
  PRICE_TERM_LABELS,
  SHIPMENT_MODE_LABELS,
  inspectionRequiredLabel,
  vatApplicableLabel,
} from '@/lib/trade-terms';
import type { PartWithRelations, StockStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const statusClass: Record<StockStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  reserved: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sold: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
};

type Props = {
  part: PartWithRelations;
  fieldAgent: boolean;
  reservedByLabel?: string | null;
  salesStatusLabel?: string | null;
  shipmentStatusLabel?: string | null;
  onUpdate?: (id: string, changes: Record<string, unknown>) => void;
  onDelete?: (part: PartWithRelations) => void;
  stockOriginOptions?: ReadonlyArray<{ value: string; label: string }>;
};

function money(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return null;
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency || ''}`.trim();
  }
}

export function AdminPartCard({
  part,
  fieldAgent,
  reservedByLabel,
  salesStatusLabel,
  shipmentStatusLabel,
  onUpdate,
  onDelete,
  stockOriginOptions,
}: Props) {
  const cover = part.part_photos?.find((photo) => photo.is_cover) || part.part_photos?.[0];
  const photoUrl = cover ? publicPartImageUrl(cover.storage_path) : '';
  const status = part.stock_status || 'available';
  const canReserve = status === 'available' && part.quantity > 0;
  const fob = money(part.price_fob ?? part.price, part.currency);
  const categoryName = part.categories?.name;
  const compat = (part.part_compatibility || []).slice(0, 2);
  const compatLabel = compat.map((c) => `${c.make} ${c.model}`.trim()).join(', ');

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3 shadow-sm sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] lg:grid-cols-[5.5rem_minmax(12rem,1.3fr)_minmax(7rem,0.8fr)_minmax(8rem,0.9fr)_minmax(10rem,1.1fr)]">
      <div className="h-16 w-20 overflow-hidden rounded-md bg-secondary">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-contain p-1" />
        ) : (
          <div className="grid h-full place-items-center">
            <Wrench className="h-5 w-5 text-muted-foreground/30" />
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-1 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={statusClass[status]}>{status}</Badge>
          {salesStatusLabel ? (
            <Badge variant="outline" className="font-normal">
              {salesStatusLabel}
            </Badge>
          ) : null}
          {shipmentStatusLabel ? (
            <Badge className="bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200">
              {shipmentStatusLabel}
            </Badge>
          ) : null}
          {!fieldAgent ? (
            part.is_published ? (
              <Badge variant="outline">Public</Badge>
            ) : (
              <Badge variant="secondary">Draft</Badge>
            )
          ) : null}
        </div>
        {fieldAgent ? (
          <p className="truncate text-sm font-bold tracking-tight">{part.name}</p>
        ) : (
          <Link
            href={`/admin/parts/${part.id}`}
            className="block truncate text-sm font-bold tracking-tight text-primary hover:underline"
          >
            {part.name}
          </Link>
        )}
        <p className="font-mono text-[11px] text-muted-foreground">{part.part_code}</p>
        <p className="truncate text-muted-foreground">
          {[categoryName, conditionLabels[part.condition], `Qty ${part.quantity}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {(part.oem_number || part.part_number) && (
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {part.oem_number || part.part_number}
          </p>
        )}
      </div>

      <div className="hidden space-y-0.5 text-xs text-muted-foreground lg:block">
        <p>{stockOriginLabel(part.stock_origin)}</p>
        <p>{part.location || '—'}</p>
        {fob ? <p className="font-medium text-foreground">FOB {fob}</p> : null}
        {compatLabel ? <p className="truncate">{compatLabel}</p> : null}
        <StockOriginBadge origin={part.stock_origin} compact />
      </div>

      <div className="hidden space-y-0.5 text-xs lg:block">
        {reservedByLabel || part.reservation_requester_name ? (
          <Badge className="bg-sky-600 text-white">
            {part.reservation_requester_name || reservedByLabel}
          </Badge>
        ) : (
          <p className="text-muted-foreground">No agent</p>
        )}
        {status === 'reserved' && part.reservation_price_term ? (
          <p>{PRICE_TERM_LABELS[part.reservation_price_term]}</p>
        ) : null}
        {status === 'reserved' && part.reservation_shipment_term ? (
          <p>{SHIPMENT_MODE_LABELS[part.reservation_shipment_term]}</p>
        ) : null}
        {status === 'reserved' && part.reservation_inspection_required != null ? (
          <p className="text-muted-foreground">
            Inspection: {inspectionRequiredLabel(part.reservation_inspection_required)}
          </p>
        ) : null}
        {status === 'reserved' && part.reservation_vat_applicable != null ? (
          <p
            className={cn(
              'font-semibold',
              part.reservation_vat_applicable ? 'text-emerald-700' : 'text-red-700'
            )}
          >
            VAT: {vatApplicableLabel(part.reservation_vat_applicable)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:col-span-3 lg:col-span-1 lg:items-end">
        <div className="flex flex-wrap gap-1.5 lg:justify-end">
          {canReserve ? (
            <Button asChild size="sm" variant="accent">
              <Link href={`/admin/reservations?part=${part.id}`}>
                <BookmarkPlus className="h-3.5 w-3.5" />
                Reserve
              </Link>
            </Button>
          ) : (
            <span className="self-center text-[11px] text-muted-foreground">
              {status === 'reserved' ? 'Reserved' : status === 'sold' ? 'Sold' : 'Unavailable'}
            </span>
          )}
          {!fieldAgent ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdate?.(part.id, { is_published: !part.is_published })}
            >
              {part.is_published ? 'Unpublish' : 'Publish'}
            </Button>
          ) : null}
          <Button asChild size="sm" variant="ghost">
            <Link href={`/parts/${part.slug}`} target="_blank">
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
          {!fieldAgent ? (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/admin/parts/${part.id}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => onDelete?.(part)}
                aria-label={`Delete ${part.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
        </div>
        {!fieldAgent ? (
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:max-w-xs">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Origin
              <select
                value={part.stock_origin || 'dubai'}
                onChange={(event) => onUpdate?.(part.id, { stock_origin: event.target.value })}
                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              >
                {(stockOriginOptions || []).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Stock
              <select
                value={status}
                onChange={(event) => onUpdate?.(part.id, { stock_status: event.target.value })}
                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              >
                <option value="available">Available</option>
                <option value="reserved">Reserved</option>
                <option value="sold">Sold</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}

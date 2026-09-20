'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import {
  BookmarkPlus,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  Gavel,
  PackagePlus,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { publicVehicleImageUrl } from '@/components/public/catalog-image';
import { StockOriginBadge } from '@/components/public/stock-origin-badge';
import { lifecycleStageLabel, type LifecycleStage } from '@/lib/vehicle-lifecycle';
import {
  PRICE_TERM_LABELS,
  SHIPMENT_MODE_LABELS,
  inspectionRequiredLabel,
  vatApplicableLabel,
} from '@/lib/trade-terms';
import { auctionSheetPhotos, pickVehicleCoverPhoto } from '@/lib/vehicle-photos';
import { isMachineryClass, vehicleClassBadgeLabel } from '@/lib/vehicle-class';
import { isAuctionStockPool, stockOriginLabel, type StockPool } from '@/lib/stock';
import type { StockStatus, VehiclePhoto, VehicleWithPhotos } from '@/lib/types';
import { cn } from '@/lib/utils';

const statusClass: Record<StockStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  reserved: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sold: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
};

const stageClass: Record<LifecycleStage, string> = {
  unassigned: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  auction: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  yard: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  port: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  sold: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
};

const auctionSheetBadgeClass =
  'cursor-pointer border-amber-500/50 bg-amber-500/10 font-normal text-amber-800 hover:bg-amber-500/20 dark:text-amber-200';

type Props = {
  vehicle: VehicleWithPhotos;
  fieldAgent: boolean;
  reservedByLabel?: string | null;
  salesStatusLabel?: string | null;
  shipmentStatusLabel?: string | null;
  onUpdate?: (id: string, changes: Record<string, unknown>, success: string) => void;
  onSetListing?: (vehicle: VehicleWithPhotos, publish: boolean) => void;
  onDelete?: (vehicle: VehicleWithPhotos) => void;
  onTransferPool?: (vehicle: VehicleWithPhotos, nextPool: StockPool) => void;
  stockOriginOptions?: ReadonlyArray<{ value: string; label: string }>;
};

function AuctionSheetTag({
  photos,
  vehicleTitle,
  className,
}: {
  photos: VehiclePhoto[] | null | undefined;
  vehicleTitle: string;
  className?: string;
}) {
  const sheets = auctionSheetPhotos(photos);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  if (sheets.length === 0) return null;

  const active = sheets[Math.min(index, sheets.length - 1)];
  const photoUrl = publicVehicleImageUrl(active.storage_path);

  function openSheet(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIndex(0);
    setOpen(true);
  }

  return (
    <>
      <Badge
        role="button"
        tabIndex={0}
        variant="outline"
        title="Open auction sheet"
        aria-label="Open auction sheet"
        className={cn(auctionSheetBadgeClass, className)}
        onClick={openSheet}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') openSheet(event);
        }}
      >
        Auction sheet
      </Badge>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[92vh] max-w-[min(96vw,72rem)] overflow-hidden border-white/10 bg-black/95 p-0">
          <DialogTitle className="sr-only">
            {vehicleTitle} — Auction sheet{sheets.length > 1 ? ` ${index + 1} of ${sheets.length}` : ''}
          </DialogTitle>
          <div className="relative flex h-full min-h-[50vh] w-full flex-col items-center justify-center p-4 pb-16 sm:p-8 sm:pb-20">
            <img
              src={photoUrl}
              alt={`${vehicleTitle} auction sheet`}
              className="max-h-full max-w-full object-contain"
            />
            {sheets.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setIndex((current) => (current - 1 + sheets.length) % sheets.length)}
                  className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Previous auction sheet"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => setIndex((current) => (current + 1) % sheets.length)}
                  className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Next auction sheet"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <p className="absolute bottom-4 text-xs text-white/80">
                  {index + 1} / {sheets.length}
                </p>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

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

export function AdminVehicleCard({
  vehicle,
  fieldAgent,
  reservedByLabel,
  salesStatusLabel,
  shipmentStatusLabel,
  onUpdate,
  onSetListing,
  onDelete,
  onTransferPool,
  stockOriginOptions,
}: Props) {
  const cover = pickVehicleCoverPhoto(vehicle.vehicle_photos);
  const photoUrl = cover ? publicVehicleImageUrl(cover.storage_path) : '';
  const status = vehicle.stock_status || 'available';
  const stage = (vehicle.lifecycle_stage || 'unassigned') as LifecycleStage;
  const auctionPool = isAuctionStockPool(vehicle.stock_pool);
  const canReserve = status === 'available';
  const stockRef =
    vehicle.stock_number || vehicle.chassis_number || vehicle.chassis_code || vehicle.id.slice(0, 8);
  const fob = money(vehicle.price_fob ?? vehicle.price, vehicle.currency);

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3 shadow-sm sm:grid-cols-[7rem_minmax(0,1fr)_auto] lg:grid-cols-[7rem_minmax(12rem,1.3fr)_minmax(8rem,0.9fr)_minmax(9rem,1fr)_minmax(10rem,1.1fr)]">
      <div className="h-20 w-28 overflow-hidden rounded-md bg-secondary">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center">
            <Car className="h-6 w-6 text-muted-foreground/30" />
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-1 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={statusClass[status]}>{status.replace('_', ' ')}</Badge>
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
          {!fieldAgent ? <Badge className={stageClass[stage]}>{lifecycleStageLabel(stage)}</Badge> : null}
          {isMachineryClass(vehicle.vehicle_class) ? (
            <Badge variant="outline" className="font-normal">
              {vehicleClassBadgeLabel(vehicle.vehicle_class)}
            </Badge>
          ) : null}
          {!fieldAgent ? (
            vehicle.is_published ? (
              <Badge variant="outline">Public</Badge>
            ) : (
              <Badge variant="secondary">Draft</Badge>
            )
          ) : null}
          {auctionPool ? (
            <Badge className="border-0 bg-violet-600 text-white">Auction stock</Badge>
          ) : null}
          <AuctionSheetTag photos={vehicle.vehicle_photos} vehicleTitle={vehicle.title} />
        </div>
        {fieldAgent ? (
          <p className="truncate text-sm font-bold tracking-tight">{vehicle.title}</p>
        ) : (
          <Link
            href={`/admin/vehicles/${vehicle.id}`}
            className="block truncate text-sm font-bold tracking-tight text-primary hover:underline"
          >
            {vehicle.title}
          </Link>
        )}
        <p className="font-mono text-[11px] text-muted-foreground">{stockRef}</p>
        <p className="truncate text-muted-foreground">
          {[vehicle.year, vehicle.make, vehicle.model, vehicle.variant].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>

      <div className="hidden space-y-0.5 text-xs text-muted-foreground lg:block">
        <p>{stockOriginLabel(vehicle.stock_origin)}</p>
        <p>{vehicle.location || '—'}</p>
        {fob ? <p className="font-medium text-foreground">FOB {fob}</p> : null}
        <StockOriginBadge origin={vehicle.stock_origin} compact />
      </div>

      <div className="hidden space-y-0.5 text-xs lg:block">
        {status === 'reserved' && (reservedByLabel || vehicle.reservation_requester_name) ? (
          <Badge className="bg-sky-600 text-white">
            {vehicle.reservation_requester_name || reservedByLabel}
          </Badge>
        ) : (
          <p className="text-muted-foreground">No agent</p>
        )}
        {status === 'reserved' && vehicle.reservation_price_term ? (
          <p>{PRICE_TERM_LABELS[vehicle.reservation_price_term]}</p>
        ) : null}
        {status === 'reserved' && vehicle.reservation_shipment_term ? (
          <p>{SHIPMENT_MODE_LABELS[vehicle.reservation_shipment_term]}</p>
        ) : null}
        {status === 'reserved' && vehicle.reservation_inspection_required != null ? (
          <p className="text-muted-foreground">
            Inspection: {inspectionRequiredLabel(vehicle.reservation_inspection_required)}
          </p>
        ) : null}
        {status === 'reserved' && vehicle.reservation_vat_applicable != null ? (
          <p
            className={cn(
              'font-semibold',
              vehicle.reservation_vat_applicable ? 'text-emerald-700' : 'text-red-700'
            )}
          >
            VAT: {vatApplicableLabel(vehicle.reservation_vat_applicable)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:col-span-3 lg:col-span-1 lg:items-end">
        <div className="flex flex-wrap gap-1.5 lg:justify-end">
          {canReserve ? (
            <Button asChild size="sm" variant="accent">
              <Link href={`/admin/reservations?vehicle=${vehicle.id}`}>
                <BookmarkPlus className="h-3.5 w-3.5" />
                Reserve
              </Link>
            </Button>
          ) : null}
          {!fieldAgent && status === 'available' && !vehicle.is_published ? (
            <Button size="sm" variant="outline" onClick={() => onSetListing?.(vehicle, true)}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Publish
            </Button>
          ) : null}
          {!fieldAgent && vehicle.is_published ? (
            <Button size="sm" variant="outline" onClick={() => onSetListing?.(vehicle, false)}>
              Unpublish
            </Button>
          ) : null}
          {!fieldAgent && auctionPool && onTransferPool ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onTransferPool(vehicle, 'owned')}
              title="Purchase into owned Vehicles inventory"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              To inventory
            </Button>
          ) : null}
          {!fieldAgent && !auctionPool && onTransferPool ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onTransferPool(vehicle, 'auction_third_party')}
              title="Mark as third-party auction stock"
            >
              <Gavel className="h-3.5 w-3.5" />
              To auction
            </Button>
          ) : null}
          <Button asChild size="sm" variant="ghost">
            <Link href={`/vehicles/${vehicle.slug}`} target="_blank">
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
          {!fieldAgent ? (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/admin/vehicles/${vehicle.id}`}>
                  <Edit className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => onDelete?.(vehicle)}
                aria-label={`Delete ${vehicle.title}`}
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
                value={vehicle.stock_origin || 'dubai'}
                onChange={(event) =>
                  onUpdate?.(vehicle.id, { stock_origin: event.target.value }, 'Stock location updated.')
                }
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
                onChange={(event) =>
                  onUpdate?.(
                    vehicle.id,
                    { stock_status: event.target.value },
                    event.target.value === 'sold' ? 'Vehicle marked sold.' : 'Availability updated.'
                  )
                }
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

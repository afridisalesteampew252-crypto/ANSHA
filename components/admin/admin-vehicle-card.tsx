'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { BookmarkPlus, Car, CheckCircle2, ChevronLeft, ChevronRight, Edit, Eye, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { publicVehicleImageUrl } from '@/components/public/catalog-image';
import { StockOriginBadge } from '@/components/public/stock-origin-badge';
import { lifecycleStageLabel, type LifecycleStage } from '@/lib/vehicle-lifecycle';
import { auctionSheetPhotos, pickVehicleCoverPhoto } from '@/lib/vehicle-photos';
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
  onUpdate?: (id: string, changes: Record<string, unknown>, success: string) => void;
  onSetListing?: (vehicle: VehicleWithPhotos, publish: boolean) => void;
  onDelete?: (vehicle: VehicleWithPhotos) => void;
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

export function AdminVehicleCard({
  vehicle,
  fieldAgent,
  onUpdate,
  onSetListing,
  onDelete,
  stockOriginOptions,
}: Props) {
  const cover = pickVehicleCoverPhoto(vehicle.vehicle_photos);
  const photoUrl = cover ? publicVehicleImageUrl(cover.storage_path) : '';
  const status = vehicle.stock_status || 'available';
  const stage = (vehicle.lifecycle_stage || 'unassigned') as LifecycleStage;
  const canReserve = status === 'available';
  const stockRef = vehicle.stock_number || vehicle.chassis_number || vehicle.chassis_code || 'No stock reference';

  if (fieldAgent) {
    return (
      <Card className="overflow-hidden border-border/80">
        <CardContent className="p-0">
          <div className="flex gap-4 p-4">
            <div className="h-24 w-32 shrink-0 overflow-hidden rounded-md bg-secondary">
              {photoUrl ? (
                <img src={photoUrl} alt={vehicle.title} className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full place-items-center">
                  <Car className="h-7 w-7 text-muted-foreground/30" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusClass[status]}>{status.replace('_', ' ')}</Badge>
                <Badge variant="outline" className="font-normal">
                  {lifecycleStageLabel(stage)}
                </Badge>
                <StockOriginBadge origin={vehicle.stock_origin} compact />
                <AuctionSheetTag photos={vehicle.vehicle_photos} vehicleTitle={vehicle.title} />
              </div>
              <h2 className="mt-2 truncate text-base font-bold tracking-tight">{vehicle.title}</h2>
              <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-foreground/70">Stock / VIN</dt>
                  <dd className="truncate font-mono">{stockRef}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-foreground/70">Spec</dt>
                  <dd className="truncate">
                    {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' · ') || '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border/70 bg-secondary/40 px-3 py-2.5">
            {canReserve ? (
              <Button asChild size="sm" variant="accent" className="gap-1.5">
                <Link href={`/admin/reservations?vehicle=${vehicle.id}`}>
                  <BookmarkPlus className="h-4 w-4" />
                  Reserve
                </Link>
              </Button>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">
                {status === 'reserved' ? 'Reserved — open Reservations to manage' : 'Not available'}
              </span>
            )}
            <Button asChild variant="ghost" size="sm" className="ml-auto gap-1">
              <Link href={`/vehicles/${vehicle.slug}`} target="_blank">
                <Eye className="h-4 w-4" />
                View
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex gap-4 p-4">
          <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-secondary">
            {photoUrl ? (
              <img src={photoUrl} alt={vehicle.title} className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full place-items-center">
                <Car className="h-7 w-7 text-muted-foreground/30" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge className={stageClass[stage]}>{lifecycleStageLabel(stage)}</Badge>
              <Badge className={statusClass[status]}>{status.replace('_', ' ')}</Badge>
              {vehicle.is_published ? <Badge variant="outline">Public</Badge> : <Badge variant="secondary">Draft</Badge>}
              <AuctionSheetTag photos={vehicle.vehicle_photos} vehicleTitle={vehicle.title} />
            </div>
            <h2 className="mt-2 truncate font-bold">{vehicle.title}</h2>
            <p className="text-xs text-muted-foreground">{stockRef}</p>
            <p className="mt-1">
              <StockOriginBadge origin={vehicle.stock_origin} compact />
            </p>
          </div>
        </div>
        <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted-foreground">
            Stock location
            <select
              value={vehicle.stock_origin || 'dubai'}
              onChange={(event) =>
                onUpdate?.(vehicle.id, { stock_origin: event.target.value }, 'Stock location updated.')
              }
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
            >
              {(stockOriginOptions || []).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Availability
            <select
              value={status}
              onChange={(event) =>
                onUpdate?.(
                  vehicle.id,
                  { stock_status: event.target.value },
                  event.target.value === 'sold' ? 'Vehicle marked sold.' : 'Availability updated.'
                )
              }
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="sold">Sold</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t p-3">
          {status === 'available' && !vehicle.is_published ? (
            <Button variant="outline" size="sm" onClick={() => onSetListing?.(vehicle, true)}>
              <CheckCircle2 className="h-4 w-4" />
              Publish when available
            </Button>
          ) : null}
          {vehicle.is_published ? (
            <Button variant="outline" size="sm" onClick={() => onSetListing?.(vehicle, false)}>
              <CheckCircle2 className="h-4 w-4" />
              Unpublish
            </Button>
          ) : null}
          {(status === 'reserved' || status === 'sold') && vehicle.is_published ? (
            <Button variant="outline" size="sm" onClick={() => onSetListing?.(vehicle, false)}>
              Unpublish when reserved
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <Link href={`/vehicles/${vehicle.slug}`} target="_blank">
              <Eye className="h-4 w-4" />
              View
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/admin/vehicles/${vehicle.id}`}>
              <Edit className="h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto text-destructive"
            onClick={() => onDelete?.(vehicle)}
            aria-label={`Delete ${vehicle.title}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

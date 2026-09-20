'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import {
  Banknote,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Gavel,
  ImageMinus,
  PackagePlus,
  Pencil,
  ReceiptText,
  RotateCcw,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  onUpdate?: (id: string, changes: Record<string, unknown>, success: string) => void;
  onSetListing?: (vehicle: VehicleWithPhotos, publish: boolean) => void;
  onDelete?: (vehicle: VehicleWithPhotos) => void;
  onTransferPool?: (vehicle: VehicleWithPhotos, nextPool: StockPool) => void;
  onMakeAvailable?: (vehicle: VehicleWithPhotos) => void;
  onChangeRequester?: (vehicle: VehicleWithPhotos) => void;
  onClaimCommission?: (vehicle: VehicleWithPhotos) => void;
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
  selected = false,
  onSelectedChange,
  onUpdate,
  onSetListing,
  onDelete,
  onTransferPool,
  onMakeAvailable,
  onChangeRequester,
  onClaimCommission,
  stockOriginOptions,
}: Props) {
  const cover = pickVehicleCoverPhoto(vehicle.vehicle_photos);
  const photoUrl = cover ? publicVehicleImageUrl(cover.storage_path) : '';
  const status = vehicle.stock_status || 'available';
  const stage = (vehicle.lifecycle_stage || 'unassigned') as LifecycleStage;
  const auctionPool = isAuctionStockPool(vehicle.stock_pool);
  const canReserve = status === 'available';
  const isReserved = status === 'reserved';
  const isSold = status === 'sold';
  const selectable = Boolean(onSelectedChange) && canReserve;
  const stockRef =
    vehicle.stock_number || vehicle.chassis_number || vehicle.chassis_code || vehicle.id.slice(0, 8);
  const fob = money(vehicle.price_fob ?? vehicle.price, vehicle.currency);
  const invoiceHref = (() => {
    const params = new URLSearchParams();
    params.set('vehicle', vehicle.id);
    if (vehicle.reserved_customer_id) params.set('customer', vehicle.reserved_customer_id);
    return `/admin/invoices/new?${params.toString()}`;
  })();
  const creditNoteHref = (() => {
    const params = new URLSearchParams();
    params.set('vehicle', vehicle.id);
    if (vehicle.reserved_customer_id) params.set('customer', vehicle.reserved_customer_id);
    params.set('reference', 'Credit note');
    return `/admin/invoices/new?${params.toString()}`;
  })();

  return (
    <div
      className={cn(
        'grid gap-3 rounded-lg border bg-card p-3 shadow-sm sm:grid-cols-[auto_7rem_minmax(0,1fr)_auto] lg:grid-cols-[auto_7rem_minmax(12rem,1.3fr)_minmax(8rem,0.9fr)_minmax(9rem,1fr)_minmax(10rem,1.1fr)]',
        selected && 'border-accent/60 ring-1 ring-accent/30'
      )}
    >
      {onSelectedChange ? (
        <div className="flex items-start pt-1">
          <Checkbox
            checked={selected}
            disabled={!selectable}
            onCheckedChange={(value) => onSelectedChange(value === true)}
            aria-label={
              selectable
                ? `Select ${vehicle.title} for bulk reserve`
                : 'Only available stock can be bulk-reserved'
            }
          />
        </div>
      ) : null}
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
        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="accent" aria-label={`Actions for ${vehicle.title}`}>
                Actions
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {!fieldAgent ? (
                <DropdownMenuItem asChild>
                  <Link href={`/admin/vehicles/${vehicle.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit stock details
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {!fieldAgent && auctionPool && onTransferPool ? (
                <DropdownMenuItem
                  className="text-primary focus:text-primary"
                  onSelect={() => onTransferPool(vehicle, 'owned')}
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  Assign to inventory
                </DropdownMenuItem>
              ) : null}
              {!fieldAgent && !auctionPool && onTransferPool ? (
                <DropdownMenuItem onSelect={() => onTransferPool(vehicle, 'auction_third_party')}>
                  <Gavel className="h-3.5 w-3.5" />
                  Assign to auction stock
                </DropdownMenuItem>
              ) : null}
              {isReserved || isSold ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={invoiceHref}>
                      <FileText className="h-3.5 w-3.5" />
                      Generate Invoice
                    </Link>
                  </DropdownMenuItem>
                  {isSold && onClaimCommission ? (
                    <DropdownMenuItem onSelect={() => onClaimCommission(vehicle)}>
                      <Banknote className="h-3.5 w-3.5" />
                      Claim commission
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem disabled>
                      <Banknote className="h-3.5 w-3.5" />
                      Record Commission Payment
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href={creditNoteHref}>
                      <ReceiptText className="h-3.5 w-3.5" />
                      Credit note
                    </Link>
                  </DropdownMenuItem>
                  {!fieldAgent ? (
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/vehicles/${vehicle.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                        Fix profit data
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
              {!fieldAgent ? (
                <DropdownMenuItem asChild>
                  <Link href={`/admin/vehicles/${vehicle.id}`}>
                    <Eye className="h-3.5 w-3.5" />
                    View stock details
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href={`/vehicles/${vehicle.slug}`} target="_blank">
                  <Eye className="h-3.5 w-3.5" />
                  View public listing
                </Link>
              </DropdownMenuItem>
              {canReserve ? (
                <DropdownMenuItem asChild>
                  <Link href={`/admin/reservations?vehicle=${vehicle.id}`}>Reserve vehicle</Link>
                </DropdownMenuItem>
              ) : null}
              {!fieldAgent && onSetListing ? (
                <DropdownMenuItem onSelect={() => onSetListing(vehicle, !vehicle.is_published)}>
                  {vehicle.is_published ? 'Unpublish' : 'Publish'}
                </DropdownMenuItem>
              ) : null}
              {isReserved || isSold ? (
                <>
                  <DropdownMenuSeparator />
                  {onMakeAvailable ? (
                    <DropdownMenuItem
                      className="text-pink-600 focus:text-pink-700 dark:text-pink-400 dark:focus:text-pink-300"
                      onSelect={() => onMakeAvailable(vehicle)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Make Available
                    </DropdownMenuItem>
                  ) : null}
                  {isReserved && !fieldAgent && onChangeRequester ? (
                    <DropdownMenuItem
                      className="text-violet-600 focus:text-violet-700 dark:text-violet-400 dark:focus:text-violet-300"
                      onSelect={() => onChangeRequester(vehicle)}
                    >
                      <UserRound className="h-3.5 w-3.5" />
                      Change Requester
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
              {!fieldAgent ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/vehicles/${vehicle.id}#photos`}>
                      <ImageMinus className="h-3.5 w-3.5" />
                      Manage images
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => onDelete?.(vehicle)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
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

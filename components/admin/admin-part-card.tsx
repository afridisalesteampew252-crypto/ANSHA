'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { Eye, MessageCircle, Pencil, Trash2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StockOriginBadge } from '@/components/public/stock-origin-badge';
import { conditionLabels } from '@/lib/site-config';
import type { PartWithRelations, StockStatus } from '@/lib/types';

const statusClass: Record<StockStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  reserved: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sold: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
};

type Props = {
  part: PartWithRelations;
  fieldAgent: boolean;
  onUpdate?: (id: string, changes: Record<string, unknown>) => void;
  onDelete?: (part: PartWithRelations) => void;
  stockOriginOptions?: ReadonlyArray<{ value: string; label: string }>;
};

export function AdminPartCard({ part, fieldAgent, onUpdate, onDelete, stockOriginOptions }: Props) {
  const cover = part.part_photos?.find((photo) => photo.is_cover) || part.part_photos?.[0];
  const photoUrl = cover
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/part-images/${cover.storage_path}`
    : '';
  const status = part.stock_status || 'available';
  const canReserve = status === 'available';

  if (fieldAgent) {
    return (
      <Card className="overflow-hidden border-border/80">
        <CardContent className="p-0">
          <div className="flex gap-4 p-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-secondary">
              {photoUrl ? (
                <img src={photoUrl} alt={part.name} className="h-full w-full object-contain p-1" />
              ) : (
                <span className="grid h-full place-items-center">
                  <Wrench className="h-6 w-6 text-muted-foreground/30" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusClass[status]}>{status}</Badge>
                <span className="inline-flex">
                  <StockOriginBadge origin={part.stock_origin} compact />
                </span>
              </div>
              <h2 className="mt-2 truncate text-base font-bold tracking-tight">{part.name}</h2>
              <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-foreground/70">Code</dt>
                  <dd className="font-mono truncate">{part.part_code}</dd>
                </div>
                {(part.oem_number || part.part_number) && (
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold text-foreground/70">OEM / PN</dt>
                    <dd className="truncate">{part.oem_number || part.part_number}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-foreground/70">Condition</dt>
                  <dd>
                    {conditionLabels[part.condition]} · Qty {part.quantity}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border/70 bg-secondary/40 px-3 py-2.5">
            {canReserve ? (
              <Button asChild size="sm" variant="accent" className="gap-1.5">
                <Link href={`/admin/chat?topic=part-hold&part=${encodeURIComponent(part.part_code)}`}>
                  <MessageCircle className="h-4 w-4" />
                  Ask team to hold
                </Link>
              </Button>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">
                {status === 'reserved' ? 'On hold / reserved' : 'Not available'}
              </span>
            )}
            <Button asChild variant="ghost" size="icon" className="ml-auto" aria-label="View public listing">
              <Link href={`/parts/${part.slug}`} target="_blank">
                <Eye className="h-4 w-4" />
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
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary">
            {photoUrl ? (
              <img src={photoUrl} alt={part.name} className="h-full w-full object-contain p-1" />
            ) : (
              <span className="grid h-full place-items-center">
                <Wrench className="h-6 w-6 text-muted-foreground/30" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge className={statusClass[status]}>{status}</Badge>
              {part.is_published ? <Badge variant="outline">Public</Badge> : <Badge variant="secondary">Draft</Badge>}
            </div>
            <h2 className="mt-2 truncate font-bold">{part.name}</h2>
            <p className="font-mono text-xs text-muted-foreground">{part.part_code}</p>
            <p className="mt-1 text-xs">
              {conditionLabels[part.condition]} · Qty {part.quantity} ·{' '}
              <span className="inline-flex align-middle">
                <StockOriginBadge origin={part.stock_origin} compact />
              </span>
            </p>
          </div>
        </div>
        <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted-foreground">
            Stock location
            <select
              value={part.stock_origin || 'dubai'}
              onChange={(event) => onUpdate?.(part.id, { stock_origin: event.target.value })}
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
              onChange={(event) => onUpdate?.(part.id, { stock_status: event.target.value })}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="sold">Sold</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2 border-t p-3">
          <Button variant="outline" size="sm" onClick={() => onUpdate?.(part.id, { is_published: !part.is_published })}>
            {part.is_published ? 'Unpublish' : 'Publish'}
          </Button>
          <Button asChild variant="ghost" size="icon">
            <Link href={`/parts/${part.slug}`} target="_blank">
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon">
            <Link href={`/admin/parts/${part.id}`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto text-destructive"
            onClick={() => onDelete?.(part)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

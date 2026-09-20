'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';
import { BookmarkCheck, Loader2, Package, Car } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { publicPartImageUrl, publicVehicleImageUrl } from '@/components/public/catalog-image';
import { PRICE_TERM_LABELS, SHIPMENT_MODE_LABELS, type PriceTerm, type ShipmentMode } from '@/lib/trade-terms';
import { supabase } from '@/lib/supabase/client';

type RelatedInvoice = {
  id: string;
  invoice_number: string;
  document_type: string;
  status: string;
  issue_date: string;
  currency: string;
  total_amount: number;
  balance_due: number;
  price_term: string | null;
  shipment_term: string | null;
};

type ReservationItem = {
  id: string;
  kind: 'vehicle' | 'part';
  title: string;
  slug: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  stock_number?: string | null;
  chassis_number?: string | null;
  part_code?: string | null;
  brand?: string | null;
  part_number?: string | null;
  stock_status: string;
  stock_origin: string | null;
  location: string | null;
  quantity?: number | null;
  price: number | null;
  currency: string;
  reservation_price_term: string | null;
  reservation_shipment_term: string | null;
  reservation_inspection_required: boolean | null;
  reservation_vat_applicable: boolean | null;
  reservation_etd: string | null;
  reservation_eta: string | null;
  updated_at: string;
  sort_rank: number;
  cover_path: string | null;
  invoices: RelatedInvoice[];
};

type ReservationsPayload = {
  vehicles: ReservationItem[];
  parts: ReservationItem[];
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function termLabel(priceTerm: string | null, shipmentTerm: string | null) {
  const bits: string[] = [];
  if (priceTerm && priceTerm in PRICE_TERM_LABELS) {
    bits.push(PRICE_TERM_LABELS[priceTerm as PriceTerm]);
  }
  if (shipmentTerm && shipmentTerm in SHIPMENT_MODE_LABELS) {
    bits.push(SHIPMENT_MODE_LABELS[shipmentTerm as ShipmentMode]);
  }
  return bits.length ? bits.join(' · ') : null;
}

function statusBadge(status: string) {
  if (status === 'reserved') return <Badge className="bg-amber-600/90 text-white hover:bg-amber-600/90">Reserved</Badge>;
  if (status === 'sold') return <Badge variant="outline" className="capitalize">Sold</Badge>;
  return <Badge variant="outline" className="capitalize">{status.replaceAll('_', ' ')}</Badge>;
}

function ReservationCard({ item }: { item: ReservationItem }) {
  const photoUrl = item.cover_path
    ? item.kind === 'vehicle'
      ? publicVehicleImageUrl(item.cover_path)
      : publicPartImageUrl(item.cover_path)
    : null;
  const terms = termLabel(item.reservation_price_term, item.reservation_shipment_term);
  const subtitle =
    item.kind === 'vehicle'
      ? [item.year, item.make, item.model, item.stock_number ? `#${item.stock_number}` : null].filter(Boolean).join(' · ')
      : [item.brand, item.part_code || item.part_number].filter(Boolean).join(' · ');
  const openInvoice = item.invoices.find((inv) => Number(inv.balance_due) > 0) || item.invoices[0];

  return (
    <li className="rounded-xl border bg-card p-4 transition hover:border-accent/40 hover:shadow-sm">
      <div className="flex gap-4">
        <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-secondary/60">
          {photoUrl ? (
            <Image src={photoUrl} alt={item.title} fill sizes="112px" className="object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground/40">
              {item.kind === 'vehicle' ? <Car className="h-7 w-7" /> : <Package className="h-7 w-7" />}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-base">{item.title}</strong>
            {statusBadge(item.stock_status)}
            <Badge variant="outline" className="capitalize">
              {item.kind}
            </Badge>
          </div>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {item.price != null ? <span>{money(item.price, item.currency || 'AED')}</span> : null}
            {terms ? <span className="text-muted-foreground">{terms}</span> : null}
            {item.location ? <span className="text-muted-foreground">{item.location}</span> : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {item.reservation_etd ? <span>ETD {format(new Date(item.reservation_etd), 'dd MMM yyyy')}</span> : null}
            {item.reservation_eta ? <span>ETA {format(new Date(item.reservation_eta), 'dd MMM yyyy')}</span> : null}
            <span>Updated {format(new Date(item.updated_at), 'dd MMM yyyy')}</span>
            {item.reservation_inspection_required != null ? (
              <span>Inspection {item.reservation_inspection_required ? 'required' : 'not required'}</span>
            ) : null}
          </div>
          {item.invoices.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
              <span className="text-muted-foreground">Documents:</span>
              {item.invoices.slice(0, 3).map((inv) => (
                <Link
                  key={inv.id}
                  href={`/portal/invoices/${inv.id}`}
                  className="font-mono text-primary hover:underline"
                >
                  {inv.invoice_number}
                  <span className="ml-1 font-sans text-xs capitalize text-muted-foreground">
                    ({inv.document_type.replaceAll('_', ' ')})
                  </span>
                </Link>
              ))}
              {openInvoice && Number(openInvoice.balance_due) > 0 ? (
                <span className="text-xs font-medium">Balance {money(openInvoice.balance_due, openInvoice.currency)}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function PortalReservationsInner() {
  const [payload, setPayload] = useState<ReservationsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_my_reservations');
    if (error) {
      toast.error(error.message);
      setPayload(null);
    } else {
      const raw = (data || { vehicles: [], parts: [] }) as ReservationsPayload;
      setPayload({
        vehicles: (raw.vehicles || []).map((row) => ({ ...row, kind: 'vehicle', invoices: row.invoices || [] })),
        parts: (raw.parts || []).map((row) => ({ ...row, kind: 'part', invoices: row.invoices || [] })),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => {
    const vehicles = payload?.vehicles || [];
    const parts = payload?.parts || [];
    return [...vehicles, ...parts].sort((a, b) => {
      if (a.sort_rank !== b.sort_rank) return a.sort_rank - b.sort_rank;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [payload]);

  const reservedCount = items.filter((row) => row.stock_status === 'reserved').length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your reservations</h1>
        <p className="text-sm text-muted-foreground">
          Stock reserved in your name, plus linked proformas and open invoices when available.
          {reservedCount > 0 ? ` ${reservedCount} active reservation${reservedCount === 1 ? '' : 's'}.` : ''}
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <BookmarkCheck className="h-10 w-10 text-muted-foreground/30" />
            <p className="font-medium">No reservations yet</p>
            <p className="text-sm text-muted-foreground">
              When ANSHA reserves a vehicle or part for you, it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <ReservationCard key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PortalReservationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <PortalReservationsInner />
    </Suspense>
  );
}

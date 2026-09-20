/**
 * Stock operations dual-status model (Phase 62).
 * Stock/payment status × shipment status — matches reference inventory dashboard.
 */

import type { ExportShipmentStatusLike, InvoicePaymentStatusLike } from '@/lib/vehicle-sales-status';
import { exportShipmentStatusLabel } from '@/lib/vehicle-sales-status';

export {
  exportShipmentStatusLabel,
  type ExportShipmentStatusLike,
  type InvoicePaymentStatusLike,
};

/** Commercial / payment-facing stock status (list column 1). */
export const STOCK_PAYMENT_STATUSES = [
  'available',
  'reserved',
  'partial_paid',
  'paid',
  'unpaid',
  'sold',
] as const;

export type StockPaymentStatus = (typeof STOCK_PAYMENT_STATUSES)[number];

export const STOCK_PAYMENT_STATUS_LABELS: Record<StockPaymentStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  partial_paid: 'Partial Paid',
  paid: 'Paid',
  unpaid: 'Unpaid',
  sold: 'Sold',
};

/** Logistics shipment status (list column 2). */
export const SHIPMENT_VIEW_STATUSES = ['not_booked', 'booked', 'shipped', 'delivered'] as const;
export type ShipmentViewStatus = (typeof SHIPMENT_VIEW_STATUSES)[number];

export const SHIPMENT_VIEW_STATUS_LABELS: Record<ShipmentViewStatus, string> = {
  not_booked: 'Not Booked',
  booked: 'Booked',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

export function deriveShipmentViewStatus(
  shipmentStatus: ExportShipmentStatusLike
): ShipmentViewStatus {
  switch (shipmentStatus) {
    case 'booked':
    case 'loaded':
      return 'booked';
    case 'sailed':
      return 'shipped';
    case 'arrived':
    case 'completed':
      return 'delivered';
    case 'draft':
    case 'cancelled':
    case null:
    case undefined:
    default:
      return 'not_booked';
  }
}

export function deriveStockPaymentStatus(input: {
  stockStatus: string | null | undefined;
  invoiceStatus?: InvoicePaymentStatusLike;
}): StockPaymentStatus {
  const inv = input.invoiceStatus || null;
  if (inv === 'paid') return 'paid';
  if (inv === 'partially_paid') return 'partial_paid';

  const stock = input.stockStatus || 'available';
  if (stock === 'sold') {
    // Sold commercially but invoice not paid / none linked
    if (inv && inv !== 'paid' && inv !== 'cancelled') return 'unpaid';
    return 'sold';
  }
  if (stock === 'reserved') return 'reserved';
  return 'available';
}

export function daysBetween(fromIso: string | null | undefined, to = new Date()): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

export function avgDays(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export type StockOpsRow = {
  id: string;
  title: string;
  slug: string;
  make: string;
  model: string;
  year: number | null;
  stock_number: string | null;
  chassis_number: string | null;
  chassis_code: string | null;
  fuel_type: string | null;
  transmission: string | null;
  color: string | null;
  location: string | null;
  stock_origin: string | null;
  stock_status: string;
  price: number | null;
  price_fob: number | null;
  price_cf: number | null;
  price_cif: number | null;
  currency: string;
  purchase_price: number | null;
  purchase_currency: string | null;
  purchase_date: string | null;
  landed_cost: number | null;
  reserved_by: string | null;
  reserved_customer_id: string | null;
  reservation_requester_name: string | null;
  reservation_requester_role: string | null;
  reservation_etd: string | null;
  reservation_eta: string | null;
  reservation_vat_applicable: boolean | null;
  reservation_price_term: string | null;
  reservation_shipment_term: string | null;
  created_at: string;
  sold_at: string | null;
  cover_path: string | null;
  // enrichment
  agent_name: string | null;
  customer_name: string | null;
  customer_country: string | null;
  invoice_id: string | null;
  invoice_status: string | null;
  invoice_total: number | null;
  invoice_balance: number | null;
  invoice_currency: string | null;
  shipment_id: string | null;
  shipment_number: string | null;
  shipment_status: string | null;
  shipment_mode: string | null;
  destination_country: string | null;
  destination_port: string | null;
  loading_port: string | null;
  vessel_name: string | null;
  voyage_no: string | null;
  bl_number: string | null;
  booking_ref: string | null;
  etd: string | null;
  eta: string | null;
  has_bl: boolean;
  has_waybill: boolean;
  has_surrendered: boolean;
  has_export_cert: boolean;
  has_inspection: boolean;
  stock_payment: StockPaymentStatus;
  shipment_view: ShipmentViewStatus;
  aging_days: number | null;
};

export type ArrivalHoldingReason = 'release_pending' | 'payment_pending' | 'delivered_unpaid';

export const ARRIVAL_HOLDING_LABELS: Record<ArrivalHoldingReason, string> = {
  release_pending: 'Release pending',
  payment_pending: 'Payment pending',
  delivered_unpaid: 'Delivered but unpaid',
};

/**
 * Arrival Watch: still open if not (PAID + DELIVERED).
 * Holding reasons aligned with reference screen.
 */
export function arrivalHoldingReason(row: Pick<StockOpsRow, 'stock_payment' | 'shipment_view' | 'has_surrendered'>): ArrivalHoldingReason | null {
  const paid = row.stock_payment === 'paid';
  const delivered = row.shipment_view === 'delivered';
  if (paid && delivered) return null;

  if (delivered && !paid) return 'delivered_unpaid';
  if (paid && delivered === false) {
    // Paid & arrived-ish but docs / release incomplete
    if (row.shipment_view === 'shipped' || row.shipment_view === 'delivered') {
      return row.has_surrendered ? 'payment_pending' : 'release_pending';
    }
    return 'release_pending';
  }
  if (!paid && (row.shipment_view === 'shipped' || row.shipment_view === 'delivered' || row.shipment_view === 'booked')) {
    return 'payment_pending';
  }
  return null;
}

export function isArrivalWatchCandidate(row: StockOpsRow, now = new Date()): boolean {
  if (row.stock_payment === 'paid' && row.shipment_view === 'delivered') return false;
  const eta = row.eta || row.reservation_eta;
  if (!eta) {
    // Include shipped/delivered unpaid without ETA
    return row.shipment_view === 'shipped' || row.shipment_view === 'delivered' || row.shipment_view === 'booked';
  }
  const etaDate = new Date(eta);
  if (Number.isNaN(etaDate.getTime())) return false;
  // Within next 7 days or already past ETA, and still open
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 7);
  return etaDate <= horizon;
}

export type SummaryBucketKey =
  | 'available_not_booked'
  | 'available_booked'
  | 'available_delivered'
  | 'reserved_booked'
  | 'partial_paid_booked'
  | 'available_booked_cross'
  | 'paid_booked'
  | 'paid_shipped'
  | 'partial_paid_shipped'
  | 'reserved_shipped'
  | 'paid_delivered'
  | 'unpaid_delivered'
  | 'partial_paid_delivered'
  | 'reserved_delivered';

export function summaryBucket(row: StockOpsRow): SummaryBucketKey | null {
  const p = row.stock_payment;
  const s = row.shipment_view;

  if (s === 'not_booked' && p === 'available') return 'available_not_booked';
  if (s === 'booked' && p === 'available') return 'available_booked';
  if (s === 'delivered' && p === 'available') return 'available_delivered';

  if (s === 'booked' && p === 'reserved') return 'reserved_booked';
  if (s === 'booked' && p === 'partial_paid') return 'partial_paid_booked';
  if (s === 'booked' && p === 'paid') return 'paid_booked';

  if (s === 'shipped' && p === 'paid') return 'paid_shipped';
  if (s === 'shipped' && p === 'partial_paid') return 'partial_paid_shipped';
  if (s === 'shipped' && p === 'reserved') return 'reserved_shipped';

  if (s === 'delivered' && p === 'paid') return 'paid_delivered';
  if (s === 'delivered' && (p === 'unpaid' || p === 'sold')) return 'unpaid_delivered';
  if (s === 'delivered' && p === 'partial_paid') return 'partial_paid_delivered';
  if (s === 'delivered' && p === 'reserved') return 'reserved_delivered';

  return null;
}

export const SUMMARY_COLUMN_META = {
  available: {
    title: 'Available status',
    action: 'Review and book',
    color: 'orange' as const,
    keys: ['available_not_booked', 'available_delivered', 'available_booked'] as SummaryBucketKey[],
    labels: {
      available_not_booked: 'Available + Not Booked',
      available_delivered: 'Available + Delivered',
      available_booked: 'Available + Booked',
    } as Partial<Record<SummaryBucketKey, string>>,
    agingHint: 'days in stock',
  },
  booked: {
    title: 'Booked status',
    action: 'Review and allocate',
    color: 'blue' as const,
    keys: ['reserved_booked', 'partial_paid_booked', 'available_booked', 'paid_booked'] as SummaryBucketKey[],
    labels: {
      reserved_booked: 'Reserved + Booked',
      partial_paid_booked: 'Partial Paid + Booked',
      available_booked: 'Available + Booked',
      paid_booked: 'Paid + Booked',
    } as Partial<Record<SummaryBucketKey, string>>,
    agingHint: 'days stuck',
  },
  shipped: {
    title: 'Shipped status',
    action: 'Monitor arrival',
    color: 'green' as const,
    keys: ['paid_shipped', 'partial_paid_shipped', 'reserved_shipped'] as SummaryBucketKey[],
    labels: {
      paid_shipped: 'Paid + Shipped',
      partial_paid_shipped: 'Partial Paid + Shipped',
      reserved_shipped: 'Reserved + Shipped',
    } as Partial<Record<SummaryBucketKey, string>>,
    agingHint: 'days en route',
  },
  delivered: {
    title: 'Delivered status',
    action: 'Reconciliation',
    color: 'purple' as const,
    keys: ['paid_delivered', 'unpaid_delivered', 'partial_paid_delivered', 'reserved_delivered'] as SummaryBucketKey[],
    labels: {
      paid_delivered: 'Paid + Delivered',
      unpaid_delivered: 'Unpaid + Delivered',
      partial_paid_delivered: 'Partial Paid + Delivered',
      reserved_delivered: 'Reserved + Delivered',
    } as Partial<Record<SummaryBucketKey, string>>,
    agingHint: 'days ago',
  },
} as const;

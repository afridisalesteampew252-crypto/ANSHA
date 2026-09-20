/** Derived sales/fulfillment status for vehicle list filters (Phase 62). */

export const VEHICLE_SALES_STATUSES = [
  'available',
  'reserved',
  'partial_paid',
  'paid',
  'sold',
  'not_booked',
  'booked',
  'shipped',
  'delivered',
] as const;

export type VehicleSalesStatus = (typeof VEHICLE_SALES_STATUSES)[number];

export const VEHICLE_SALES_STATUS_LABELS: Record<VehicleSalesStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  partial_paid: 'Partial Paid',
  paid: 'Paid',
  sold: 'Sold',
  not_booked: 'Not Booked',
  booked: 'Booked',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

export type ExportShipmentStatusLike =
  | 'draft'
  | 'booked'
  | 'loaded'
  | 'sailed'
  | 'arrived'
  | 'completed'
  | 'cancelled'
  | string
  | null
  | undefined;

export type InvoicePaymentStatusLike =
  | 'draft'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | string
  | null
  | undefined;

/** Map export_shipments.status → user-facing shipment labels. */
export function exportShipmentStatusLabel(status: ExportShipmentStatusLike): string {
  switch (status) {
    case 'draft':
      return 'Not Booked';
    case 'booked':
    case 'loaded':
      return 'Booked';
    case 'sailed':
      return 'Shipped';
    case 'arrived':
    case 'completed':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status || '—';
  }
}

/**
 * Resolve the primary filter/display status for a vehicle.
 * Priority: delivered > shipped > booked > paid > partial_paid > sold > reserved > available,
 * with not_booked only when an export shipment exists in draft.
 */
export function deriveVehicleSalesStatus(input: {
  stockStatus: string | null | undefined;
  invoiceStatus?: InvoicePaymentStatusLike;
  shipmentStatus?: ExportShipmentStatusLike;
}): VehicleSalesStatus {
  const stock = input.stockStatus || 'available';
  const ship = input.shipmentStatus || null;
  const inv = input.invoiceStatus || null;

  if (ship === 'arrived' || ship === 'completed') return 'delivered';
  if (ship === 'sailed') return 'shipped';
  if (ship === 'booked' || ship === 'loaded') return 'booked';

  if (inv === 'paid') return 'paid';
  if (inv === 'partially_paid') return 'partial_paid';

  if (stock === 'sold') return 'sold';
  if (stock === 'reserved') {
    if (ship === 'draft') return 'not_booked';
    return 'reserved';
  }

  if (ship === 'draft') return 'not_booked';
  return 'available';
}

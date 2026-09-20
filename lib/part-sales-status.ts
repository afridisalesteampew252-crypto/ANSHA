/**
 * Derived sales/fulfillment status for parts catalog list (Phase 63).
 * Same priority model as vehicles.
 */

import {
  deriveVehicleSalesStatus,
  VEHICLE_SALES_STATUS_LABELS,
  VEHICLE_SALES_STATUSES,
  type ExportShipmentStatusLike,
  type InvoicePaymentStatusLike,
  type VehicleSalesStatus,
} from '@/lib/vehicle-sales-status';

export const PART_SALES_STATUSES = VEHICLE_SALES_STATUSES;
export type PartSalesStatus = VehicleSalesStatus;
export const PART_SALES_STATUS_LABELS = VEHICLE_SALES_STATUS_LABELS;

export function derivePartSalesStatus(input: {
  stockStatus: string | null | undefined;
  invoiceStatus?: InvoicePaymentStatusLike;
  shipmentStatus?: ExportShipmentStatusLike;
}): PartSalesStatus {
  return deriveVehicleSalesStatus(input);
}

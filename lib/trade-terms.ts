/** Shared Incoterm / shipment-mode labels used by catalog, reservations, and exports. */

export const PRICE_TERMS = ['fob', 'cf', 'cif'] as const;
export type PriceTerm = (typeof PRICE_TERMS)[number];

export const PRICE_TERM_LABELS: Record<PriceTerm, string> = {
  fob: 'FOB',
  cf: 'C&F',
  cif: 'CIF',
};

export const SHIPMENT_MODES = ['dhl', 'roro', 'container_20ft', 'container_40ft'] as const;
export type ShipmentMode = (typeof SHIPMENT_MODES)[number];

export const SHIPMENT_MODE_LABELS: Record<ShipmentMode, string> = {
  dhl: 'DHL (small parts)',
  roro: 'RoRo',
  container_20ft: '20 feet container',
  container_40ft: '40 feet container',
};

export const EXPORT_DOC_TYPES = [
  'bill_of_lading',
  'export_certificate',
  'waybill',
  'courier',
  'inspection_certificate',
  'surrendered_bl',
] as const;
export type ExportDocType = (typeof EXPORT_DOC_TYPES)[number];

export const EXPORT_DOC_LABELS: Record<ExportDocType, string> = {
  bill_of_lading: 'Bill of Lading',
  export_certificate: 'Export Certificate',
  waybill: 'Waybill',
  courier: 'Courier Document',
  inspection_certificate: 'Inspection certificate',
  surrendered_bl: 'Surrendered BL',
};

/** Single-slot shipping docs (one file each). Inspection certs are multi + country. */
export const SINGLE_SLOT_EXPORT_DOCS: ExportDocType[] = [
  'bill_of_lading',
  'export_certificate',
  'waybill',
  'courier',
  'surrendered_bl',
];

/** Yes/No UI for VAT on reservations / invoices. */
export type VatChoice = 'yes' | 'no';

export function vatChoiceToBool(value: VatChoice | ''): boolean | null {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

export function boolToVatChoice(value: boolean | null | undefined): VatChoice | '' {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '';
}

export function vatApplicableLabel(value: boolean | null | undefined): string {
  if (value == null) return '—';
  return value ? 'Yes' : 'No';
}

export const REQUESTER_ROLES = ['sales', 'manager', 'admin'] as const;
export type RequesterRole = (typeof REQUESTER_ROLES)[number];

export const REQUESTER_ROLE_LABELS: Record<RequesterRole, string> = {
  sales: 'Sales',
  manager: 'Manager',
  admin: 'Admin',
};

export function isPriceTerm(value: string | null | undefined): value is PriceTerm {
  return !!value && (PRICE_TERMS as readonly string[]).includes(value);
}

export function isShipmentMode(value: string | null | undefined): value is ShipmentMode {
  return !!value && (SHIPMENT_MODES as readonly string[]).includes(value);
}

/** Yes/No UI value for reservation inspection required. */
export type InspectionChoice = 'yes' | 'no';

export function inspectionRequiredLabel(value: boolean | null | undefined): string {
  if (value == null) return '—';
  return value ? 'Yes' : 'No';
}

export function inspectionChoiceToBool(value: InspectionChoice | ''): boolean | null {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

export function boolToInspectionChoice(value: boolean | null | undefined): InspectionChoice | '' {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '';
}

export function priceForTerm(
  term: PriceTerm | null | undefined,
  prices: { price?: number | null; price_fob?: number | null; price_cf?: number | null; price_cif?: number | null }
): number | null {
  if (!term) return prices.price ?? null;
  if (term === 'fob') return prices.price_fob ?? prices.price ?? null;
  if (term === 'cf') return prices.price_cf ?? null;
  return prices.price_cif ?? null;
}

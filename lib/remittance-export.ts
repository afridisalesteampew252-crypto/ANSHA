/**
 * Remittance list → Excel export column catalog and row mapping.
 * Fields without a real DB source stay blank (see comments on blank keys).
 */

export const REMITTANCE_EXPORT_COLUMNS = [
  { key: 'remittance_id', label: 'Remittance ID' },
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'stock_id', label: 'Stock ID' },
  { key: 'chassis_no', label: 'Chassis No.' },
  { key: 'currency', label: 'Currency' },
  { key: 'bank', label: 'Bank' },
  { key: 'bank_address', label: 'Bank Address' },
  { key: 'bank_phone', label: 'Bank Phone' },
  { key: 'bank_account', label: 'Bank Account' },
  { key: 'bank_reference', label: 'Bank Reference' },
  { key: 'exchange_rate', label: 'Exchange Rate' },
  { key: 'source_currency', label: 'Source Currency' },
  { key: 'instructed_amount', label: 'Instructed Amount' },
  { key: 'remit_amount', label: 'Remit Amount' },
  { key: 'balance', label: 'Balance' },
  { key: 'remaining_allocation_amount', label: 'Remaining Allocation Amount' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'remitter', label: 'Remitter' },
  { key: 'remitter_message', label: 'Remitter Message' },
  { key: 'through', label: 'Through' },
  { key: 'beneficiary', label: 'Beneficiary' },
  { key: 'beneficiary_reference', label: 'Beneficiary Reference' },
  { key: 'requester_name', label: 'Requester Name' },
  { key: 'office_name', label: 'Office Name' },
  { key: 'country_name', label: 'Country Name' },
  { key: 'status', label: 'Status' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'received_date', label: 'Received Date' },
  { key: 'remit_date', label: 'Remit Date' },
  { key: 'partially_allocated_at', label: 'Partially Allocated At' },
  { key: 'fully_allocated_at', label: 'Fully Allocated At' },
  { key: 'created_date', label: 'Created Date' },
] as const;

export type RemittanceExportColumnKey = (typeof REMITTANCE_EXPORT_COLUMNS)[number]['key'];

export type RemittanceExportSource = {
  remittance_number: string;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string;
  customer_country: string | null;
  currency: string;
  source_currency?: string | null;
  source_amount?: number | null;
  exchange_rate?: number | null;
  sender_bank: string | null;
  receiving_bank: string | null;
  bank_reference: string | null;
  amount: number;
  allocated: number;
  method: string;
  status: string;
  is_unknown: boolean;
  notes: string | null;
  received_date: string;
  created_at: string;
  requester_name: string | null;
  office_name: string | null;
  /** vehicles.stock_number / invoice inventory_reference, comma-joined when multiple */
  stock_id: string | null;
  chassis_no: string | null;
  /** Earliest allocation created_at when partially allocated */
  partially_allocated_at: string | null;
  /** Latest allocation created_at when fully allocated */
  fully_allocated_at: string | null;
};

export function defaultRemittanceExportSelection(): Record<RemittanceExportColumnKey, boolean> {
  return Object.fromEntries(
    REMITTANCE_EXPORT_COLUMNS.map((col) => [col.key, true])
  ) as Record<RemittanceExportColumnKey, boolean>;
}

function statusLabel(status: string, isUnknown: boolean): string {
  if (status === 'unknown' || isUnknown) return 'Unconfirmed';
  return status;
}

function methodLabel(method: string): string {
  return method.replaceAll('_', ' ');
}

/** Build one export row; blank keys have no matching remittance column yet. */
export function buildRemittanceExportRow(
  src: RemittanceExportSource
): Record<RemittanceExportColumnKey, string | number | null> {
  const remaining = Math.max(0, Number(src.amount) - Number(src.allocated || 0));
  return {
    remittance_id: src.remittance_number,
    customer_id: src.customer_code || src.customer_id || null,
    stock_id: src.stock_id,
    chassis_no: src.chassis_no,
    currency: src.currency,
    bank: src.sender_bank,
    // No bank address / phone / account columns on remittances yet.
    bank_address: null,
    bank_phone: null,
    bank_account: null,
    bank_reference: src.bank_reference,
    exchange_rate: src.exchange_rate ?? null,
    source_currency: src.source_currency ?? null,
    instructed_amount: src.source_amount ?? null,
    remit_amount: Number(src.amount),
    balance: remaining,
    remaining_allocation_amount: remaining,
    customer_name: src.customer_name,
    // No dedicated remitter / remitter-message / beneficiary-reference columns yet.
    remitter: null,
    remitter_message: null,
    through: methodLabel(src.method),
    beneficiary: src.receiving_bank,
    beneficiary_reference: null,
    requester_name: src.requester_name,
    office_name: src.office_name,
    country_name: src.customer_country,
    status: statusLabel(src.status, src.is_unknown),
    remarks: src.notes,
    received_date: src.received_date,
    // No separate remit_date; received_date is the recorded receipt day.
    remit_date: null,
    partially_allocated_at: src.partially_allocated_at,
    fully_allocated_at: src.fully_allocated_at,
    created_date: src.created_at ? src.created_at.slice(0, 19).replace('T', ' ') : null,
  };
}

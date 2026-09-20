/** Shared helpers for admin invoice delete / remittance unallocate flows. */

export function needsUnallocateBeforeDelete(message: string | null | undefined): boolean {
  if (!message) return false;
  return /unallocate/i.test(message) || /remittance allocation/i.test(message);
}

export const INVOICE_DELETE_CONFIRM =
  'Delete this invoice permanently? Linked reserved/sold stock will return to available. Invoices with remittance allocations must be unallocated first.';

export const INVOICE_UNALLOCATE_DELETE_CONFIRM =
  'Unallocate remittance payments on this invoice (funds return to the remittance pool), then permanently delete it? Linked reserved/sold stock will return to available.';

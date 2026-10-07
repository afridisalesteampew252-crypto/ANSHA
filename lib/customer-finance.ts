import type { SoaPaymentRow, SoaRemittanceRow } from '@/lib/soa/ledger';

export type CustomerFinanceHistory = {
  payments: SoaPaymentRow[];
  remittances: SoaRemittanceRow[];
};

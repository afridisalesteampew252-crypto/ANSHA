import { normalizeCurrency, sortCurrencyEntries } from '@/lib/money';

export type SoaInvoiceRow = {
  id: string;
  invoice_number: string;
  document_type: string;
  issue_date: string;
  currency: string;
  status: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
};

export type SoaRemittanceRow = {
  id: string;
  remittance_number: string;
  received_date: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  bank_reference: string | null;
  source_currency?: string | null;
  source_amount?: number | null;
  exchange_rate?: number | null;
};

export type SoaPaymentRow = {
  id: string;
  invoice_id: string;
  invoice_number: string;
  payment_date: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  remittance_id: string | null;
  remittance_number?: string | null;
};

export type SoaAllocationRow = {
  id: string;
  remittance_id: string;
  invoice_id: string;
  amount: number;
  currency?: string;
  invoice_number?: string;
};

export type SoaDateRange = { from: string; to: string };

export type SoaLedgerLine = {
  date: string;
  reference: string;
  stock: string;
  type: string;
  currency: string;
  debit: number | null;
  credit: number | null;
  balance: number;
  sortKey: string;
  kind: 'opening' | 'transaction' | 'closing';
  invoiceId?: string;
};

export function dateOnly(value: string | null | undefined): string {
  return value?.slice(0, 10) || '';
}

/** Inclusive bounds. Payment dates, rather than invoice paid totals, determine credits. */
export function inDateRange(value: string | null | undefined, range: SoaDateRange): boolean {
  const date = dateOnly(value);
  return Boolean(date && (!range.from || date >= range.from) && (!range.to || date <= range.to));
}

export function receivableDocument(type: string): boolean {
  return type === 'tax_invoice' || type === 'commercial_invoice';
}

const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

/**
 * Customer account ledger: invoices debit the account; confirmed receipts credit it.
 * Applying a TT to an invoice moves no additional money and must never credit twice.
 * Each currency has its own opening, running and closing balance (no FX averaging).
 */
export function buildSoaLedgerLines(opts: {
  invoices: SoaInvoiceRow[];
  remittances: SoaRemittanceRow[];
  payments?: SoaPaymentRow[];
  allocations?: SoaAllocationRow[];
  stockRefsByInvoice?: Record<string, string[]>;
  range: SoaDateRange;
  currency?: string;
}): SoaLedgerLine[] {
  if (opts.range.from && opts.range.to && opts.range.from > opts.range.to) return [];
  const transactions: SoaLedgerLine[] = [];
  const add = (line: Omit<SoaLedgerLine, 'kind' | 'balance'>) => {
    if (!line.date || (opts.range.to && line.date > opts.range.to)) return;
    if (opts.currency && line.currency !== normalizeCurrency(opts.currency)) return;
    transactions.push({ ...line, kind: 'transaction', balance: 0 });
  };
  const receivableIds = new Set<string>();
  for (const inv of opts.invoices) {
    if (inv.status === 'cancelled' || inv.status === 'draft' || !receivableDocument(inv.document_type)) continue;
    receivableIds.add(inv.id);
    add({
      date: dateOnly(inv.issue_date), reference: inv.invoice_number,
      stock: opts.stockRefsByInvoice?.[inv.id]?.join(', ') || '—',
      type: inv.document_type.replaceAll('_', ' '), currency: normalizeCurrency(inv.currency),
      debit: Number(inv.total_amount || 0), credit: null,
      sortKey: `${dateOnly(inv.issue_date)}|0|${inv.invoice_number}|${inv.id}`, invoiceId: inv.id,
    });
  }
  for (const rem of opts.remittances) {
    if (rem.status !== 'confirmed') continue;
    add({
      date: dateOnly(rem.received_date), reference: rem.remittance_number,
      stock: rem.bank_reference?.trim() || '—', type: `TT / remittance (${rem.method.replaceAll('_', ' ')})`,
      currency: normalizeCurrency(rem.currency), debit: null, credit: Number(rem.amount || 0),
      sortKey: `${dateOnly(rem.received_date)}|1|${rem.remittance_number}|${rem.id}`,
    });
  }
  for (const payment of opts.payments || []) {
    if (payment.remittance_id || !receivableIds.has(payment.invoice_id)) continue;
    add({
      date: dateOnly(payment.payment_date), reference: payment.reference || payment.invoice_number,
      stock: payment.invoice_number, type: `Payment (${payment.method.replaceAll('_', ' ')})`,
      currency: normalizeCurrency(payment.currency), debit: null, credit: Number(payment.amount || 0),
      sortKey: `${dateOnly(payment.payment_date)}|2|${payment.id}`, invoiceId: payment.invoice_id,
    });
  }
  transactions.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const currencies = sortCurrencyEntries(Array.from(new Set(transactions.map((line) => line.currency))).map((code) => [code, 0]));
  const lines: SoaLedgerLine[] = [];
  for (const [currency] of currencies) {
    const currencyLines = transactions.filter((line) => line.currency === currency);
    let balance = roundMoney(currencyLines.filter((line) => opts.range.from && line.date < opts.range.from)
      .reduce((sum, line) => sum + (line.debit || 0) - (line.credit || 0), 0));
    lines.push({
      date: opts.range.from || '', reference: 'Opening balance', stock: '—', type: 'Opening balance', currency,
      debit: null, credit: null, balance, sortKey: `${currency}|opening`, kind: 'opening',
    });
    for (const line of currencyLines) {
      if (!inDateRange(line.date, opts.range)) continue;
      balance = roundMoney(balance + (line.debit || 0) - (line.credit || 0));
      lines.push({ ...line, balance });
    }
    lines.push({
      date: opts.range.to || currencyLines.at(-1)?.date || '', reference: 'Closing balance', stock: '—', type: 'Closing balance', currency,
      debit: null, credit: null, balance, sortKey: `${currency}|closing`, kind: 'closing',
    });
  }
  return lines;
}

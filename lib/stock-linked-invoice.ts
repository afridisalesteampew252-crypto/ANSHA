/** Linked sales invoices for stock list rows (vehicles / parts). */

export type StockListLinkedInvoice = {
  id: string;
  invoice_number: string;
  status: string;
  created_at: string;
};

type InvoiceJoin = {
  id?: string | null;
  invoice_number?: string | null;
  status?: string | null;
  created_at?: string | null;
} | null;

function unwrapInvoice(raw: InvoiceJoin | InvoiceJoin[]): InvoiceJoin {
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function toLinked(inv: NonNullable<InvoiceJoin>): StockListLinkedInvoice | null {
  if (!inv.id || !inv.invoice_number || !inv.status) return null;
  if (inv.status === 'cancelled') return null;
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    status: inv.status,
    created_at: String(inv.created_at || ''),
  };
}

/**
 * Build vehicle_id / part_id → linked invoices (newest first, cancelled excluded, deduped).
 */
export function mapStockLinkedInvoices<T extends { invoices?: InvoiceJoin | InvoiceJoin[] }>(
  rows: T[] | null | undefined,
  stockIdOf: (row: T) => string | null | undefined
): Record<string, StockListLinkedInvoice[]> {
  const byStock: Record<string, Map<string, StockListLinkedInvoice>> = {};

  for (const row of rows || []) {
    const stockId = stockIdOf(row);
    if (!stockId) continue;
    const inv = unwrapInvoice(row.invoices ?? null);
    if (!inv) continue;
    const linked = toLinked(inv);
    if (!linked) continue;
    if (!byStock[stockId]) byStock[stockId] = new Map();
    const existing = byStock[stockId].get(linked.id);
    if (!existing || linked.created_at > existing.created_at) {
      byStock[stockId].set(linked.id, linked);
    }
  }

  const out: Record<string, StockListLinkedInvoice[]> = {};
  for (const [stockId, map] of Object.entries(byStock)) {
    out[stockId] = Array.from(map.values()).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }
  return out;
}

/** Newest non-cancelled invoice status — used by sales-status badges. */
export function primaryLinkedInvoiceStatus(
  invoices: StockListLinkedInvoice[] | undefined
): string | undefined {
  return invoices?.[0]?.status;
}

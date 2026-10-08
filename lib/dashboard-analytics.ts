import type { OpsAnalyticsSummary } from '@/lib/ops-analytics';

export function normalizeOpsAnalyticsSummary(value: unknown): OpsAnalyticsSummary | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<OpsAnalyticsSummary>;
  if (!raw.viewer || !raw.sales || !raw.stock || !raw.counts || !raw.requests) return null;

  const sales = raw.sales;
  const stock = raw.stock;
  const counts = raw.counts;
  const requests = raw.requests;
  const collections = raw.collections;
  const purchase = raw.purchase;

  return {
    from: String(raw.from || ''),
    to: String(raw.to || ''),
    viewer: {
      role: String(raw.viewer.role || 'unknown'),
      is_ops: Boolean(raw.viewer.is_ops),
      is_sales: Boolean(raw.viewer.is_sales),
    },
    sales: {
      scope: sales.scope === 'own_book' ? 'own_book' : 'company',
      document_types: Array.isArray(sales.document_types) ? sales.document_types.map(String) : [],
      totals: {
        invoice_count: Number(sales.totals?.invoice_count || 0),
        invoiced_total: Number(sales.totals?.invoiced_total || 0),
        outstanding_ar: Number(sales.totals?.outstanding_ar || 0),
        currency_focus: String(sales.totals?.currency_focus || 'AED'),
      },
      by_month: Array.isArray(sales.by_month) ? sales.by_month : [],
      by_currency: Array.isArray(sales.by_currency) ? sales.by_currency : [],
      outstanding_as_of: Array.isArray(sales.outstanding_as_of) ? sales.outstanding_as_of : [],
      outstanding_total: Number(sales.outstanding_total || 0),
    },
    collections: collections && collections.totals
      ? {
        totals: {
          remittance_count: Number(collections.totals.remittance_count || 0),
          received_total: Number(collections.totals.received_total || 0),
          currency_focus: String(collections.totals.currency_focus || 'AED'),
        },
        by_month: Array.isArray(collections.by_month) ? collections.by_month : [],
        by_currency: Array.isArray(collections.by_currency) ? collections.by_currency : [],
      }
      : null,
    stock: {
      by_status: {
        available: Number(stock.by_status?.available || 0),
        reserved: Number(stock.by_status?.reserved || 0),
        sold: Number(stock.by_status?.sold || 0),
      },
      by_origin: Array.isArray(stock.by_origin) ? stock.by_origin : [],
      parts_total: Number(stock.parts_total || 0),
      vehicles_total: Number(stock.vehicles_total || 0),
    },
    purchase: purchase && purchase.open_pos !== undefined
      ? {
        open_pos: Number(purchase.open_pos || 0),
        draft_pos: Number(purchase.draft_pos || 0),
        ordered_pos: Number(purchase.ordered_pos || 0),
        grn_in_range: Number(purchase.grn_in_range || 0),
        grn_total: Number(purchase.grn_total || 0),
      }
      : null,
    requests: {
      open: Number(requests.open || 0),
      overdue: Number(requests.overdue || 0),
      by_status: requests.by_status && typeof requests.by_status === 'object' ? requests.by_status : {},
    },
    counts: {
      customers: Number(counts.customers || 0),
      new_inquiries: Number(counts.new_inquiries || 0),
      portal_users: counts.portal_users == null ? null : Number(counts.portal_users),
    },
  };
}


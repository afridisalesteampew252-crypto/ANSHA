/** Phase 41 — `get_ops_analytics_summary` jsonb shape. */

export interface OpsAnalyticsSalesMonth {
  month_key: string;
  month_label: string;
  tax_invoice_count: number;
  commercial_invoice_count: number;
  invoice_count: number;
  invoiced_total: number;
}

export interface OpsAnalyticsSummary {
  from: string;
  to: string;
  viewer: { role: string; is_ops: boolean; is_sales: boolean };
  sales: {
    scope: 'company' | 'own_book';
    document_types: string[];
    totals: {
      invoice_count: number;
      invoiced_total: number;
      outstanding_ar: number;
      currency_focus: string;
    };
    by_month: OpsAnalyticsSalesMonth[];
    by_currency: Array<{
      currency: string;
      invoice_count: number;
      invoiced_total: number;
      outstanding_ar: number;
    }>;
    outstanding_as_of: Array<{
      currency: string;
      outstanding_ar: number;
      open_invoice_count: number;
    }>;
    outstanding_total: number;
  };
  collections: {
    totals: {
      remittance_count: number;
      received_total: number;
      currency_focus: string;
    };
    by_month: Array<{
      month_key: string;
      month_label: string;
      remittance_count: number;
      received_total: number;
    }>;
    by_currency: Array<{
      currency: string;
      remittance_count: number;
      received_total: number;
    }>;
  } | null;
  stock: {
    by_status: { available: number; reserved: number; sold: number };
    by_origin: Array<{ origin: string; count: number }>;
    parts_total: number;
    vehicles_total: number;
  };
  purchase: {
    open_pos: number;
    draft_pos: number;
    ordered_pos: number;
    grn_in_range: number;
    grn_total: number;
  } | null;
  requests: {
    open: number;
    overdue: number;
    by_status: Record<string, number>;
  };
  counts: {
    customers: number;
    new_inquiries: number;
    portal_users: number | null;
  };
}

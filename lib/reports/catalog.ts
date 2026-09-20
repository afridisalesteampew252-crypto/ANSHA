export type ReportSlug =
  | 'customer-balance-payments'
  | 'customer-sales-value-stats'
  | 'customer-registrations'
  | 'office-sales-stats'
  | 'purchase-statistics'
  | 'resource-sales-stats'
  | 'resource-sales-value-stats'
  | 'financial';

export type ReportFilterKey = 'dateRange' | 'office' | 'customer' | 'stockOrigin' | 'status' | 'documentType';

export type ReportDefinition = {
  slug: ReportSlug;
  title: string;
  shortTitle: string;
  description: string;
  caveat: string;
  filters: ReportFilterKey[];
  href: string;
};

/** Operational / sales reports (reference menu). */
export const OPERATIONAL_REPORTS: ReportDefinition[] = [
  {
    slug: 'customer-balance-payments',
    title: 'Customer Balance Payments',
    shortTitle: 'Balance payments',
    description: 'Remittances received with allocation vs invoice balances.',
    caveat:
      'Uses remittances and remittance_allocations. Invoice balance_due is the open AR on linked invoices (not a separate SOA ledger table).',
    filters: ['dateRange', 'office', 'customer', 'status'],
    href: '/admin/reports/customer-balance-payments',
  },
  {
    slug: 'customer-sales-value-stats',
    title: 'Customer Sales Value Stats',
    shortTitle: 'Sales value by customer',
    description: 'Tax and commercial invoice totals grouped by customer.',
    caveat: 'Counts tax_invoice and commercial_invoice only; excludes draft and cancelled.',
    filters: ['dateRange', 'customer', 'documentType'],
    href: '/admin/reports/customer-sales-value-stats',
  },
  {
    slug: 'customer-registrations',
    title: 'Customer Registrations',
    shortTitle: 'Registrations',
    description: 'Customers created in the selected period.',
    caveat: 'Based on customers.created_at (CRM registration), not portal login.',
    filters: ['dateRange', 'customer'],
    href: '/admin/reports/customer-registrations',
  },
  {
    slug: 'office-sales-stats',
    title: 'Office Sales Stats',
    shortTitle: 'Office sales',
    description: 'Collections attributed to remittance offices.',
    caveat:
      'Attributed via remittances.office_id. When office is blank, falls back to the receiver’s admin_profiles.office_id when available.',
    filters: ['dateRange', 'office', 'status'],
    href: '/admin/reports/office-sales-stats',
  },
  {
    slug: 'purchase-statistics',
    title: 'Purchase Statistics',
    shortTitle: 'Purchases',
    description: 'Inventory purchase cost by vehicle/part purchase date.',
    caveat:
      'Primary source is vehicles/parts purchase_date and purchase_price (accounts can read these). Purchase orders are ops-only and shown when accessible.',
    filters: ['dateRange', 'stockOrigin'],
    href: '/admin/reports/purchase-statistics',
  },
  {
    slug: 'resource-sales-stats',
    title: 'Resource Sales Stats',
    shortTitle: 'Resource sales counts',
    description: 'Sold vehicles and parts counts by make/model/class and agent.',
    caveat: 'Uses stock_status = sold and sold_at. Agent is sold_by on the stock row.',
    filters: ['dateRange', 'stockOrigin'],
    href: '/admin/reports/resource-sales-stats',
  },
  {
    slug: 'resource-sales-value-stats',
    title: 'Resource Sales Value Stats',
    shortTitle: 'Resource sales value',
    description: 'Sold stock list prices and invoice line values for linked sales.',
    caveat:
      'List value uses catalog price on sold stock. Invoice line value uses tax/commercial invoice_items when stock is linked to an invoice line.',
    filters: ['dateRange', 'stockOrigin'],
    href: '/admin/reports/resource-sales-value-stats',
  },
];

export const FINANCIAL_REPORT: ReportDefinition = {
  slug: 'financial',
  title: 'Financial statements',
  shortTitle: 'P&L / Balance sheet',
  description: 'Trial balance, profit & loss, and balance sheet from posted journals.',
  caveat: 'Driven by GL RPCs (gl_trial_balance, gl_profit_and_loss, gl_balance_sheet).',
  filters: ['dateRange'],
  href: '/admin/reports/financial',
};

export const ALL_REPORTS: ReportDefinition[] = [...OPERATIONAL_REPORTS, FINANCIAL_REPORT];

export function getReportBySlug(slug: string): ReportDefinition | undefined {
  return ALL_REPORTS.find((r) => r.slug === slug);
}

export const REPORT_SLUGS = ALL_REPORTS.map((r) => r.slug);

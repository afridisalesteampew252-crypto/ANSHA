'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ReportEmptyRow,
  ReportPageShell,
  type ReportFilterState,
} from '@/components/admin/reports/report-page-shell';
import { canManageReceivables } from '@/lib/admin-rbac';
import type { ReportDefinition } from '@/lib/reports/catalog';
import { downloadRowsAsXlsx, type ExcelColumn } from '@/lib/export-excel';
import { defaultReportFrom, defaultReportTo, reportMoney, toDateOnly } from '@/lib/reports/format';
import { stockOriginLabel } from '@/lib/stock';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, RemittanceOffice } from '@/lib/types';

type Row = Record<string, string | number | boolean | null | undefined>;

const PAGE_SIZE = 2000;

function matchesCustomer(q: string, ...fields: Array<string | null | undefined>) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => (f || '').toLowerCase().includes(needle));
}

export function OperationalReportView({ report }: { report: ReportDefinition }) {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offices, setOffices] = useState<RemittanceOffice[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<ExcelColumn[]>([]);
  const [filters, setFilters] = useState<ReportFilterState>({
    from: defaultReportFrom(),
    to: defaultReportTo(),
    officeId: '',
    customerQ: '',
    stockOrigin: '',
    status: '',
    documentType: '',
  });

  const finance = canManageReceivables(role);

  useEffect(() => {
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setAuthChecked(true);
        return;
      }
      const { data: prof } = await supabase
        .from('admin_profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      setRole((prof?.role as AdminRole) || null);
      setAuthChecked(true);
    })();
  }, []);

  const loadOffices = useCallback(async () => {
    const { data } = await supabase.from('remittance_offices').select('*').order('sort_order').order('name');
    setOffices((data || []) as RemittanceOffice[]);
  }, []);

  const run = useCallback(async () => {
    if (!finance) return;
    if (filters.to < filters.from) {
      toast.error('To date must be on or after from date');
      return;
    }
    setBusy(true);
    try {
      if (report.filters.includes('office') && offices.length === 0) {
        await loadOffices();
      }
      const result = await loadReportRows(report.slug, filters);
      setColumns(result.columns);
      setRows(result.rows);
      if (result.warning) toast.message(result.warning);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load report';
      toast.error(message);
      setRows([]);
      setColumns([]);
    } finally {
      setBusy(false);
    }
  }, [finance, filters, loadOffices, offices.length, report.filters, report.slug]);

  useEffect(() => {
    if (!authChecked || !finance) return;
    void loadOffices();
  }, [authChecked, finance, loadOffices]);

  const onDownload = useCallback(async () => {
    if (!rows.length || !columns.length) return;
    try {
      await downloadRowsAsXlsx({
        filename: report.slug,
        sheetName: report.shortTitle,
        columns,
        rows,
      });
      toast.success('Excel downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Excel export failed');
    }
  }, [columns, report.shortTitle, report.slug, rows]);

  const tableHeaders = useMemo(() => columns.map((c) => c.header), [columns]);

  if (!authChecked) {
    return <p className="text-sm text-muted-foreground">Checking access…</p>;
  }

  if (!finance) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Reports are available to accounts and operations roles only.
      </div>
    );
  }

  return (
    <ReportPageShell
      report={report}
      filters={filters}
      onFiltersChange={(next) => setFilters((prev) => ({ ...prev, ...next }))}
      offices={offices}
      busy={busy}
      onRun={() => void run()}
      onDownload={() => void onDownload()}
      canDownload={rows.length > 0}
      rowCount={rows.length}
    >
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            {tableHeaders.length === 0 ? (
              <th className="p-3">Column</th>
            ) : (
              tableHeaders.map((header) => (
                <th key={header} className="p-3">
                  {header}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <ReportEmptyRow colSpan={Math.max(tableHeaders.length, 1)} />
          ) : (
            rows.map((row, index) => (
              <tr key={String(row._key || index)} className="border-t">
                {columns.map((col) => (
                  <td key={col.key} className="p-3 whitespace-nowrap">
                    {formatCell(row[col.key])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ReportPageShell>
  );
}

function formatCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

async function loadReportRows(
  slug: string,
  filters: ReportFilterState
): Promise<{ columns: ExcelColumn[]; rows: Row[]; warning?: string }> {
  switch (slug) {
    case 'customer-balance-payments':
      return loadCustomerBalancePayments(filters);
    case 'customer-sales-value-stats':
      return loadCustomerSalesValueStats(filters);
    case 'customer-registrations':
      return loadCustomerRegistrations(filters);
    case 'office-sales-stats':
      return loadOfficeSalesStats(filters);
    case 'purchase-statistics':
      return loadPurchaseStatistics(filters);
    case 'resource-sales-stats':
      return loadResourceSalesStats(filters);
    case 'resource-sales-value-stats':
      return loadResourceSalesValueStats(filters);
    default:
      throw new Error('Unknown report');
  }
}

async function loadCustomerBalancePayments(filters: ReportFilterState) {
  let query = supabase
    .from('remittances')
    .select(
      'id,remittance_number,received_date,customer_id,customer_name,amount,currency,status,method,office_id,invoice_id,is_unknown'
    )
    .gte('received_date', filters.from)
    .lte('received_date', filters.to)
    .order('received_date', { ascending: false })
    .limit(PAGE_SIZE);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.officeId === '__none__') query = query.is('office_id', null);
  else if (filters.officeId) query = query.eq('office_id', filters.officeId);

  const [remRes, allocRes, officeRes, invRes] = await Promise.all([
    query,
    supabase.from('remittance_allocations').select('remittance_id,amount,invoice_id').limit(10000),
    supabase.from('remittance_offices').select('id,name'),
    supabase
      .from('invoices')
      .select('id,invoice_number,balance_due,total_amount,amount_paid,currency,status')
      .limit(5000),
  ]);

  if (remRes.error) throw new Error(remRes.error.message);
  if (allocRes.error) throw new Error(allocRes.error.message);

  const officeName = new Map((officeRes.data || []).map((o) => [o.id, o.name]));
  const invoiceMap = new Map((invRes.data || []).map((i) => [i.id, i]));
  const allocated = new Map<string, number>();
  for (const row of allocRes.data || []) {
    allocated.set(row.remittance_id, (allocated.get(row.remittance_id) || 0) + Number(row.amount || 0));
  }

  const rows: Row[] = [];
  for (const rem of remRes.data || []) {
    if (!matchesCustomer(filters.customerQ, rem.customer_name)) continue;
    const amt = Number(rem.amount || 0);
    const alloc = Math.min(amt, allocated.get(rem.id) || 0);
    const inv = rem.invoice_id ? invoiceMap.get(rem.invoice_id) : null;
    rows.push({
      _key: rem.id,
      remittance_number: rem.remittance_number,
      received_date: rem.received_date,
      customer_name: rem.customer_name,
      amount: amt,
      currency: rem.currency || 'AED',
      status: rem.status,
      method: rem.method,
      office: rem.office_id ? officeName.get(rem.office_id) || rem.office_id : 'Unassigned',
      allocated: alloc,
      unallocated: Math.max(0, amt - alloc),
      invoice_number: inv?.invoice_number || '',
      invoice_balance_due: inv ? Number(inv.balance_due || 0) : null,
    });
  }

  return {
    columns: [
      { header: 'Remittance #', key: 'remittance_number' },
      { header: 'Received', key: 'received_date' },
      { header: 'Customer', key: 'customer_name', width: 28 },
      { header: 'Amount', key: 'amount' },
      { header: 'Currency', key: 'currency' },
      { header: 'Status', key: 'status' },
      { header: 'Method', key: 'method' },
      { header: 'Office', key: 'office' },
      { header: 'Allocated', key: 'allocated' },
      { header: 'Unallocated', key: 'unallocated' },
      { header: 'Invoice #', key: 'invoice_number' },
      { header: 'Invoice balance due', key: 'invoice_balance_due' },
    ],
    rows,
  };
}

async function loadCustomerSalesValueStats(filters: ReportFilterState) {
  const types = filters.documentType
    ? [filters.documentType]
    : ['tax_invoice', 'commercial_invoice'];

  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id,customer_id,customer_name,customer_company,document_type,issue_date,currency,total_amount,amount_paid,balance_due,status'
    )
    .in('document_type', types)
    .gte('issue_date', filters.from)
    .lte('issue_date', filters.to)
    .not('status', 'in', '(draft,cancelled)')
    .order('issue_date', { ascending: false })
    .limit(PAGE_SIZE);

  if (error) throw new Error(error.message);

  type Agg = {
    key: string;
    customer_name: string;
    customer_company: string;
    currency: string;
    invoice_count: number;
    total_amount: number;
    amount_paid: number;
    balance_due: number;
    tax_count: number;
    commercial_count: number;
  };

  const map = new Map<string, Agg>();
  for (const inv of data || []) {
    if (!matchesCustomer(filters.customerQ, inv.customer_name, inv.customer_company)) continue;
    const currency = inv.currency || 'AED';
    const key = `${inv.customer_id || inv.customer_name}::${currency}`;
    const current = map.get(key) || {
      key,
      customer_name: inv.customer_name,
      customer_company: inv.customer_company || '',
      currency,
      invoice_count: 0,
      total_amount: 0,
      amount_paid: 0,
      balance_due: 0,
      tax_count: 0,
      commercial_count: 0,
    };
    current.invoice_count += 1;
    current.total_amount += Number(inv.total_amount || 0);
    current.amount_paid += Number(inv.amount_paid || 0);
    current.balance_due += Number(inv.balance_due || 0);
    if (inv.document_type === 'tax_invoice') current.tax_count += 1;
    if (inv.document_type === 'commercial_invoice') current.commercial_count += 1;
    map.set(key, current);
  }

  const rows: Row[] = Array.from(map.values())
    .sort((a, b) => b.total_amount - a.total_amount)
    .map((row) => ({
      _key: row.key,
      customer_name: row.customer_name,
      customer_company: row.customer_company,
      currency: row.currency,
      invoice_count: row.invoice_count,
      tax_count: row.tax_count,
      commercial_count: row.commercial_count,
      total_amount: Number(row.total_amount.toFixed(2)),
      amount_paid: Number(row.amount_paid.toFixed(2)),
      balance_due: Number(row.balance_due.toFixed(2)),
      total_display: reportMoney(row.total_amount, row.currency),
    }));

  return {
    columns: [
      { header: 'Customer', key: 'customer_name', width: 28 },
      { header: 'Company', key: 'customer_company', width: 24 },
      { header: 'Currency', key: 'currency' },
      { header: 'Invoices', key: 'invoice_count' },
      { header: 'Tax', key: 'tax_count' },
      { header: 'Commercial', key: 'commercial_count' },
      { header: 'Sales value', key: 'total_amount' },
      { header: 'Paid', key: 'amount_paid' },
      { header: 'Balance due', key: 'balance_due' },
    ],
    rows,
  };
}

async function loadCustomerRegistrations(filters: ReportFilterState) {
  const fromIso = `${filters.from}T00:00:00.000Z`;
  const toIso = `${filters.to}T23:59:59.999Z`;

  const { data, error } = await supabase
    .from('customers')
    .select(
      'id,customer_code,full_name,company_name,email,phone,country,is_active,owner_id,created_at'
    )
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (error) throw new Error(error.message);

  const ownerIds = Array.from(new Set((data || []).map((c) => c.owner_id).filter(Boolean))) as string[];
  const ownerMap = new Map<string, string>();
  if (ownerIds.length) {
    const { data: profiles } = await supabase
      .from('admin_profiles')
      .select('id,full_name,email')
      .in('id', ownerIds);
    for (const p of profiles || []) {
      ownerMap.set(p.id, p.full_name || p.email || p.id);
    }
  }

  const rows: Row[] = (data || [])
    .filter((c) => matchesCustomer(filters.customerQ, c.full_name, c.company_name, c.customer_code, c.email))
    .map((c) => ({
      _key: c.id,
      customer_code: c.customer_code,
      full_name: c.full_name,
      company_name: c.company_name || '',
      email: c.email || '',
      phone: c.phone || '',
      country: c.country || '',
      is_active: c.is_active,
      owner: c.owner_id ? ownerMap.get(c.owner_id) || '' : '',
      created_at: toDateOnly(c.created_at),
    }));

  return {
    columns: [
      { header: 'Code', key: 'customer_code' },
      { header: 'Name', key: 'full_name', width: 24 },
      { header: 'Company', key: 'company_name', width: 24 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone' },
      { header: 'Country', key: 'country' },
      { header: 'Active', key: 'is_active' },
      { header: 'Owner', key: 'owner' },
      { header: 'Created', key: 'created_at' },
    ],
    rows,
  };
}

async function loadOfficeSalesStats(filters: ReportFilterState) {
  let query = supabase
    .from('remittances')
    .select('id,amount,currency,status,office_id,received_by,received_date,is_unknown')
    .gte('received_date', filters.from)
    .lte('received_date', filters.to)
    .limit(PAGE_SIZE);

  if (filters.status) query = query.eq('status', filters.status);

  const [remRes, allocRes, officeRes, profileRes] = await Promise.all([
    query,
    supabase.from('remittance_allocations').select('remittance_id,amount').limit(10000),
    supabase.from('remittance_offices').select('id,name'),
    supabase.from('admin_profiles').select('id,office_id,full_name'),
  ]);

  if (remRes.error) throw new Error(remRes.error.message);
  if (allocRes.error) throw new Error(allocRes.error.message);

  const officeName = new Map((officeRes.data || []).map((o) => [o.id, o.name]));
  const profileOffice = new Map((profileRes.data || []).map((p) => [p.id, p.office_id as string | null]));
  const allocated = new Map<string, number>();
  for (const row of allocRes.data || []) {
    allocated.set(row.remittance_id, (allocated.get(row.remittance_id) || 0) + Number(row.amount || 0));
  }

  type Agg = {
    key: string;
    office: string;
    currency: string;
    remittance_count: number;
    received: number;
    allocated: number;
    unallocated: number;
  };
  const map = new Map<string, Agg>();

  for (const rem of remRes.data || []) {
    let officeId = rem.office_id as string | null;
    if (!officeId && rem.received_by) {
      officeId = profileOffice.get(rem.received_by) || null;
    }
    if (filters.officeId === '__none__' && officeId) continue;
    if (filters.officeId && filters.officeId !== '__none__' && officeId !== filters.officeId) continue;

    const currency = rem.currency || 'AED';
    const officeLabel = officeId ? officeName.get(officeId) || officeId : 'Unassigned';
    const key = `${officeId || '__none__'}::${currency}`;
    const amt = Number(rem.amount || 0);
    const alloc = Math.min(amt, allocated.get(rem.id) || 0);
    const current = map.get(key) || {
      key,
      office: officeLabel,
      currency,
      remittance_count: 0,
      received: 0,
      allocated: 0,
      unallocated: 0,
    };
    current.remittance_count += 1;
    current.received += amt;
    current.allocated += alloc;
    current.unallocated += Math.max(0, amt - alloc);
    map.set(key, current);
  }

  const rows: Row[] = Array.from(map.values())
    .sort((a, b) => b.received - a.received)
    .map((row) => ({
      _key: row.key,
      office: row.office,
      currency: row.currency,
      remittance_count: row.remittance_count,
      received: Number(row.received.toFixed(2)),
      allocated: Number(row.allocated.toFixed(2)),
      unallocated: Number(row.unallocated.toFixed(2)),
    }));

  return {
    columns: [
      { header: 'Office', key: 'office', width: 24 },
      { header: 'Currency', key: 'currency' },
      { header: 'Remittances', key: 'remittance_count' },
      { header: 'Received', key: 'received' },
      { header: 'Allocated', key: 'allocated' },
      { header: 'Unallocated', key: 'unallocated' },
    ],
    rows,
  };
}

async function loadPurchaseStatistics(filters: ReportFilterState) {
  let vehicleQuery = supabase
    .from('vehicles')
    .select(
      'id,title,make,model,chassis_number,stock_number,stock_origin,purchase_date,purchase_price,purchase_currency,stock_status,supplier_id'
    )
    .not('purchase_date', 'is', null)
    .gte('purchase_date', filters.from)
    .lte('purchase_date', filters.to)
    .order('purchase_date', { ascending: false })
    .limit(PAGE_SIZE);

  let partQuery = supabase
    .from('parts')
    .select(
      'id,name,part_number,brand,stock_origin,purchase_date,purchase_price,purchase_currency,stock_status,supplier_id'
    )
    .not('purchase_date', 'is', null)
    .gte('purchase_date', filters.from)
    .lte('purchase_date', filters.to)
    .order('purchase_date', { ascending: false })
    .limit(PAGE_SIZE);

  if (filters.stockOrigin) {
    vehicleQuery = vehicleQuery.eq('stock_origin', filters.stockOrigin);
    partQuery = partQuery.eq('stock_origin', filters.stockOrigin);
  }

  const [vehicleRes, partRes, poRes, supplierRes] = await Promise.all([
    vehicleQuery,
    partQuery,
    supabase
      .from('purchase_orders')
      .select('id,po_number,order_date,currency,amount_ordered,status,supplier_id')
      .gte('order_date', filters.from)
      .lte('order_date', filters.to)
      .order('order_date', { ascending: false })
      .limit(500),
    supabase.from('suppliers').select('id,name').limit(2000),
  ]);

  if (vehicleRes.error) throw new Error(vehicleRes.error.message);
  if (partRes.error) throw new Error(partRes.error.message);

  const supplierName = new Map((supplierRes.data || []).map((s) => [s.id, s.name]));
  const rows: Row[] = [];
  const warnings: string[] = [];
  if (supplierRes.error) {
    warnings.push('Supplier names are ops-only; supplier column may be blank for this role.');
  }

  for (const v of vehicleRes.data || []) {
    rows.push({
      _key: `v-${v.id}`,
      resource_type: 'vehicle',
      reference: v.stock_number || v.chassis_number || v.title,
      description: [v.make, v.model].filter(Boolean).join(' ') || v.title,
      purchase_date: v.purchase_date,
      purchase_price: Number(v.purchase_price || 0),
      currency: v.purchase_currency || 'AED',
      stock_origin: stockOriginLabel(v.stock_origin),
      stock_status: v.stock_status,
      supplier: v.supplier_id ? supplierName.get(v.supplier_id) || '' : '',
      source: 'inventory',
    });
  }

  for (const p of partRes.data || []) {
    rows.push({
      _key: `p-${p.id}`,
      resource_type: 'part',
      reference: p.part_number || p.name,
      description: [p.brand, p.name].filter(Boolean).join(' — '),
      purchase_date: p.purchase_date,
      purchase_price: Number(p.purchase_price || 0),
      currency: p.purchase_currency || 'AED',
      stock_origin: stockOriginLabel(p.stock_origin),
      stock_status: p.stock_status,
      supplier: p.supplier_id ? supplierName.get(p.supplier_id) || '' : '',
      source: 'inventory',
    });
  }

  let warning: string | undefined;
  if (poRes.error) {
    warnings.push('Purchase orders are not visible for this role; showing inventory purchase fields only.');
  } else {
    for (const po of poRes.data || []) {
      rows.push({
        _key: `po-${po.id}`,
        resource_type: 'purchase_order',
        reference: po.po_number,
        description: `PO ${po.po_number}`,
        purchase_date: po.order_date,
        purchase_price: Number(po.amount_ordered || 0),
        currency: po.currency || 'AED',
        stock_origin: '',
        stock_status: po.status,
        supplier: po.supplier_id ? supplierName.get(po.supplier_id) || '' : '',
        source: 'purchase_order',
      });
    }
  }

  rows.sort((a, b) => String(b.purchase_date).localeCompare(String(a.purchase_date)));

  return {
    columns: [
      { header: 'Type', key: 'resource_type' },
      { header: 'Reference', key: 'reference', width: 22 },
      { header: 'Description', key: 'description', width: 28 },
      { header: 'Purchase date', key: 'purchase_date' },
      { header: 'Purchase price', key: 'purchase_price' },
      { header: 'Currency', key: 'currency' },
      { header: 'Stock origin', key: 'stock_origin' },
      { header: 'Status', key: 'stock_status' },
      { header: 'Supplier', key: 'supplier' },
      { header: 'Source', key: 'source' },
    ],
    rows,
    warning: warnings.length ? warnings.join(' ') : undefined,
  };
}

async function loadResourceSalesStats(filters: ReportFilterState) {
  let vehicleQuery = supabase
    .from('vehicles')
    .select('id,make,model,vehicle_class,stock_origin,sold_at,sold_by,stock_status')
    .eq('stock_status', 'sold')
    .not('sold_at', 'is', null)
    .gte('sold_at', `${filters.from}T00:00:00.000Z`)
    .lte('sold_at', `${filters.to}T23:59:59.999Z`)
    .limit(PAGE_SIZE);

  let partQuery = supabase
    .from('parts')
    .select('id,brand,name,stock_origin,sold_at,sold_by,stock_status,quantity')
    .eq('stock_status', 'sold')
    .not('sold_at', 'is', null)
    .gte('sold_at', `${filters.from}T00:00:00.000Z`)
    .lte('sold_at', `${filters.to}T23:59:59.999Z`)
    .limit(PAGE_SIZE);

  if (filters.stockOrigin) {
    vehicleQuery = vehicleQuery.eq('stock_origin', filters.stockOrigin);
    partQuery = partQuery.eq('stock_origin', filters.stockOrigin);
  }

  const [vehicleRes, partRes, profileRes] = await Promise.all([
    vehicleQuery,
    partQuery,
    supabase.from('admin_profiles').select('id,full_name,email'),
  ]);

  if (vehicleRes.error) throw new Error(vehicleRes.error.message);
  if (partRes.error) throw new Error(partRes.error.message);

  const agentName = new Map((profileRes.data || []).map((p) => [p.id, p.full_name || p.email || p.id]));

  type Agg = {
    key: string;
    resource_type: string;
    group_label: string;
    stock_origin: string;
    agent: string;
    units: number;
  };
  const map = new Map<string, Agg>();

  const bump = (partial: Omit<Agg, 'units'> & { units?: number }) => {
    const current = map.get(partial.key) || { ...partial, units: 0 };
    current.units += partial.units || 1;
    map.set(partial.key, current);
  };

  for (const v of vehicleRes.data || []) {
    const agent = v.sold_by ? agentName.get(v.sold_by) || v.sold_by : 'Unassigned';
    const group = [v.make || 'Unknown', v.model || '', v.vehicle_class || ''].filter(Boolean).join(' / ');
    const origin = stockOriginLabel(v.stock_origin);
    bump({
      key: `vehicle::${group}::${origin}::${agent}`,
      resource_type: 'vehicle',
      group_label: group,
      stock_origin: origin,
      agent: String(agent),
      units: 1,
    });
  }

  for (const p of partRes.data || []) {
    const agent = p.sold_by ? agentName.get(p.sold_by) || p.sold_by : 'Unassigned';
    const group = [p.brand || 'Unknown', p.name || 'Part'].filter(Boolean).join(' / ');
    const origin = stockOriginLabel(p.stock_origin);
    bump({
      key: `part::${group}::${origin}::${agent}`,
      resource_type: 'part',
      group_label: group,
      stock_origin: origin,
      agent: String(agent),
      units: Math.max(1, Number(p.quantity || 1)),
    });
  }

  const rows: Row[] = Array.from(map.values())
    .sort((a, b) => b.units - a.units)
    .map((row) => ({
      _key: row.key,
      resource_type: row.resource_type,
      group_label: row.group_label,
      stock_origin: row.stock_origin,
      agent: row.agent,
      units_sold: row.units,
    }));

  return {
    columns: [
      { header: 'Type', key: 'resource_type' },
      { header: 'Make / model / class', key: 'group_label', width: 36 },
      { header: 'Stock origin', key: 'stock_origin' },
      { header: 'Sold by', key: 'agent' },
      { header: 'Units sold', key: 'units_sold' },
    ],
    rows,
  };
}

async function loadResourceSalesValueStats(filters: ReportFilterState) {
  let vehicleQuery = supabase
    .from('vehicles')
    .select(
      'id,title,make,model,chassis_number,stock_number,stock_origin,sold_at,sold_by,price,currency,price_fob,price_cf,price_cif'
    )
    .eq('stock_status', 'sold')
    .not('sold_at', 'is', null)
    .gte('sold_at', `${filters.from}T00:00:00.000Z`)
    .lte('sold_at', `${filters.to}T23:59:59.999Z`)
    .limit(PAGE_SIZE);

  let partQuery = supabase
    .from('parts')
    .select('id,name,part_number,brand,stock_origin,sold_at,sold_by,price,currency')
    .eq('stock_status', 'sold')
    .not('sold_at', 'is', null)
    .gte('sold_at', `${filters.from}T00:00:00.000Z`)
    .lte('sold_at', `${filters.to}T23:59:59.999Z`)
    .limit(PAGE_SIZE);

  if (filters.stockOrigin) {
    vehicleQuery = vehicleQuery.eq('stock_origin', filters.stockOrigin);
    partQuery = partQuery.eq('stock_origin', filters.stockOrigin);
  }

  const [vehicleRes, partRes, itemRes, profileRes] = await Promise.all([
    vehicleQuery,
    partQuery,
    supabase
      .from('invoice_items')
      .select(
        'id,vehicle_id,part_id,line_total,description,invoice_id,invoices!inner(id,invoice_number,document_type,status,currency,customer_name,issue_date)'
      )
      .or('vehicle_id.not.is.null,part_id.not.is.null')
      .limit(5000),
    supabase.from('admin_profiles').select('id,full_name,email'),
  ]);

  if (vehicleRes.error) throw new Error(vehicleRes.error.message);
  if (partRes.error) throw new Error(partRes.error.message);

  const agentName = new Map((profileRes.data || []).map((p) => [p.id, p.full_name || p.email || p.id]));

  type InvJoin = {
    invoice_number?: string;
    document_type?: string;
    status?: string;
    currency?: string;
    customer_name?: string;
    issue_date?: string;
  };

  const invoiceByVehicle = new Map<string, { line_total: number; invoice: InvJoin }>();
  const invoiceByPart = new Map<string, { line_total: number; invoice: InvJoin }>();
  let warning: string | undefined;

  if (itemRes.error) {
    warning = 'Invoice line values could not be loaded; showing catalog list prices only.';
  } else {
    for (const item of itemRes.data || []) {
      const invRaw = item.invoices as unknown;
      const inv = (Array.isArray(invRaw) ? invRaw[0] : invRaw) as InvJoin | null;
      if (!inv) continue;
      if (inv.status === 'draft' || inv.status === 'cancelled') continue;
      if (inv.document_type !== 'tax_invoice' && inv.document_type !== 'commercial_invoice') continue;
      if (item.vehicle_id) {
        invoiceByVehicle.set(item.vehicle_id, { line_total: Number(item.line_total || 0), invoice: inv });
      }
      if (item.part_id) {
        invoiceByPart.set(item.part_id, { line_total: Number(item.line_total || 0), invoice: inv });
      }
    }
  }

  const rows: Row[] = [];

  for (const v of vehicleRes.data || []) {
    const linked = invoiceByVehicle.get(v.id);
    const listPrice = Number(v.price || v.price_fob || v.price_cf || v.price_cif || 0);
    rows.push({
      _key: `v-${v.id}`,
      resource_type: 'vehicle',
      reference: v.stock_number || v.chassis_number || v.title,
      description: [v.make, v.model].filter(Boolean).join(' ') || v.title,
      sold_at: toDateOnly(v.sold_at),
      stock_origin: stockOriginLabel(v.stock_origin),
      sold_by: v.sold_by ? agentName.get(v.sold_by) || '' : '',
      list_price: listPrice,
      invoice_line_value: linked?.line_total ?? null,
      currency: linked?.invoice.currency || v.currency || 'AED',
      invoice_number: linked?.invoice.invoice_number || '',
      customer_name: linked?.invoice.customer_name || '',
    });
  }

  for (const p of partRes.data || []) {
    const linked = invoiceByPart.get(p.id);
    rows.push({
      _key: `p-${p.id}`,
      resource_type: 'part',
      reference: p.part_number || p.name,
      description: [p.brand, p.name].filter(Boolean).join(' — '),
      sold_at: toDateOnly(p.sold_at),
      stock_origin: stockOriginLabel(p.stock_origin),
      sold_by: p.sold_by ? agentName.get(p.sold_by) || '' : '',
      list_price: Number(p.price || 0),
      invoice_line_value: linked?.line_total ?? null,
      currency: linked?.invoice.currency || p.currency || 'AED',
      invoice_number: linked?.invoice.invoice_number || '',
      customer_name: linked?.invoice.customer_name || '',
    });
  }

  rows.sort((a, b) => String(b.sold_at).localeCompare(String(a.sold_at)));

  return {
    columns: [
      { header: 'Type', key: 'resource_type' },
      { header: 'Reference', key: 'reference', width: 20 },
      { header: 'Description', key: 'description', width: 28 },
      { header: 'Sold at', key: 'sold_at' },
      { header: 'Stock origin', key: 'stock_origin' },
      { header: 'Sold by', key: 'sold_by' },
      { header: 'List price', key: 'list_price' },
      { header: 'Invoice line value', key: 'invoice_line_value' },
      { header: 'Currency', key: 'currency' },
      { header: 'Invoice #', key: 'invoice_number' },
      { header: 'Customer', key: 'customer_name', width: 24 },
    ],
    rows,
    warning,
  };
}

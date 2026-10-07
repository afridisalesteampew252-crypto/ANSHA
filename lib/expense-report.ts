import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExcelColumn } from '@/lib/export-excel';
import type { Expense, ExpenseAttachment, ExpensePaymentMethod, ExpenseStatus } from '@/lib/types';

export type ExpenseReportFilters = {
  query: string;
  from: string;
  to: string;
  currency: string;
  categoryId: string;
  status: 'all' | ExpenseStatus;
};

export const DEFAULT_EXPENSE_REPORT_FILTERS: ExpenseReportFilters = {
  query: '', from: '', to: '', currency: '', categoryId: '', status: 'all',
};

/** Excel's row limit, less the header row. */
export const MAX_EXPENSE_REPORT_ROWS = 1_048_575;
const PAGE_SIZE = 500;
const ATTACHMENT_ID_BATCH_SIZE = 100;
const MAX_CELL_LENGTH = 32_767;

function rowLimitError(): Error {
  return new Error(`The expense report exceeds Excel's ${MAX_EXPENSE_REPORT_ROWS.toLocaleString('en-US')} data-row limit. Narrow the filters and try again.`);
}

const PAYMENT_LABELS: Record<ExpensePaymentMethod, string> = {
  bank_transfer: 'Bank transfer', cash: 'Cash', card: 'Card', cheque: 'Cheque',
  remittance_company: 'Remittance company', other: 'Other',
};

const EXPENSE_COLUMNS: ExcelColumn[] = [
  { header: 'Expense number', key: 'expense_number', width: 20 },
  { header: 'Date', key: 'expense_date', width: 14 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Category', key: 'category', width: 25 },
  { header: 'Payee', key: 'payee', width: 28 },
  { header: 'Amount', key: 'amount', width: 16 },
  { header: 'Currency', key: 'currency', width: 12 },
  { header: 'Payment method', key: 'payment_method', width: 23 },
  { header: 'Bank account', key: 'bank_account', width: 38 },
  { header: 'Bank reference', key: 'bank_reference', width: 25 },
  { header: 'Notes', key: 'notes', width: 45 },
  { header: 'Attachments', key: 'attachments', width: 45 },
  { header: 'Posted at', key: 'posted_at', width: 25 },
];

function normalizedFilters(filters: ExpenseReportFilters): ExpenseReportFilters {
  return {
    query: filters.query.trim().toLowerCase(),
    from: filters.from.trim(),
    to: filters.to.trim(),
    currency: filters.currency.trim().toUpperCase(),
    categoryId: filters.categoryId.trim(),
    status: filters.status,
  };
}

function validDate(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function filterError(filters: ExpenseReportFilters): string | null {
  if (!validDate(filters.from) || !validDate(filters.to)) return 'Enter valid expense report dates (YYYY-MM-DD).';
  if (filters.from && filters.to && filters.from > filters.to) return 'The expense report From date must be on or before the To date.';
  if (filters.currency && !/^[A-Z]{3}$/.test(filters.currency)) return 'Choose a valid expense report currency.';
  if (!['all', 'draft', 'posted', 'cancelled'].includes(filters.status)) return 'Choose a valid expense report status.';
  return null;
}

/** Shared by the visible expense list and the complete export. Invalid filters match no rows. */
export function matchesExpenseReport(
  row: Expense,
  filters: ExpenseReportFilters,
  categoryName: string,
  attachmentNames: string[],
): boolean {
  const selected = normalizedFilters(filters);
  if (filterError(selected)) return false;
  if (selected.from && row.expense_date < selected.from) return false;
  if (selected.to && row.expense_date > selected.to) return false;
  if (selected.currency && row.currency.trim().toUpperCase() !== selected.currency) return false;
  if (selected.categoryId && row.category_id !== selected.categoryId) return false;
  if (selected.status !== 'all' && row.status !== selected.status) return false;
  if (!selected.query) return true;
  return [
    row.expense_number, row.expense_date, row.status, row.payee, row.payment_method,
    PAYMENT_LABELS[row.payment_method], categoryName, row.currency, row.bank_reference,
    row.notes, ...attachmentNames,
  ].some((value) => value?.toLowerCase().includes(selected.query));
}

type PageResult<T> = {
  data: T[] | null;
  count: number | null;
  error: { message: string } | null;
};

/** Exact counts distinguish provider page caps from the actual end of the result. */
async function readAllPages<T extends { id: string }>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  label: string,
  maxRows = Number.MAX_SAFE_INTEGER,
): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let expectedCount: number | null = null;
  do {
    const result = await loadPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (result.error) throw new Error(`Could not load ${label}: ${result.error.message}`);
    if (!Array.isArray(result.data) || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) {
      throw new Error(`Could not verify the complete ${label} report. Please retry.`);
    }
    if (result.count > maxRows) throw rowLimitError();
    if (expectedCount !== null && result.count !== expectedCount) {
      throw new Error(`${label} changed while the report was loading. Please retry.`);
    }
    expectedCount = result.count;
    if (result.data.length === 0 && rows.length < expectedCount) {
      throw new Error(`The ${label} report is incomplete. Please retry.`);
    }
    for (const row of result.data) {
      if (!row.id || ids.has(row.id)) throw new Error(`${label} changed while the report was loading. Please retry.`);
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length > expectedCount) throw new Error(`${label} changed while the report was loading. Please retry.`);
  } while (rows.length < expectedCount);
  return rows;
}

type CategoryLabel = { id: string; name: string };
type BankLabel = { id: string; name: string; bank_name: string | null; currency: string };
type AttachmentLabel = { id: string; expense_id: string; file_name: string; created_at: string };

/** Complete metadata for the visible list, including receipt searches and attachment actions. */
export async function fetchAllExpenseAttachments(
  client: SupabaseClient,
  expenseIds: string[],
): Promise<ExpenseAttachment[]> {
  const ids = Array.from(new Set(expenseIds));
  const attachments: ExpenseAttachment[] = [];
  for (let offset = 0; offset < ids.length; offset += ATTACHMENT_ID_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + ATTACHMENT_ID_BATCH_SIZE);
    const rows = await readAllPages<ExpenseAttachment>((from, to) => client.from('expense_attachments')
      .select('id,expense_id,storage_path,file_name,mime_type,size_bytes,uploaded_by,created_at', { count: 'exact' })
      .in('expense_id', batch).order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(from, to).returns<ExpenseAttachment[]>(), 'expense attachments');
    attachments.push(...rows);
  }
  return attachments;
}

function plainCell(value: string | null): string | null {
  if (value !== null && value.length > MAX_CELL_LENGTH) {
    throw new Error("An expense report field exceeds Excel's 32,767-character cell limit. Shorten the field before exporting.");
  }
  // ExcelJS treats primitive strings as literal text, including strings starting with '='.
  return value;
}

/** Uses the supplied authenticated client and its existing RLS. Never downloads attachment files. */
export async function fetchExpenseReport(
  client: SupabaseClient,
  filters: ExpenseReportFilters,
): Promise<{ columns: ExcelColumn[]; rows: Record<string, string | number | null>[]; count: number }> {
  const selected = normalizedFilters(filters);
  const error = filterError(selected);
  if (error) throw new Error(error);

  // Text search covers category / attachment metadata, so its matched count is known only after those reads.
  const expenses = await readAllPages<Expense>((from, to) => {
    let query = client.from('expenses').select(
      'id,expense_number,expense_date,amount,currency,category_id,payee,payment_method,bank_account_id,bank_reference,notes,status,posted_at',
      { count: 'exact' },
    );
    if (selected.from) query = query.gte('expense_date', selected.from);
    if (selected.to) query = query.lte('expense_date', selected.to);
    if (selected.currency) query = query.eq('currency', selected.currency);
    if (selected.categoryId) query = query.eq('category_id', selected.categoryId);
    if (selected.status !== 'all') query = query.eq('status', selected.status);
    return query.order('expense_date', { ascending: false }).order('id', { ascending: false }).range(from, to).returns<Expense[]>();
  }, 'expenses', selected.query ? Number.MAX_SAFE_INTEGER : MAX_EXPENSE_REPORT_ROWS);

  const columns = EXPENSE_COLUMNS.map((column) => ({ ...column }));
  if (expenses.length === 0) return { columns, rows: [], count: 0 };

  // Include inactive labels so old expenses remain intelligible after configuration changes.
  const [categories, banks] = await Promise.all([
    readAllPages<CategoryLabel>((from, to) => client.from('expense_categories')
      .select('id,name', { count: 'exact' }).order('id').range(from, to).returns<CategoryLabel[]>(), 'expense categories'),
    readAllPages<BankLabel>((from, to) => client.from('bank_accounts')
      .select('id,name,bank_name,currency', { count: 'exact' }).order('id').range(from, to).returns<BankLabel[]>(), 'expense bank accounts'),
  ]);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const bankNames = new Map(banks.map((bank) => [
    bank.id, `${bank.name}${bank.bank_name ? ` — ${bank.bank_name}` : ''} (${bank.currency || 'AED'})`,
  ]));
  for (const expense of expenses) {
    if (!categoryNames.has(expense.category_id) || (expense.bank_account_id && !bankNames.has(expense.bank_account_id))) {
      throw new Error(`Could not load the category or bank account for expense ${expense.expense_number}. The report was not exported. Please retry.`);
    }
  }

  const attachmentNames = new Map<string, string[]>();
  for (let offset = 0; offset < expenses.length; offset += ATTACHMENT_ID_BATCH_SIZE) {
    const expenseIds = expenses.slice(offset, offset + ATTACHMENT_ID_BATCH_SIZE).map((expense) => expense.id);
    const attachments = await readAllPages<AttachmentLabel>((from, to) => client.from('expense_attachments')
      .select('id,expense_id,file_name,created_at', { count: 'exact' }).in('expense_id', expenseIds)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to).returns<AttachmentLabel[]>(), 'expense attachments');
    for (const attachment of attachments) {
      const names = attachmentNames.get(attachment.expense_id) || [];
      names.push(attachment.file_name);
      attachmentNames.set(attachment.expense_id, names);
    }
  }

  const rows: Record<string, string | number | null>[] = [];
  for (const expense of expenses) {
    const category = categoryNames.get(expense.category_id) || expense.category_id.slice(0, 8);
    const names = attachmentNames.get(expense.id) || [];
    if (!matchesExpenseReport(expense, selected, category, names)) continue;
    if (rows.length >= MAX_EXPENSE_REPORT_ROWS) throw rowLimitError();
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount)) throw new Error(`Expense ${expense.expense_number} has an invalid amount. The report was not exported.`);
    rows.push({
      expense_number: plainCell(expense.expense_number),
      expense_date: plainCell(expense.expense_date),
      status: plainCell(expense.status),
      category: plainCell(category),
      payee: plainCell(expense.payee),
      amount,
      currency: plainCell(expense.currency),
      payment_method: plainCell(PAYMENT_LABELS[expense.payment_method] || expense.payment_method),
      bank_account: plainCell(expense.bank_account_id ? bankNames.get(expense.bank_account_id) || expense.bank_account_id : null),
      bank_reference: plainCell(expense.bank_reference),
      notes: plainCell(expense.notes),
      attachments: plainCell(names.join('\n')),
      posted_at: plainCell(expense.posted_at),
    });
  }
  return { columns, rows, count: rows.length };
}

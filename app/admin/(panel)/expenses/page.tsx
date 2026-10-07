'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, Plus, Receipt, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { useFinanceSettings } from '@/lib/use-finance-settings';
import {
  ExpenseAttachmentCount,
  ExpenseAttachmentsPanel,
  PendingExpenseAttachments,
  uploadExpenseAttachments,
} from '@/components/admin/expense-attachments';
import { groupAttachmentsByExpense } from '@/lib/expense-attachments';
import { downloadExcelWorkbook } from '@/lib/export-excel';
import {
  DEFAULT_EXPENSE_REPORT_FILTERS,
  fetchAllExpenseAttachments,
  fetchExpenseReport,
  matchesExpenseReport,
  type ExpenseReportFilters,
} from '@/lib/expense-report';
import type {
  Expense,
  ExpenseAttachment,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
} from '@/lib/types';

type BankOption = { id: string; label: string };

const money = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

const statusBadge: Record<ExpenseStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  posted: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-zinc-200 text-zinc-700',
};

const METHODS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'remittance_company', label: 'Remittance company' },
  { value: 'other', label: 'Other' },
];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportFilters, setReportFilters] = useState<ExpenseReportFilters>({ ...DEFAULT_EXPENSE_REPORT_FILTERS });
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);

  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const financeSettings = useFinanceSettings();
  const [currency, setCurrency] = useState('');
  const selectedCurrency = currency || financeSettings.default_currency;
  const [categoryId, setCategoryId] = useState('');
  const [payee, setPayee] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>('bank_transfer');
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  // False until public.expense_attachments exists (migration 20261006040000).
  const [attachmentsReady, setAttachmentsReady] = useState(true);

  const loadAttachments = useCallback(async (expenseIds: string[]) => {
    if (expenseIds.length === 0) {
      setAttachments([]);
      return;
    }
    try {
      const data = await fetchAllExpenseAttachments(supabase, expenseIds);
      setAttachmentsReady(true);
      setAttachments(data);
    } catch (error) {
      console.warn('Expense attachments unavailable:', error instanceof Error ? error.message : String(error));
      setAttachmentsReady(false);
      setAttachments([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [expRes, catRes, bankRes] = await Promise.all([
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(150),
      supabase.from('expense_categories').select('*').order('sort_order'),
      supabase.from('bank_accounts').select('id,name,bank_name,currency').eq('is_active', true).order('name').limit(100),
    ]);
    if (expRes.error) toast.error(expRes.error.message);
    if (catRes.error) toast.error(catRes.error.message);
    const expenseRows = (expRes.data || []) as Expense[];
    setExpenses(expenseRows);
    setCategories((catRes.data || []) as ExpenseCategory[]);
    await loadAttachments(expenseRows.map((row) => row.id));
    if (!bankRes.error && bankRes.data) {
      setBanks(
        bankRes.data.map((row) => ({
          id: row.id,
          label: `${row.name}${row.bank_name ? ` — ${row.bank_name}` : ''} (${row.currency || 'AED'})`,
        }))
      );
    } else {
      setBanks([]);
    }
    setLoading(false);
  }, [loadAttachments]);

  useEffect(() => {
    void load();
  }, [load]);

  const attachmentsByExpense = useMemo(() => groupAttachmentsByExpense(attachments), [attachments]);
  const attachmentsFor = (id: string) => attachmentsByExpense.get(id) || [];

  const selected = expenses.find((row) => row.id === selectedId) || null;
  const categoryName = (id: string) => categories.find((row) => row.id === id)?.name || id.slice(0, 8);

  const filtered = useMemo(() => {
    return expenses.filter((row) => matchesExpenseReport(
      row,
      reportFilters,
      categories.find((category) => category.id === row.category_id)?.name || row.category_id.slice(0, 8),
      (attachmentsByExpense.get(row.id) || []).map((file) => file.file_name),
    ));
  }, [expenses, reportFilters, categories, attachmentsByExpense]);

  const reportCurrencies = useMemo(() => Array.from(new Set([
    ...financeSettings.enabled_currencies,
    ...expenses.map((row) => row.currency),
  ])).sort(), [financeSettings.enabled_currencies, expenses]);
  const invalidReportRange = Boolean(reportFilters.from && reportFilters.to && reportFilters.from > reportFilters.to);
  const updateReportFilter = <Key extends keyof ExpenseReportFilters>(key: Key, value: ExpenseReportFilters[Key]) => {
    setReportFilters((previous) => ({ ...previous, [key]: value }));
  };

  const exportExpenses = async () => {
    if (exportLock.current || invalidReportRange) return;
    exportLock.current = true;
    setExporting(true);
    try {
      const report = await fetchExpenseReport(supabase, { ...reportFilters });
      if (report.count === 0) {
        toast.info('No expenses match these filters.');
        return;
      }
      await downloadExcelWorkbook({
        filename: 'ansha-expenses',
        sheetName: 'Expenses',
        columns: report.columns,
        rows: report.rows,
        freezeHeader: true,
        autoFilter: true,
        numberFormats: { amount: '#,##0.00' },
      });
      toast.success(`Excel downloaded: ${report.count} expense${report.count === 1 ? '' : 's'}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export expenses. Please try again.');
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditing(false);
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setAmount('');
    setCurrency('');
    setCategoryId('');
    setPayee('');
    setPaymentMethod('bank_transfer');
    setBankAccountId('');
    setBankReference('');
    setNotes('');
    setPendingFiles([]);
  };

  const fillFromSelected = () => {
    if (!selected || selected.status !== 'draft') return;
    setEditing(true);
    setShowForm(true);
    setExpenseDate(selected.expense_date);
    setAmount(String(selected.amount));
    setCurrency(selected.currency);
    setCategoryId(selected.category_id);
    setPayee(selected.payee || '');
    setPaymentMethod(selected.payment_method);
    setBankAccountId(selected.bank_account_id || '');
    setBankReference(selected.bank_reference || '');
    setNotes(selected.notes || '');
  };

  const createExpense = async (post: boolean) => {
    if (!categoryId) {
      toast.error('Select a category.');
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter a valid amount.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('create_expense', {
      p_expense_date: expenseDate,
      p_amount: value,
      p_currency: selectedCurrency,
      p_category_id: categoryId,
      p_payee: payee || null,
      p_payment_method: paymentMethod,
      p_bank_account_id: bankAccountId || null,
      p_bank_reference: bankReference || null,
      p_notes: notes || null,
      p_post: post,
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    const expenseId = data ? String(data) : null;
    const files = pendingFiles;
    let attachError: string | null = null;
    let attached = 0;
    if (expenseId && files.length > 0 && attachmentsReady) {
      const result = await uploadExpenseAttachments(expenseId, files);
      attached = result.attached;
      attachError = result.error;
    }
    setBusy(false);
    const saved = post ? 'Expense posted' : 'Expense saved as draft';
    if (attachError) {
      toast.error(`${saved}, but not every file was attached (${attached}/${files.length}). ${attachError}`);
    } else if (files.length > 0 && !attachmentsReady) {
      toast.warning(`${saved}. Attachments are not available yet, so files were not uploaded.`);
    } else {
      toast.success(attached ? `${saved} with ${attached} attachment${attached === 1 ? '' : 's'}.` : `${saved}.`);
    }
    resetForm();
    await load();
    if (expenseId) setSelectedId(expenseId);
  };

  const saveUpdate = async () => {
    if (!selected || selected.status !== 'draft') return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter a valid amount.');
      return;
    }
    if (!categoryId) {
      toast.error('Select a category.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('update_expense', {
      p_expense_id: selected.id,
      p_expense_date: expenseDate,
      p_amount: value,
      p_currency: selectedCurrency,
      p_category_id: categoryId,
      p_payee: payee,
      p_payment_method: paymentMethod,
      p_bank_account_id: bankAccountId || null,
      p_clear_bank_account: !bankAccountId,
      p_bank_reference: bankReference,
      p_notes: notes,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Expense updated.');
    resetForm();
    await load();
    setSelectedId(selected.id);
  };

  const postExpense = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('post_expense', { p_expense_id: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Expense posted.');
    await load();
    setSelectedId(id);
  };

  const cancelExpense = async (id: string) => {
    if (!window.confirm('Cancel this expense?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('cancel_expense', { p_expense_id: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Expense cancelled.');
    await load();
    setSelectedId(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Record and post operating expenses. Payroll is out of scope for this module.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={loading || exporting || busy || invalidReportRange} onClick={() => void exportExpenses()}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? 'Exporting expenses…' : 'Export Excel'}
          </Button>
          <Button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New expense
          </Button>
        </div>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editing ? 'Edit draft expense' : 'New expense'}</CardTitle>
            <CardDescription>
              {editing ? 'Update draft fields, then post when ready.' : 'Save as draft or post immediately.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedCurrency} onChange={(e) => setCurrency(e.target.value)}>
                  {!financeSettings.enabled_currencies.includes(selectedCurrency) && <option value={selectedCurrency}>{selectedCurrency} (existing)</option>}
                  {financeSettings.enabled_currencies.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Select category</option>
                  {categories.filter((row) => row.is_active || (editing && row.id === categoryId)).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Vendor / payee</Label>
                <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Who was paid" />
              </div>
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as ExpensePaymentMethod)}
                >
                  {METHODS.map((row) => (
                    <option key={row.value} value={row.value}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Bank reference</Label>
                <Input value={bankReference} onChange={(e) => setBankReference(e.target.value)} placeholder="Optional" />
              </div>
              {banks.length > 0 ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Bank account (optional)</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                  >
                    <option value="">None</option>
                    {banks.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            {attachmentsReady ? (
              editing && selected ? (
                <ExpenseAttachmentsPanel
                  expenseId={selected.id}
                  expenseStatus={selected.status}
                  attachments={attachmentsFor(selected.id)}
                  onChanged={() => loadAttachments(expenses.map((row) => row.id))}
                />
              ) : (
                <PendingExpenseAttachments files={pendingFiles} onChange={setPendingFiles} disabled={busy} />
              )
            ) : null}
            <div className="flex flex-wrap gap-2">
              {editing ? (
                <Button type="button" disabled={busy} onClick={() => void saveUpdate()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save changes
                </Button>
              ) : (
                <>
                  <Button type="button" disabled={busy} onClick={() => void createExpense(false)}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save draft
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => void createExpense(true)}>
                    <CheckCircle2 className="h-4 w-4" />
                    Post now
                  </Button>
                </>
              )}
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Expense report</CardTitle>
          <CardDescription>Set filters, then export every matching expense. Amounts keep their original currency.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="expense-report-from">From date</Label>
              <Input id="expense-report-from" type="date" value={reportFilters.from} max={reportFilters.to || undefined} disabled={exporting} onChange={(event) => updateReportFilter('from', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-report-to">To date</Label>
              <Input id="expense-report-to" type="date" value={reportFilters.to} min={reportFilters.from || undefined} disabled={exporting} onChange={(event) => updateReportFilter('to', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-report-currency">Report currency</Label>
              <select id="expense-report-currency" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reportFilters.currency} disabled={exporting} onChange={(event) => updateReportFilter('currency', event.target.value)}>
                <option value="">All currencies</option>
                {reportCurrencies.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-report-category">Report category</Label>
              <select id="expense-report-category" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reportFilters.categoryId} disabled={exporting} onChange={(event) => updateReportFilter('categoryId', event.target.value)}>
                <option value="">All categories</option>
                {categories.map((row) => <option key={row.id} value={row.id}>{row.name}{row.is_active ? '' : ' (inactive)'}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-report-status">Report status</Label>
              <select id="expense-report-status" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reportFilters.status} disabled={exporting} onChange={(event) => updateReportFilter('status', event.target.value as ExpenseReportFilters['status'])}>
                <option value="all">All statuses</option>
                <option value="posted">Posted</option>
                <option value="draft">Draft</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 space-y-1.5 sm:min-w-64">
              <Label htmlFor="expense-report-search">Search expenses</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="expense-report-search" value={reportFilters.query} disabled={exporting} onChange={(event) => updateReportFilter('query', event.target.value)} placeholder="Search number, payee, category, notes or receipt" className="pl-10" />
              </div>
            </div>
            <Button type="button" variant="ghost" disabled={exporting} onClick={() => setReportFilters({ ...DEFAULT_EXPENSE_REPORT_FILTERS })}>Clear filters</Button>
          </div>
          {invalidReportRange ? <p role="alert" className="text-sm text-destructive">From date must be on or before To date.</p> : null}
          <p className="text-xs text-muted-foreground">{loading ? 'Loading recent expenses…' : `Showing ${filtered.length} matches from the latest ${expenses.length} expenses.`} Excel includes all matching expenses, including older records.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="h-5 w-5" />
              Expenses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {filtered.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-3 text-left text-sm transition hover:border-primary/40 ${
                  selectedId === row.id ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold">{row.expense_number}</span>
                  <span className="flex items-center gap-2">
                    <ExpenseAttachmentCount count={attachmentsFor(row.id).length} />
                    <Badge className={statusBadge[row.status]}>{row.status}</Badge>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {categoryName(row.category_id)} · {row.expense_date} · {money(row.amount, row.currency)}
                  {row.payee ? ` · ${row.payee}` : ''}
                </p>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{loading ? 'Loading expenses…' : 'No matching expenses in the recent list.'}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detail</CardTitle>
            <CardDescription>Post drafts when payment is confirmed. Cancel if entered in error.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Select an expense.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge className={statusBadge[selected.status]}>{selected.status}</Badge>
                  <Badge variant="outline">{selected.payment_method.replaceAll('_', ' ')}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="mt-1 text-lg font-semibold">{money(selected.amount, selected.currency)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="mt-1 text-lg font-semibold">{categoryName(selected.category_id)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="mt-1 font-medium">{selected.expense_date}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Payee</p>
                    <p className="mt-1 font-medium">{selected.payee || '—'}</p>
                  </div>
                </div>
                {selected.bank_reference ? (
                  <p className="text-sm text-muted-foreground">Ref: {selected.bank_reference}</p>
                ) : null}
                {selected.notes ? <p className="text-sm">{selected.notes}</p> : null}
                {attachmentsReady ? (
                  <ExpenseAttachmentsPanel
                    expenseId={selected.id}
                    expenseStatus={selected.status}
                    attachments={attachmentsFor(selected.id)}
                    onChanged={() => loadAttachments(expenses.map((row) => row.id))}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                    Invoice and receipt attachments will appear here once the expense attachments database update is applied.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {selected.status === 'draft' ? (
                    <>
                      <Button type="button" size="sm" disabled={busy} onClick={() => void postExpense(selected.id)}>
                        <CheckCircle2 className="h-4 w-4" />
                        Post
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={fillFromSelected}>
                        Edit
                      </Button>
                    </>
                  ) : null}
                  {selected.status !== 'cancelled' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => void cancelExpense(selected.id)}
                    >
                      <XCircle className="h-4 w-4" />
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

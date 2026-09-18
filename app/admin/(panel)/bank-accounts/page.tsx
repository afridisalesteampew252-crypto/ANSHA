'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, CheckCircle2, Download, Loader2, Plus, Search, Upload, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { bankCsvTemplate, parseBankTransactionsCsv } from '@/lib/bank-csv';
import { supabase } from '@/lib/supabase/client';
import type {
  BankAccount,
  BankFeedConnection,
  BankFeedStatus,
  BankTransaction,
  BankTxnDirection,
} from '@/lib/types';

const money = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

const emptyAccountForm = {
  name: '',
  bank_name: '',
  currency: 'AED',
  iban: '',
  account_number: '',
  opening_balance: '0',
  opening_balance_date: new Date().toISOString().slice(0, 10),
  notes: '',
  is_active: true,
};

const emptyTxnForm = {
  txn_date: new Date().toISOString().slice(0, 10),
  amount: '',
  direction: 'in' as BankTxnDirection,
  description: '',
  reference: '',
};

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [txnFilter, setTxnFilter] = useState<'all' | 'unreconciled' | 'reconciled' | 'in' | 'out'>('all');
  const [busy, setBusy] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [showTxnForm, setShowTxnForm] = useState(false);
  const [txnForm, setTxnForm] = useState(emptyTxnForm);
  const [isAccountAdmin, setIsAccountAdmin] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [feedConnections, setFeedConnections] = useState<BankFeedConnection[]>([]);
  const [feedLabel, setFeedLabel] = useState('');
  const [feedStatus, setFeedStatus] = useState<BankFeedStatus>('manual');
  const [feedNotes, setFeedNotes] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);

  const loadAccounts = useCallback(async () => {
    const [{ data, error }, sessionRes] = await Promise.all([
      supabase.from('bank_accounts').select('*').order('created_at', { ascending: false }),
      supabase.auth.getSession(),
    ]);
    if (error) {
      toast.error(error.message);
      return;
    }
    const uid = sessionRes.data.session?.user?.id;
    if (uid) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', uid).maybeSingle();
      setIsAccountAdmin(prof?.role === 'admin');
    }
    const rows = (data || []) as BankAccount[];
    setAccounts(rows);
    const nextBalances: Record<string, number> = {};
    await Promise.all(
      rows.map(async (row) => {
        const { data: bal, error: balErr } = await supabase.rpc('get_bank_account_balance', {
          p_account_id: row.id,
        });
        if (!balErr) nextBalances[row.id] = Number(bal || 0);
      })
    );
    setBalances(nextBalances);
  }, []);

  const loadTransactions = useCallback(async (accountId: string) => {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('bank_account_id', accountId)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) toast.error(error.message);
    setTransactions((data || []) as BankTransaction[]);
  }, []);

  const loadFeedConnections = useCallback(async () => {
    const { data, error } = await supabase
      .from('bank_feed_connections')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setFeedConnections((data || []) as BankFeedConnection[]);
  }, []);

  useEffect(() => {
    void loadAccounts();
    void loadFeedConnections();
  }, [loadAccounts, loadFeedConnections]);

  useEffect(() => {
    if (selectedId) void loadTransactions(selectedId);
    else setTransactions([]);
  }, [selectedId, loadTransactions]);

  const selected = accounts.find((row) => row.id === selectedId) || null;

  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((row) =>
      [row.account_code, row.name, row.bank_name, row.iban, row.account_number, row.currency]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [accounts, query]);

  const filteredTxns = useMemo(() => {
    return transactions.filter((row) => {
      if (txnFilter === 'unreconciled') return !row.is_reconciled;
      if (txnFilter === 'reconciled') return row.is_reconciled;
      if (txnFilter === 'in' || txnFilter === 'out') return row.direction === txnFilter;
      return true;
    });
  }, [transactions, txnFilter]);

  const startCreateAccount = () => {
    if (!isAccountAdmin) {
      toast.error('Only an account administrator can create bank accounts.');
      return;
    }
    setEditingAccountId(null);
    setAccountForm(emptyAccountForm);
    setShowAccountForm(true);
  };

  const startEditAccount = (account: BankAccount) => {
    setEditingAccountId(account.id);
    setAccountForm({
      name: account.name,
      bank_name: account.bank_name,
      currency: account.currency,
      iban: account.iban || '',
      account_number: account.account_number || '',
      opening_balance: String(account.opening_balance ?? 0),
      opening_balance_date: account.opening_balance_date || new Date().toISOString().slice(0, 10),
      notes: account.notes || '',
      is_active: account.is_active,
    });
    setShowAccountForm(true);
    setSelectedId(account.id);
  };

  const submitAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountForm.name.trim() || !accountForm.bank_name.trim()) {
      toast.error('Name and bank are required.');
      return;
    }
    if (!accountForm.iban.trim() && !accountForm.account_number.trim()) {
      toast.error('Provide an IBAN or account number.');
      return;
    }
    setBusy(true);
    try {
      if (editingAccountId) {
        const { error } = await supabase.rpc('update_bank_account', {
          p_account_id: editingAccountId,
          p_name: accountForm.name.trim(),
          p_bank_name: accountForm.bank_name.trim(),
          p_currency: accountForm.currency,
          p_iban: accountForm.iban.trim() || null,
          p_account_number: accountForm.account_number.trim() || null,
          p_opening_balance: Number(accountForm.opening_balance || 0),
          p_opening_balance_date: accountForm.opening_balance_date || null,
          p_notes: accountForm.notes.trim() || null,
          p_is_active: accountForm.is_active,
        });
        if (error) throw error;
        toast.success('Bank account updated.');
      } else {
        const { data, error } = await supabase.rpc('create_bank_account', {
          p_name: accountForm.name.trim(),
          p_bank_name: accountForm.bank_name.trim(),
          p_currency: accountForm.currency,
          p_iban: accountForm.iban.trim() || null,
          p_account_number: accountForm.account_number.trim() || null,
          p_opening_balance: Number(accountForm.opening_balance || 0),
          p_opening_balance_date: accountForm.opening_balance_date || null,
          p_notes: accountForm.notes.trim() || null,
          p_is_active: accountForm.is_active,
        });
        if (error) throw error;
        toast.success('Bank account created.');
        if (data) setSelectedId(String(data));
      }
      setShowAccountForm(false);
      setEditingAccountId(null);
      setAccountForm(emptyAccountForm);
      await loadAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save account.');
    } finally {
      setBusy(false);
    }
  };

  const submitTxn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    if (Number(txnForm.amount) <= 0) {
      toast.error('Amount must be positive.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('create_bank_transaction', {
        p_bank_account_id: selectedId,
        p_txn_date: txnForm.txn_date,
        p_amount: Number(txnForm.amount),
        p_direction: txnForm.direction,
        p_description: txnForm.description.trim() || null,
        p_reference: txnForm.reference.trim() || null,
        p_remittance_id: null,
        p_supplier_payment_id: null,
        p_expense_id: null,
      });
      if (error) throw error;
      toast.success('Transaction recorded.');
      setTxnForm(emptyTxnForm);
      setShowTxnForm(false);
      await Promise.all([loadTransactions(selectedId), loadAccounts()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save transaction.');
    } finally {
      setBusy(false);
    }
  };

  const toggleReconciled = async (txn: BankTransaction) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('set_bank_transaction_reconciled', {
        p_txn_id: txn.id,
        p_reconciled: !txn.is_reconciled,
      });
      if (error) throw error;
      toast.success(txn.is_reconciled ? 'Marked unreconciled.' : 'Marked reconciled.');
      if (selectedId) await loadTransactions(selectedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update reconciliation.');
    } finally {
      setBusy(false);
    }
  };

  const downloadCsvTemplate = () => {
    const blob = new Blob([bankCsvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bank-transactions-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvFile = async (file: File | null) => {
    if (!file || !selectedId) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseBankTransactionsCsv(text);
      if (parsed.errors.length && parsed.rows.length === 0) {
        toast.error(parsed.errors[0]);
        return;
      }
      if (parsed.rows.length === 0) {
        toast.error('No valid rows found in CSV.');
        return;
      }
      const payload = parsed.rows.map((row) => ({
        txn_date: row.txn_date,
        amount: row.amount,
        direction: row.direction,
        description: row.description,
        reference: row.reference,
      }));
      const { data, error } = await supabase.rpc('import_bank_transactions_stub', {
        p_bank_account_id: selectedId,
        p_rows: payload,
      });
      if (error) throw error;
      const inserted = Number(data || 0);
      if (parsed.errors.length) {
        toast.warning(`Imported ${inserted} row(s); ${parsed.errors.length} row(s) skipped.`);
      } else {
        toast.success(`Imported ${inserted} transaction(s).`);
      }
      setShowCsvImport(false);
      await Promise.all([loadTransactions(selectedId), loadAccounts()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'CSV import failed.');
    } finally {
      setBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const addFeedPlaceholder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!feedLabel.trim()) {
      toast.error('Label is required.');
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('bank_feed_connections').insert({
        label: feedLabel.trim(),
        status: feedStatus,
        bank_account_id: selectedId,
        provider: null,
        notes: feedNotes.trim() || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
      toast.success('Feed placeholder saved (not a live bank link).');
      setFeedLabel('');
      setFeedNotes('');
      setFeedStatus('manual');
      await loadFeedConnections();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save feed placeholder.');
    } finally {
      setBusy(false);
    }
  };

  const accountNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of accounts) map[row.id] = row.name;
    return map;
  }, [accounts]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold">Bank accounts</h1>
          <p className="text-sm text-muted-foreground">
            Ops ledger for company accounts, manual movements, CSV import, and reconciliation.
            Not live Open Banking (see docs/Banking-Integrations.md). Public remittance details stay on{' '}
            <a href="/banking" className="text-primary underline-offset-2 hover:underline">/banking</a>.
          </p>
        </div>
        {isAccountAdmin ? (
          <Button onClick={startCreateAccount}>
            <Plus className="h-4 w-4" />
            New account
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bank feeds (coming)</CardTitle>
          <CardDescription>
            Placeholders only (manual or pending_provider). No OAuth or live bank sync until a licensed provider is contracted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addFeedPlaceholder} className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="feed-label">Label</Label>
              <Input
                id="feed-label"
                placeholder="e.g. Emirates NBD operating — CSV for now"
                value={feedLabel}
                onChange={(e) => setFeedLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feed-status">Status</Label>
              <select
                id="feed-status"
                value={feedStatus}
                onChange={(e) => setFeedStatus(e.target.value as BankFeedStatus)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="manual">manual</option>
                <option value="pending_provider">pending_provider</option>
              </select>
            </div>
            <div className="space-y-1.5 flex items-end">
              <Button type="submit" variant="outline" disabled={busy} className="w-full">
                Add placeholder
              </Button>
            </div>
            <div className="space-y-1.5 md:col-span-4">
              <Label htmlFor="feed-notes">Notes</Label>
              <Input
                id="feed-notes"
                placeholder="Optional — linked to selected account when one is selected"
                value={feedNotes}
                onChange={(e) => setFeedNotes(e.target.value)}
              />
            </div>
          </form>
          <div className="space-y-2">
            {feedConnections.map((feed) => (
              <div key={feed.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{feed.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {feed.bank_account_id
                      ? accountNameById[feed.bank_account_id] || feed.bank_account_id
                      : 'No account linked'}
                    {feed.notes ? ` · ${feed.notes}` : ''}
                  </p>
                </div>
                <Badge variant="secondary" className={feed.status === 'manual' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}>
                  {feed.status}
                </Badge>
              </div>
            ))}
            {feedConnections.length === 0 && (
              <p className="text-sm text-muted-foreground">No feed placeholders yet. Use CSV import on an account for real data today.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Accounts</p>
            <p className="mt-1 text-2xl font-bold">{accounts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="mt-1 text-2xl font-bold">{accounts.filter((row) => row.is_active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Selected balance</p>
            <p className="mt-1 text-2xl font-bold">
              {selected ? money(balances[selected.id] ?? 0, selected.currency) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {showAccountForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editingAccountId ? 'Edit bank account' : 'New bank account'}</CardTitle>
            <CardDescription>Opening balance seeds the ledger; subsequent rows are manual in/out transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitAccount} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ba-name">Account name *</Label>
                <Input id="ba-name" required value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ba-bank">Bank *</Label>
                <Input id="ba-bank" required value={accountForm.bank_name} onChange={(e) => setAccountForm({ ...accountForm, bank_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ba-currency">Currency</Label>
                <select
                  id="ba-currency"
                  value={accountForm.currency}
                  onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option>AED</option>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                  <option>JPY</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ba-iban">IBAN</Label>
                <Input id="ba-iban" value={accountForm.iban} onChange={(e) => setAccountForm({ ...accountForm, iban: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ba-acct">Account number</Label>
                <Input id="ba-acct" value={accountForm.account_number} onChange={(e) => setAccountForm({ ...accountForm, account_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ba-open">Opening balance</Label>
                <Input
                  id="ba-open"
                  type="number"
                  step="0.01"
                  value={accountForm.opening_balance}
                  onChange={(e) => setAccountForm({ ...accountForm, opening_balance: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ba-open-date">Opening balance date</Label>
                <Input
                  id="ba-open-date"
                  type="date"
                  value={accountForm.opening_balance_date}
                  onChange={(e) => setAccountForm({ ...accountForm, opening_balance_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={accountForm.is_active}
                    onChange={(e) => setAccountForm({ ...accountForm, is_active: e.target.checked })}
                  />
                  Active
                </label>
              </div>
              <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
                <Label htmlFor="ba-notes">Notes</Label>
                <Textarea id="ba-notes" rows={2} value={accountForm.notes} onChange={(e) => setAccountForm({ ...accountForm, notes: e.target.value })} />
              </div>
              <div className="flex items-center gap-3 md:col-span-2 xl:col-span-3">
                <Button disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                  {editingAccountId ? 'Update account' : 'Create account'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAccountForm(false);
                    setEditingAccountId(null);
                    setAccountForm(emptyAccountForm);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-lg">Accounts</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search code, name, bank, IBAN…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredAccounts.map((account) => {
              const active = account.id === selectedId;
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setSelectedId(account.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    active ? 'border-accent bg-accent/5' : 'hover:bg-secondary/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{account.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {account.account_code} · {account.bank_name}
                      </p>
                    </div>
                    <Badge variant="secondary" className={account.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}>
                      {account.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium">{money(balances[account.id] ?? 0, account.currency)}</p>
                  <p className="text-xs text-muted-foreground">{account.iban || account.account_number || 'No identity'}</p>
                </button>
              );
            })}
            {filteredAccounts.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Wallet className="mx-auto mb-2 h-8 w-8" />
                No bank accounts yet.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!selected ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                Select an account to view ledger transactions and reconcile.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">{selected.name}</CardTitle>
                    <CardDescription>
                      {selected.account_code} · Opening {money(selected.opening_balance, selected.currency)}
                      {selected.opening_balance_date ? ` on ${selected.opening_balance_date}` : ''}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEditAccount(selected)}>
                      Edit account
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowCsvImport((v) => !v);
                        setShowTxnForm(false);
                      }}
                    >
                      <Upload className="h-4 w-4" />
                      Import CSV
                    </Button>
                    <Button size="sm" onClick={() => { setTxnForm(emptyTxnForm); setShowTxnForm(true); setShowCsvImport(false); }}>
                      <Plus className="h-4 w-4" />
                      Add transaction
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Bank:</span> {selected.bank_name}</p>
                  <p><span className="text-muted-foreground">Currency:</span> {selected.currency}</p>
                  <p><span className="text-muted-foreground">IBAN:</span> {selected.iban || '—'}</p>
                  <p><span className="text-muted-foreground">Account no:</span> {selected.account_number || '—'}</p>
                  <p className="sm:col-span-2">
                    <span className="text-muted-foreground">Ledger balance:</span>{' '}
                    <span className="font-semibold">{money(balances[selected.id] ?? 0, selected.currency)}</span>
                  </p>
                </CardContent>
              </Card>

              {showCsvImport && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Import CSV</CardTitle>
                    <CardDescription>
                      Columns: date, amount, description, reference. Positive amount = in; negative = out.
                      Uses import_bank_transactions_stub — not a live bank feed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-3">
                    <input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => void handleCsvFile(e.target.files?.[0] ?? null)}
                    />
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => csvInputRef.current?.click()}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Choose CSV file
                    </Button>
                    <Button type="button" variant="outline" onClick={downloadCsvTemplate}>
                      <Download className="h-4 w-4" />
                      Download template
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setShowCsvImport(false)}>
                      Cancel
                    </Button>
                  </CardContent>
                </Card>
              )}

              {showTxnForm && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Manual transaction</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={submitTxn} className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="txn-date">Date</Label>
                        <Input id="txn-date" type="date" value={txnForm.txn_date} onChange={(e) => setTxnForm({ ...txnForm, txn_date: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="txn-dir">Direction</Label>
                        <select
                          id="txn-dir"
                          value={txnForm.direction}
                          onChange={(e) => setTxnForm({ ...txnForm, direction: e.target.value as BankTxnDirection })}
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="in">In (credit)</option>
                          <option value="out">Out (debit)</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="txn-amount">Amount *</Label>
                        <Input
                          id="txn-amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          value={txnForm.amount}
                          onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="txn-ref">Reference</Label>
                        <Input id="txn-ref" value={txnForm.reference} onChange={(e) => setTxnForm({ ...txnForm, reference: e.target.value })} />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="txn-desc">Description</Label>
                        <Input id="txn-desc" value={txnForm.description} onChange={(e) => setTxnForm({ ...txnForm, description: e.target.value })} />
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <Button disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save transaction</Button>
                        <Button type="button" variant="outline" onClick={() => setShowTxnForm(false)}>Cancel</Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              <Card className="overflow-hidden">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">Transactions</CardTitle>
                  <select
                    value={txnFilter}
                    onChange={(e) => setTxnFilter(e.target.value as typeof txnFilter)}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="all">All</option>
                    <option value="unreconciled">Unreconciled</option>
                    <option value="reconciled">Reconciled</option>
                    <option value="in">In only</option>
                    <option value="out">Out only</option>
                  </select>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="p-3">Txn</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Description</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTxns.map((txn) => (
                        <tr key={txn.id} className="border-t align-top">
                          <td className="p-3 font-medium">{txn.txn_number}</td>
                          <td className="p-3">
                            {txn.txn_date}
                            {txn.reference ? <p className="text-xs text-muted-foreground">{txn.reference}</p> : null}
                          </td>
                          <td className="p-3">
                            <span className="capitalize text-muted-foreground">{txn.direction}</span>
                            {txn.description ? <p>{txn.description}</p> : null}
                          </td>
                          <td className={`p-3 text-right font-semibold ${txn.direction === 'out' ? 'text-rose-700' : 'text-emerald-700'}`}>
                            {txn.direction === 'out' ? '−' : '+'}
                            {money(txn.amount, selected.currency)}
                          </td>
                          <td className="p-3">
                            <Badge className={txn.is_reconciled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                              {txn.is_reconciled ? 'Reconciled' : 'Open'}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void toggleReconciled(txn)}>
                              <CheckCircle2 className="h-4 w-4" />
                              {txn.is_reconciled ? 'Unreconcile' : 'Reconcile'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {filteredTxns.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-10 text-center text-muted-foreground">
                            No transactions for this filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

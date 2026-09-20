'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookMarked, CheckCircle2, Loader2, Plus, Search, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import type { GlAccount, GlAccountType, GlJournal, GlJournalLine, GlJournalStatus } from '@/lib/types';

type LineDraft = { account_id: string; description: string; debit: string; credit: string };

const money = (value: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));

const statusBadge: Record<GlJournalStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  posted: 'bg-emerald-100 text-emerald-800',
  reversed: 'bg-zinc-200 text-zinc-700',
};

const ACCOUNT_TYPES: { value: GlAccountType; label: string }[] = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
];

const emptyLine = (): LineDraft => ({ account_id: '', description: '', debit: '', credit: '' });

export default function LedgerPage() {
  const [accounts, setAccounts] = useState<GlAccount[]>([]);
  const [journals, setJournals] = useState<GlJournal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lines, setLines] = useState<GlJournalLine[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [isAccountAdmin, setIsAccountAdmin] = useState(false);

  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [draftLines, setDraftLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);

  const [acctCode, setAcctCode] = useState('');
  const [acctName, setAcctName] = useState('');
  const [acctType, setAcctType] = useState<GlAccountType>('expense');
  const [acctDesc, setAcctDesc] = useState('');
  const [acctSort, setAcctSort] = useState('100');
  const [editAccountId, setEditAccountId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [acctRes, jeRes, sessionRes] = await Promise.all([
      supabase.from('gl_accounts').select('*').order('sort_order').order('code'),
      supabase.from('gl_journals').select('*').order('entry_date', { ascending: false }).limit(150),
      supabase.auth.getSession(),
    ]);
    if (acctRes.error) toast.error(acctRes.error.message);
    if (jeRes.error) toast.error(jeRes.error.message);
    setAccounts((acctRes.data || []) as GlAccount[]);
    setJournals((jeRes.data || []) as GlJournal[]);
    const uid = sessionRes.data.session?.user?.id;
    if (uid) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', uid).maybeSingle();
      setIsAccountAdmin(prof?.role === 'admin');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = journals.find((row) => row.id === selectedId) || null;
  const accountLabel = (id: string) => {
    const row = accounts.find((a) => a.id === id);
    return row ? `${row.code} — ${row.name}` : id.slice(0, 8);
  };

  const filteredJournals = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return journals;
    return journals.filter((row) =>
      [row.journal_number, row.status, row.description, row.currency].some((value) => value?.toLowerCase().includes(q))
    );
  }, [journals, query]);

  const openJournal = async (id: string) => {
    setSelectedId(id);
    const { data, error } = await supabase
      .from('gl_journal_lines')
      .select('*')
      .eq('journal_id', id)
      .order('line_no');
    if (error) toast.error(error.message);
    setLines((data || []) as GlJournalLine[]);
  };

  const draftTotals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const line of draftLines) {
      debit += Number(line.debit || 0);
      credit += Number(line.credit || 0);
    }
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 && debit > 0 };
  }, [draftLines]);

  const resetJournalForm = () => {
    setShowJournalForm(false);
    setEntryDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setCurrency('AED');
    setDraftLines([emptyLine(), emptyLine()]);
  };

  const resetAccountForm = () => {
    setShowAccountForm(false);
    setEditAccountId(null);
    setAcctCode('');
    setAcctName('');
    setAcctType('expense');
    setAcctDesc('');
    setAcctSort('100');
  };

  const createJournal = async () => {
    const payload = draftLines
      .map((line) => ({
        account_id: line.account_id,
        description: line.description.trim() || null,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      }))
      .filter((line) => line.account_id && (line.debit > 0 || line.credit > 0));

    if (payload.length < 2) {
      toast.error('Add at least two lines with amounts');
      return;
    }
    if (!draftTotals.balanced) {
      toast.error('Debits must equal credits before save');
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.rpc('create_gl_journal', {
      p_entry_date: entryDate,
      p_description: description.trim() || null,
      p_lines: payload,
      p_currency: currency.trim().toUpperCase() || 'AED',
      p_source_module: 'manual',
      p_source_id: null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Draft journal created');
    resetJournalForm();
    await load();
    if (data) void openJournal(data as string);
  };

  const postJournal = async () => {
    if (!selected || selected.status !== 'draft') return;
    setBusy(true);
    const { error } = await supabase.rpc('post_gl_journal', { p_journal_id: selected.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Journal posted');
    await load();
    void openJournal(selected.id);
  };

  const reverseJournal = async () => {
    if (!selected || selected.status !== 'posted') return;
    setBusy(true);
    const { data, error } = await supabase.rpc('reverse_gl_journal', {
      p_journal_id: selected.id,
      p_entry_date: new Date().toISOString().slice(0, 10),
      p_description: null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Journal reversed');
    await load();
    if (data) void openJournal(data as string);
  };

  const deleteDraft = async () => {
    if (!selected || selected.status !== 'draft') return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_draft_gl_journal', { p_journal_id: selected.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Draft deleted');
    setSelectedId(null);
    setLines([]);
    await load();
  };

  const saveAccount = async () => {
    if (!acctCode.trim() || !acctName.trim()) {
      toast.error('Code and name are required');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('upsert_gl_account', {
      p_code: acctCode.trim(),
      p_name: acctName.trim(),
      p_account_type: acctType,
      p_description: acctDesc.trim() || null,
      p_is_active: true,
      p_sort_order: Number(acctSort || 0),
      p_id: editAccountId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editAccountId ? 'Account updated' : 'Account created');
    resetAccountForm();
    await load();
  };

  const startEditAccount = (row: GlAccount) => {
    setEditAccountId(row.id);
    setAcctCode(row.code);
    setAcctName(row.name);
    setAcctType(row.account_type);
    setAcctDesc(row.description || '');
    setAcctSort(String(row.sort_order));
    setShowAccountForm(true);
  };

  const toggleAccountActive = async (row: GlAccount) => {
    setBusy(true);
    const { error } = await supabase.rpc('upsert_gl_account', {
      p_code: row.code,
      p_name: row.name,
      p_account_type: row.account_type,
      p_description: row.description,
      p_is_active: !row.is_active,
      p_sort_order: row.sort_order,
      p_id: row.id,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    await load();
  };

  const activeAccounts = accounts.filter((row) => row.is_active);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold">General ledger</h1>
          <p className="text-sm text-muted-foreground">
            Chart of accounts and manual journals. Statements live on{' '}
            <Link href="/admin/reports/financial" className="text-primary underline">
              Financial statements
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/reports/financial">P&amp;L / Balance sheet</Link>
          </Button>
          <Button onClick={() => setShowJournalForm(true)}>
            <Plus className="h-4 w-4" />
            New journal
          </Button>
        </div>
      </div>

      <Tabs defaultValue="journals">
        <TabsList>
          <TabsTrigger value="journals">Journals</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="journals" className="space-y-4">
          {showJournalForm && (
            <Card>
              <CardHeader>
                <CardTitle>New journal entry</CardTitle>
                <CardDescription>Draft must balance before post. At least two lines.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Entry date</Label>
                    <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
                    <Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
                  </div>
                  <div className="space-y-1.5 md:col-span-3">
                    <Label>Description</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
                  </div>
                </div>

                <div className="space-y-2">
                  {draftLines.map((line, idx) => (
                    <div key={idx} className="grid gap-2 rounded-md border p-3 md:grid-cols-12">
                      <div className="md:col-span-4">
                        <Label className="text-xs">Account</Label>
                        <select
                          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={line.account_id}
                          onChange={(e) =>
                            setDraftLines((rows) =>
                              rows.map((row, i) => (i === idx ? { ...row, account_id: e.target.value } : row))
                            )
                          }
                        >
                          <option value="">Select account</option>
                          {activeAccounts.map((acct) => (
                            <option key={acct.id} value={acct.id}>
                              {acct.code} — {acct.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-3">
                        <Label className="text-xs">Memo</Label>
                        <Input
                          value={line.description}
                          onChange={(e) =>
                            setDraftLines((rows) =>
                              rows.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row))
                            )
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Debit</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.debit}
                          onChange={(e) =>
                            setDraftLines((rows) =>
                              rows.map((row, i) =>
                                i === idx ? { ...row, debit: e.target.value, credit: e.target.value ? '' : row.credit } : row
                              )
                            )
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Credit</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.credit}
                          onChange={(e) =>
                            setDraftLines((rows) =>
                              rows.map((row, i) =>
                                i === idx ? { ...row, credit: e.target.value, debit: e.target.value ? '' : row.debit } : row
                              )
                            )
                          }
                        />
                      </div>
                      <div className="flex items-end md:col-span-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={draftLines.length <= 2}
                          onClick={() => setDraftLines((rows) => rows.filter((_, i) => i !== idx))}
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setDraftLines((rows) => [...rows, emptyLine()])}>
                    <Plus className="h-4 w-4" />
                    Add line
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className={`text-sm ${draftTotals.balanced ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                    Debit {money(draftTotals.debit, currency || 'AED')} · Credit {money(draftTotals.credit, currency || 'AED')}
                    {draftTotals.balanced ? ' · balanced' : ''}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resetJournalForm}>
                      Cancel
                    </Button>
                    <Button disabled={busy || !draftTotals.balanced} onClick={() => void createJournal()}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save draft
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search journals…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookMarked className="h-4 w-4" />
                  Journals
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[32rem] space-y-2 overflow-y-auto">
                {filteredJournals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No journals yet.</p>
                ) : (
                  filteredJournals.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => void openJournal(row.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-secondary/40 ${
                        selectedId === row.id ? 'border-accent bg-accent/5' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{row.journal_number}</p>
                          <p className="text-xs text-muted-foreground">{row.entry_date}</p>
                          <p className="mt-1 line-clamp-2 text-sm">{row.description || '—'}</p>
                        </div>
                        <Badge className={statusBadge[row.status]}>{row.status}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {money(row.total_debit, row.currency)} / {money(row.total_credit, row.currency)}
                      </p>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{selected ? selected.journal_number : 'Journal detail'}</CardTitle>
                <CardDescription>
                  {selected
                    ? `${selected.entry_date} · ${selected.currency} · ${selected.source_module || 'manual'}`
                    : 'Select a journal to view lines'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selected ? (
                  <p className="text-sm text-muted-foreground">No journal selected.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {selected.status === 'draft' && (
                        <>
                          <Button disabled={busy} onClick={() => void postJournal()}>
                            <CheckCircle2 className="h-4 w-4" />
                            Post
                          </Button>
                          <Button variant="outline" disabled={busy} onClick={() => void deleteDraft()}>
                            <Trash2 className="h-4 w-4" />
                            Delete draft
                          </Button>
                        </>
                      )}
                      {selected.status === 'posted' && isAccountAdmin && (
                        <Button variant="outline" disabled={busy} onClick={() => void reverseJournal()}>
                          <XCircle className="h-4 w-4" />
                          Reverse
                        </Button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="p-2">#</th>
                            <th className="p-2">Account</th>
                            <th className="p-2">Memo</th>
                            <th className="p-2 text-right">Debit</th>
                            <th className="p-2 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line) => (
                            <tr key={line.id} className="border-t">
                              <td className="p-2">{line.line_no}</td>
                              <td className="p-2">{accountLabel(line.account_id)}</td>
                              <td className="p-2 text-muted-foreground">{line.description || '—'}</td>
                              <td className="p-2 text-right">{line.debit > 0 ? money(line.debit, selected.currency) : ''}</td>
                              <td className="p-2 text-right">{line.credit > 0 ? money(line.credit, selected.currency) : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-4">
          {isAccountAdmin ? (
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  resetAccountForm();
                  setShowAccountForm(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add account
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Chart changes require an account administrator.</p>
          )}

          {showAccountForm && isAccountAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>{editAccountId ? 'Edit account' : 'New account'}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Code</Label>
                  <Input value={acctCode} onChange={(e) => setAcctCode(e.target.value)} placeholder="6100" />
                </div>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={acctName} onChange={(e) => setAcctName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={acctType}
                    onChange={(e) => setAcctType(e.target.value as GlAccountType)}
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Sort order</Label>
                  <Input type="number" value={acctSort} onChange={(e) => setAcctSort(e.target.value)} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Description</Label>
                  <Input value={acctDesc} onChange={(e) => setAcctDesc(e.target.value)} />
                </div>
                <div className="flex gap-2 md:col-span-2">
                  <Button disabled={busy} onClick={() => void saveAccount()}>
                    Save
                  </Button>
                  <Button variant="outline" onClick={resetAccountForm}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Code</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Status</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-3 font-medium">{row.code}</td>
                      <td className="p-3">
                        <p>{row.name}</p>
                        {row.description ? <p className="text-xs text-muted-foreground">{row.description}</p> : null}
                      </td>
                      <td className="p-3 capitalize">{row.account_type}</td>
                      <td className="p-3">{row.is_active ? 'Active' : 'Inactive'}</td>
                      <td className="p-3 text-right">
                        {isAccountAdmin ? (
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => startEditAccount(row)}>
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggleAccountActive(row)}>
                              {row.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

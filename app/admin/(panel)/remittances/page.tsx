'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { RemittanceSubNav } from '@/components/admin/remittance-sub-nav';
import { SearchableSelect, customerSelectOption } from '@/components/admin/searchable-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { canManageReceivables } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type {
  AdminRole,
  Remittance,
  RemittanceAllocation,
  RemittanceDocument,
  RemittanceOffice,
  RemittanceShift,
} from '@/lib/types';

type Customer = {
  id: string;
  full_name: string;
  company_name: string | null;
  customer_code?: string | null;
  phone?: string | null;
  email?: string | null;
};
type Invoice = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_company: string | null;
  currency: string;
  balance_due: number;
  status: string;
};
type Staff = {
  id: string;
  full_name: string | null;
  email: string | null;
  office_id: string | null;
  shift_id: string | null;
};

const emptyForm = {
  customer_id: '',
  invoice_id: '',
  customer_name: '',
  received_date: new Date().toISOString().slice(0, 10),
  amount: '',
  currency: 'AED',
  method: 'bank_transfer',
  bank_reference: '',
  sender_bank: '',
  receiving_bank: 'WIO BANK',
  status: 'pending',
  notes: '',
  received_by: '',
  office_id: '',
  shift_id: '',
};

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency }).format(Number(value || 0));
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export default function RemittancesPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [documents, setDocuments] = useState<RemittanceDocument[]>([]);
  const [allocations, setAllocations] = useState<(RemittanceAllocation & { invoices?: { invoice_number: string } | { invoice_number: string }[] | null })[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [offices, setOffices] = useState<RemittanceOffice[]>([]);
  const [shifts, setShifts] = useState<RemittanceShift[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState<File[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [unknownCount, setUnknownCount] = useState(0);
  const [allocRemittanceId, setAllocRemittanceId] = useState('');
  const [allocInvoiceId, setAllocInvoiceId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');

  const finance = canManageReceivables(role);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
      if (!canManageReceivables(prof?.role)) return;
    }

    const [remittanceResult, documentResult, allocResult, customerResult, invoiceResult, staffResult, officeResult, shiftResult, unknownResult] =
      await Promise.all([
        supabase.from('remittances').select('*').order('received_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('remittance_documents').select('*').order('created_at'),
        supabase.from('remittance_allocations').select('*, invoices(invoice_number)'),
        supabase.from('customers').select('id,full_name,company_name,customer_code,phone,email').eq('is_active', true).order('company_name').order('full_name'),
        supabase
          .from('invoices')
          .select('id,invoice_number,customer_id,customer_name,customer_company,currency,balance_due,status')
          .gt('balance_due', 0)
          .neq('status', 'cancelled')
          .order('issue_date', { ascending: false }),
        supabase.from('admin_profiles').select('id,full_name,email,office_id,shift_id').eq('is_active', true).order('full_name'),
        supabase.from('remittance_offices').select('*').eq('is_active', true).order('sort_order').order('name'),
        supabase.from('remittance_shifts').select('*').eq('is_active', true).order('sort_order').order('name'),
        supabase.rpc('count_unknown_remittances'),
      ]);
    if (remittanceResult.error) setMessage(remittanceResult.error.message);
    setRemittances((remittanceResult.data || []) as Remittance[]);
    setDocuments((documentResult.data || []) as RemittanceDocument[]);
    setAllocations((allocResult.data || []) as typeof allocations);
    setCustomers((customerResult.data || []) as Customer[]);
    setInvoices((invoiceResult.data || []) as Invoice[]);
    setStaff((staffResult.data || []) as Staff[]);
    setOffices((officeResult.data || []) as RemittanceOffice[]);
    setShifts((shiftResult.data || []) as RemittanceShift[]);
    setUnknownCount(Number(unknownResult.data || 0));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allocatedByRemittance = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of allocations) {
      map[row.remittance_id] = (map[row.remittance_id] || 0) + Number(row.amount);
    }
    return map;
  }, [allocations]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFiles([]);
    setMessage('');
    setOpen(true);
  };

  const startEdit = (item: Remittance) => {
    setEditingId(item.id);
    setForm({
      customer_id: item.customer_id || '',
      invoice_id: item.invoice_id || '',
      customer_name: item.customer_name,
      received_date: item.received_date,
      amount: String(item.amount),
      currency: item.currency,
      method: item.method,
      bank_reference: item.bank_reference || '',
      sender_bank: item.sender_bank || '',
      receiving_bank: item.receiving_bank || '',
      status: item.status === 'unknown' ? 'pending' : item.status,
      notes: item.notes || '',
      received_by: item.received_by || '',
      office_id: item.office_id || '',
      shift_id: item.shift_id || '',
    });
    setFiles([]);
    setMessage('');
    setOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const chooseInvoice = (id: string) => {
    const invoice = invoices.find((item) => item.id === id);
    setForm((current) =>
      invoice
        ? {
            ...current,
            invoice_id: id,
            customer_id: invoice.customer_id || '',
            customer_name: invoice.customer_company || invoice.customer_name,
            currency: invoice.currency,
            amount: String(invoice.balance_due),
          }
        : { ...current, invoice_id: id }
    );
  };

  const chooseCustomer = (id: string) => {
    const customer = customers.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      customer_id: id,
      customer_name: customer ? customer.company_name || customer.full_name : current.customer_name,
      status: current.status === 'unknown' ? 'pending' : current.status,
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const isUnknown = !form.customer_id.trim();
    if (!isUnknown && !form.customer_name.trim()) return setMessage('Customer/sender and a positive amount are required.');
    if (Number(form.amount) <= 0) return setMessage('Amount must be greater than zero.');
    const oversized = files.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) return setMessage(`${oversized.name} exceeds the 25 MB document limit.`);
    setBusy(true);
    setMessage('Saving remittance…');

    const status = isUnknown ? 'unknown' : form.status;
    let remittanceId = editingId;

    if (editingId) {
      const { error } = await supabase
        .from('remittances')
        .update({
          customer_id: form.customer_id || null,
          invoice_id: form.invoice_id || null,
          customer_name: form.customer_name.trim() || form.bank_reference.trim() || 'Unknown TTS',
          received_date: form.received_date,
          amount: Number(form.amount),
          currency: form.currency,
          method: form.method,
          bank_reference: form.bank_reference.trim() || null,
          sender_bank: form.sender_bank.trim() || null,
          receiving_bank: form.receiving_bank.trim() || null,
          status,
          notes: form.notes.trim() || null,
          received_by: form.received_by || null,
          office_id: form.office_id || null,
          shift_id: form.shift_id || null,
          is_unknown: isUnknown,
        })
        .eq('id', editingId);
      if (error) {
        setBusy(false);
        return setMessage(error.message);
      }
    } else {
      const { data, error } = await supabase.rpc('create_remittance', {
        p_customer_id: form.customer_id || null,
        p_invoice_id: form.invoice_id || null,
        p_customer_name: form.customer_name.trim() || form.bank_reference.trim() || 'Unknown TTS',
        p_received_date: form.received_date,
        p_amount: Number(form.amount),
        p_currency: form.currency,
        p_method: form.method,
        p_bank_reference: form.bank_reference.trim(),
        p_sender_bank: form.sender_bank.trim(),
        p_receiving_bank: form.receiving_bank.trim(),
        p_status: status,
        p_notes: form.notes.trim(),
        p_received_by: form.received_by || null,
        p_office_id: form.office_id || null,
        p_shift_id: form.shift_id || null,
      });
      if (error || !data) {
        setBusy(false);
        return setMessage(error?.message || 'Could not save remittance.');
      }
      remittanceId = String(data);
    }

    if (!remittanceId) {
      setBusy(false);
      return setMessage('Could not identify the remittance record.');
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    try {
      if (!user && files.length) throw new Error('Session expired before document upload.');
      for (const file of files) {
        const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
        const path = `${user!.id}/${remittanceId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('remittance-documents').upload(path, file, { cacheControl: '31536000' });
        if (uploadError) throw uploadError;
        const { error: rowError } = await supabase.from('remittance_documents').insert({
          remittance_id: remittanceId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: user!.id,
        });
        if (rowError) throw rowError;
      }
      setMessage(
        editingId
          ? 'Remittance updated.'
          : isUnknown
            ? 'Unknown remittance saved — link customer from Unknown TTS when matched.'
            : form.status === 'confirmed' && form.invoice_id
              ? 'Remittance confirmed and applied to the invoice once.'
              : 'Remittance saved.'
      );
      setForm(emptyForm);
      setFiles([]);
      setEditingId(null);
      setOpen(false);
      await load();
    } catch (uploadError) {
      setMessage(`Money record saved, but a document failed: ${uploadError instanceof Error ? uploadError.message : 'upload error'}`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const viewDocument = async (document: RemittanceDocument) => {
    const { data, error } = await supabase.storage.from('remittance-documents').createSignedUrl(document.storage_path, 300);
    if (error || !data?.signedUrl) return setMessage(error?.message || 'Could not open document.');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const remove = async (item: Remittance) => {
    if (!window.confirm(`Delete ${item.remittance_number}? A linked invoice payment will be reversed. This cannot be undone.`)) return;
    setBusy(true);
    setMessage('Deleting remittance and reversing linked payment…');
    const paths = documents.filter((document) => document.remittance_id === item.id).map((document) => document.storage_path);
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from('remittance-documents').remove(paths);
      if (storageError) {
        setBusy(false);
        return setMessage(`Could not remove private documents: ${storageError.message}`);
      }
    }
    const { error } = await supabase.from('remittances').delete().eq('id', item.id);
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage('Remittance deleted and linked invoice balance recalculated.');
    await load();
  };

  const allocate = async (useRemaining = false) => {
    if (!allocRemittanceId || !allocInvoiceId) {
      toast.error('Choose remittance and invoice.');
      return;
    }
    const rem = remittances.find((r) => r.id === allocRemittanceId);
    const inv = invoices.find((i) => i.id === allocInvoiceId);
    if (!rem || !inv) {
      toast.error('Remittance or invoice not found.');
      return;
    }
    if (rem.customer_id && inv.customer_id && rem.customer_id !== inv.customer_id) {
      toast.error('Invoice and remittance must be for the same customer.');
      return;
    }
    if (rem.currency !== inv.currency) {
      toast.error('Currencies must match.');
      return;
    }
    const available = Number(rem.amount) - (allocatedByRemittance[rem.id] || 0);
    const amount = useRemaining
      ? Math.min(available, Number(inv.balance_due))
      : Number(allocAmount);
    if (!(amount > 0)) {
      toast.error('Amount must be greater than zero.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('allocate_remittance', {
      p_remittance_id: allocRemittanceId,
      p_invoice_id: allocInvoiceId,
      p_amount: amount,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Allocated ${money(amount, rem.currency)} to ${inv.invoice_number}.`);
    setAllocRemittanceId('');
    setAllocInvoiceId('');
    setAllocAmount('');
    await load();
  };

  const reverseAllocation = async (allocationId: string) => {
    if (!window.confirm('Unallocate this payment? Funds return to the remittance pool.')) return;
    setBusy(true);
    const { error } = await supabase.rpc('reverse_remittance_allocation', { p_allocation_id: allocationId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Unallocated — remittance balance restored.');
    await load();
  };

  const totals = useMemo(
    () =>
      remittances
        .filter((item) => item.status === 'confirmed')
        .reduce<Record<string, number>>((sum, item) => ({ ...sum, [item.currency]: (sum[item.currency] || 0) + Number(item.amount) }), {}),
    [remittances]
  );

  const customerOptions = useMemo(() => customers.map(customerSelectOption), [customers]);
  const createInvoiceOptions = useMemo(
    () =>
      invoices.map((item) => ({
        value: item.id,
        label: `${item.invoice_number} — ${item.customer_company || item.customer_name} — ${money(item.balance_due, item.currency)}`,
        keywords: [item.invoice_number, item.customer_company, item.customer_name],
      })),
    [invoices]
  );

  const allocInvoiceOptions = useMemo(() => {
    const rem = remittances.find((r) => r.id === allocRemittanceId);
    const filtered = rem
      ? invoices.filter(
          (item) =>
            (!rem.customer_id || item.customer_id === rem.customer_id) &&
            item.currency === rem.currency
        )
      : invoices;
    return filtered.map((item) => ({
      value: item.id,
      label: `${item.invoice_number} — ${item.customer_company || item.customer_name} — ${money(item.balance_due, item.currency)}`,
      keywords: [item.invoice_number, item.customer_company, item.customer_name],
    }));
  }, [invoices, remittances, allocRemittanceId]);

  const recentAllocations = useMemo(
    () =>
      [...allocations]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 12),
    [allocations]
  );
  const staffOptions = useMemo(
    () =>
      staff.map((u) => ({
        value: u.id,
        label: u.full_name || u.email || u.id.slice(0, 8),
        keywords: [u.full_name, u.email],
      })),
    [staff]
  );
  const officeOptions = useMemo(
    () => offices.map((o) => ({ value: o.id, label: o.code ? `${o.name} (${o.code})` : o.name, keywords: [o.name, o.code] })),
    [offices]
  );
  const shiftOptions = useMemo(() => {
    const filtered = form.office_id ? shifts.filter((s) => !s.office_id || s.office_id === form.office_id) : shifts;
    return filtered.map((s) => ({
      value: s.id,
      label: s.hours_label ? `${s.name} — ${s.hours_label}` : s.name,
      keywords: [s.name, s.hours_label],
    }));
  }, [shifts, form.office_id]);

  const officeLabel = useMemo(() => {
    const map = new Map(offices.map((o) => [o.id, o.name]));
    return (id: string | null) => (id ? map.get(id) || '—' : '—');
  }, [offices]);

  const usableForAlloc = useMemo(
    () =>
      remittances.filter(
        (r) => r.status === 'confirmed' && !r.is_unknown && Number(r.amount) - (allocatedByRemittance[r.id] || 0) > 0
      ),
    [remittances, allocatedByRemittance]
  );

  if (role && !finance) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">Full remittance list is for accounts and ops.</p>
        <Button asChild>
          <a href="/admin/remittances/mine">My remittances</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Remittances</p>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Remittances</h1>
            <p className="text-sm text-muted-foreground">
              Receive funds, link a customer and user. Office/shift auto-fill from the user&apos;s profile (finance can override).
            </p>
          </div>
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            Receive remittance
          </Button>
        </div>
        <RemittanceSubNav canManageFinance={!!finance} unknownCount={unknownCount} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Records</p>
            <p className="mt-1 text-2xl font-bold">{remittances.length}</p>
          </CardContent>
        </Card>
        {Object.entries(totals)
          .slice(0, 2)
          .map(([currency, total]) => (
            <Card key={currency}>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Confirmed {currency}</p>
                <p className="mt-1 text-2xl font-bold">{money(total, currency)}</p>
              </CardContent>
            </Card>
          ))}
      </div>

      {open && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editingId ? 'Edit remittance' : 'Receive remittance'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="rem-invoice">Apply to invoice (optional)</Label>
                <SearchableSelect
                  id="rem-invoice"
                  value={form.invoice_id}
                  onValueChange={chooseInvoice}
                  options={createInvoiceOptions}
                  placeholder="Unapplied transfer"
                  searchPlaceholder="Search invoice or customer…"
                  clearLabel="Unapplied transfer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-customer">Link customer</Label>
                <SearchableSelect
                  id="rem-customer"
                  value={form.customer_id}
                  onValueChange={chooseCustomer}
                  options={customerOptions}
                  placeholder="Leave empty = Unknown TTS"
                  searchPlaceholder="Search code, name, company…"
                  clearLabel="Unknown / unmatched"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-name">Customer / sender name</Label>
                <Input
                  id="rem-name"
                  value={form.customer_name}
                  onChange={(event) => setForm({ ...form, customer_name: event.target.value })}
                  placeholder={form.customer_id ? 'Required' : 'Optional if TTS set'}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-user">Link user (received by)</Label>
                <SearchableSelect
                  id="rem-user"
                  value={form.received_by}
                  onValueChange={(v) => {
                    const profile = staff.find((u) => u.id === v);
                    setForm({
                      ...form,
                      received_by: v,
                      office_id: profile?.office_id || '',
                      shift_id: profile?.shift_id || '',
                    });
                  }}
                  options={staffOptions}
                  placeholder="Staff who received"
                  searchPlaceholder="Search staff…"
                  clearLabel="No user"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-office">Office</Label>
                <SearchableSelect
                  id="rem-office"
                  value={form.office_id}
                  onValueChange={(v) => setForm({ ...form, office_id: v, shift_id: '' })}
                  options={officeOptions}
                  placeholder="From linked user"
                  clearLabel="No office"
                />
                <p className="text-xs text-muted-foreground">Defaults from the linked user; override if needed.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-shift">Shift</Label>
                <SearchableSelect
                  id="rem-shift"
                  value={form.shift_id}
                  onValueChange={(v) => setForm({ ...form, shift_id: v })}
                  options={shiftOptions}
                  placeholder="From linked user"
                  clearLabel="No shift"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-date">Date received</Label>
                <Input
                  id="rem-date"
                  type="date"
                  value={form.received_date}
                  onChange={(event) => setForm({ ...form, received_date: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-amount">Amount *</Label>
                <Input
                  id="rem-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-currency">Currency</Label>
                <select
                  id="rem-currency"
                  value={form.currency}
                  onChange={(event) => setForm({ ...form, currency: event.target.value })}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option>AED</option>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-method">Method</Label>
                <select
                  id="rem-method"
                  value={form.method}
                  onChange={(event) => setForm({ ...form, method: event.target.value })}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-status">Status</Label>
                <select
                  id="rem-status"
                  value={form.customer_id ? form.status : 'unknown'}
                  disabled={!form.customer_id}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-70"
                >
                  {!form.customer_id && <option value="unknown">Unknown (unmatched)</option>}
                  <option value="pending">Pending review</option>
                  <option value="confirmed">Confirmed received</option>
                  <option value="rejected">Rejected</option>
                  <option value="reversed">Reversed</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-reference">Bank reference / TTS</Label>
                <Input
                  id="rem-reference"
                  value={form.bank_reference}
                  onChange={(event) => setForm({ ...form, bank_reference: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-sender-bank">Sender bank</Label>
                <Input
                  id="rem-sender-bank"
                  value={form.sender_bank}
                  onChange={(event) => setForm({ ...form, sender_bank: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-receiving-bank">Receiving bank</Label>
                <Input
                  id="rem-receiving-bank"
                  value={form.receiving_bank}
                  onChange={(event) => setForm({ ...form, receiving_bank: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rem-files">Receipts / documents</Label>
                <Input
                  id="rem-files"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                  onChange={(event) => setFiles(Array.from(event.target.files || []))}
                />
                <p className="text-xs text-muted-foreground">Private, up to 25 MB each.</p>
              </div>
              <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
                <Label htmlFor="rem-notes">Notes</Label>
                <Textarea
                  id="rem-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
              {!form.customer_id && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2 xl:col-span-3">
                  No customer selected — saved as Unknown TTS until linked.
                </p>
              )}
              {form.status === 'confirmed' && form.invoice_id && form.customer_id && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2 xl:col-span-3">
                  Confirmation will create one linked invoice payment. The same remittance cannot be applied twice.
                </p>
              )}
              <div className="flex items-center gap-3 md:col-span-2 xl:col-span-3">
                <Button disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  {busy ? 'Saving…' : editingId ? 'Update remittance' : 'Save remittance'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    setEditingId(null);
                    setForm(emptyForm);
                    setFiles([]);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Allocate to invoice</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-1">
              <Label>Confirmed remittance</Label>
              <select
                value={allocRemittanceId}
                onChange={(e) => {
                  const id = e.target.value;
                  setAllocRemittanceId(id);
                  setAllocInvoiceId('');
                  const rem = remittances.find((r) => r.id === id);
                  const available = rem ? Number(rem.amount) - (allocatedByRemittance[id] || 0) : 0;
                  setAllocAmount(String(available || ''));
                }}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                {usableForAlloc.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.remittance_number} — {money(Number(r.amount) - (allocatedByRemittance[r.id] || 0), r.currency)} avail
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Invoice</Label>
              <SearchableSelect
                value={allocInvoiceId}
                onValueChange={(id) => {
                  setAllocInvoiceId(id);
                  const rem = remittances.find((r) => r.id === allocRemittanceId);
                  const inv = invoices.find((i) => i.id === id);
                  if (rem && inv) {
                    const available = Number(rem.amount) - (allocatedByRemittance[rem.id] || 0);
                    setAllocAmount(String(Math.min(available, Number(inv.balance_due)) || ''));
                  }
                }}
                options={allocInvoiceOptions}
                placeholder={allocRemittanceId ? 'Same customer & currency' : 'Pick remittance first'}
                searchPlaceholder="Search…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" min="0.01" step="0.01" value={allocAmount} onChange={(e) => setAllocAmount(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" disabled={busy} onClick={() => void allocate(false)}>
                Allocate
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void allocate(true)}>
                Allocate remaining
              </Button>
            </div>
          </div>

          {recentAllocations.length > 0 ? (
            <div className="space-y-2 border-t pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent allocations</p>
              {recentAllocations.map((row) => {
                const rem = remittances.find((r) => r.id === row.remittance_id);
                const invJoin = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
                const invLabel =
                  invJoin?.invoice_number ||
                  invoices.find((i) => i.id === row.invoice_id)?.invoice_number ||
                  row.invoice_id.slice(0, 8);
                return (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{rem?.remittance_number || 'Remittance'}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-medium">{invLabel}</span>
                      <span className="ml-2 text-muted-foreground">
                        {money(row.amount, rem?.currency || 'AED')}
                      </span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => void reverseAllocation(row.id)}>
                      Unallocate
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {message && (
        <div role="status" className="rounded-lg border bg-secondary/30 p-3 text-sm">
          {message}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-4">Record</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Office</th>
                <th className="p-4">Date / TTS</th>
                <th className="p-4 text-right">Amount</th>
                <th className="p-4">Status</th>
                <th className="p-4">Documents</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {remittances.map((item) => {
                const docs = documents.filter((doc) => doc.remittance_id === item.id);
                return (
                  <tr key={item.id} className="border-t align-top">
                    <td className="p-4 font-semibold">{item.remittance_number}</td>
                    <td className="p-4">
                      {item.customer_name}
                      <p className="text-xs text-muted-foreground">{item.sender_bank || item.method.replaceAll('_', ' ')}</p>
                    </td>
                    <td className="p-4 text-xs">{officeLabel(item.office_id)}</td>
                    <td className="p-4">
                      {item.received_date}
                      <p className="text-xs text-muted-foreground">{item.bank_reference || 'No reference'}</p>
                    </td>
                    <td className="p-4 text-right font-semibold">{money(item.amount, item.currency)}</td>
                    <td className="p-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                          item.status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : item.status === 'unknown' || item.is_unknown
                              ? 'bg-rose-100 text-rose-700'
                              : item.status === 'pending'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-zinc-200 text-zinc-700'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="p-4">
                      {docs.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        <div className="space-y-1">
                          {docs.map((doc) => (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => void viewDocument(doc)}
                              className="flex max-w-48 items-center gap-1.5 text-left text-xs text-primary hover:underline"
                            >
                              <Paperclip className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{doc.file_name}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(item)} aria-label={`Edit ${item.remittance_number}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          disabled={busy}
                          onClick={() => void remove(item)}
                          aria-label={`Delete ${item.remittance_number}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {remittances.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-3 h-9 w-9" />
                    No remittances recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

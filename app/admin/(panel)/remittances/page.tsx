'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { RemittanceAllocateStocksForm } from '@/components/admin/remittance-allocate-stocks-form';
import {
  RemittanceExportPanel,
  emptyRemittanceListFilters,
  type RemittanceListFilters,
} from '@/components/admin/remittance-export-panel';
import { RemittanceSubNav } from '@/components/admin/remittance-sub-nav';
import { SearchableSelect, customerSelectOption } from '@/components/admin/searchable-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { canManageReceivables } from '@/lib/admin-rbac';
import { downloadExcelWorkbook } from '@/lib/export-excel';
import {
  REMITTANCE_EXPORT_COLUMNS,
  buildRemittanceExportRow,
  defaultRemittanceExportSelection,
  type RemittanceExportColumnKey,
} from '@/lib/remittance-export';
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
  country?: string | null;
  phone?: string | null;
  email?: string | null;
};

type AllocationRow = RemittanceAllocation & {
  invoices?:
    | {
        invoice_number: string;
        invoice_items?:
          | {
              vehicle_id: string | null;
              inventory_reference: string | null;
              vehicles?:
                | { stock_number: string | null; chassis_number: string | null }
                | { stock_number: string | null; chassis_number: string | null }[]
                | null;
            }[]
          | null;
      }
    | {
        invoice_number: string;
        invoice_items?:
          | {
              vehicle_id: string | null;
              inventory_reference: string | null;
              vehicles?:
                | { stock_number: string | null; chassis_number: string | null }
                | { stock_number: string | null; chassis_number: string | null }[]
                | null;
            }[]
          | null;
      }[]
    | null;
};

type VehicleLite = {
  id: string;
  stock_number: string | null;
  chassis_number: string | null;
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
  status: 'confirmed',
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
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [vehiclesById, setVehiclesById] = useState<Record<string, VehicleLite>>({});
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
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [unknownCount, setUnknownCount] = useState(0);
  const [allocRemittanceId, setAllocRemittanceId] = useState('');
  const [allocInvoiceId, setAllocInvoiceId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');
  const [allocateFormRemittanceId, setAllocateFormRemittanceId] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState<RemittanceListFilters>(emptyRemittanceListFilters);
  const [filters, setFilters] = useState<RemittanceListFilters>(emptyRemittanceListFilters);
  const [exportColumns, setExportColumns] = useState(defaultRemittanceExportSelection);

  const finance = canManageReceivables(role);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
      if (!canManageReceivables(prof?.role)) return;
    }

    const [remittanceResult, documentResult, customerResult, invoiceResult, staffResult, officeResult, shiftResult, unknownResult] =
      await Promise.all([
        supabase.from('remittances').select('*').order('received_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('remittance_documents').select('*').order('created_at'),
        supabase
          .from('customers')
          .select('id,full_name,company_name,customer_code,country,phone,email')
          .eq('is_active', true)
          .order('company_name')
          .order('full_name'),
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

    let allocResult = await supabase
      .from('remittance_allocations')
      .select(
        '*, invoices(invoice_number, invoice_items(vehicle_id, inventory_reference, vehicles(stock_number, chassis_number)))'
      );
    if (allocResult.error) {
      // Fall back so Allocate Actions still works if nested stock join is unavailable.
      allocResult = await supabase.from('remittance_allocations').select('*, invoices(invoice_number)');
    }

    if (remittanceResult.error) setMessage(remittanceResult.error.message);
    if (allocResult.error) toast.error(allocResult.error.message);

    const remittanceRows = (remittanceResult.data || []) as Remittance[];
    setRemittances(remittanceRows);
    setDocuments((documentResult.data || []) as RemittanceDocument[]);
    setAllocations((allocResult.data || []) as AllocationRow[]);
    setCustomers((customerResult.data || []) as Customer[]);
    setInvoices((invoiceResult.data || []) as Invoice[]);
    setStaff((staffResult.data || []) as Staff[]);
    setOffices((officeResult.data || []) as RemittanceOffice[]);
    setShifts((shiftResult.data || []) as RemittanceShift[]);
    setUnknownCount(Number(unknownResult.data || 0));

    const vehicleIds = new Set<string>();
    for (const row of remittanceRows) {
      if (row.vehicle_id) vehicleIds.add(row.vehicle_id);
    }
    if (vehicleIds.size > 0) {
      const { data: vehicleRows } = await supabase
        .from('vehicles')
        .select('id,stock_number,chassis_number')
        .in('id', Array.from(vehicleIds));
      const map: Record<string, VehicleLite> = {};
      for (const v of (vehicleRows || []) as VehicleLite[]) map[v.id] = v;
      setVehiclesById(map);
    } else {
      setVehiclesById({});
    }
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

  const allocationsByRemittance = useMemo(() => {
    const map: Record<string, AllocationRow[]> = {};
    for (const row of allocations) {
      (map[row.remittance_id] ||= []).push(row);
    }
    return map;
  }, [allocations]);

  const customerById = useMemo(() => {
    const map = new Map(customers.map((c) => [c.id, c]));
    return map;
  }, [customers]);

  const stockHintsForRemittance = useCallback(
    (item: Remittance) => {
      const stocks = new Set<string>();
      const chassis = new Set<string>();
      if (item.vehicle_id && vehiclesById[item.vehicle_id]) {
        const v = vehiclesById[item.vehicle_id];
        if (v.stock_number) stocks.add(v.stock_number);
        if (v.chassis_number) chassis.add(v.chassis_number);
      }
      for (const alloc of allocationsByRemittance[item.id] || []) {
        const invJoin = Array.isArray(alloc.invoices) ? alloc.invoices[0] : alloc.invoices;
        for (const line of invJoin?.invoice_items || []) {
          if (line.inventory_reference) stocks.add(line.inventory_reference);
          const veh = Array.isArray(line.vehicles) ? line.vehicles[0] : line.vehicles;
          if (veh?.stock_number) stocks.add(veh.stock_number);
          if (veh?.chassis_number) chassis.add(veh.chassis_number);
        }
      }
      return {
        stock_id: stocks.size ? Array.from(stocks).join(', ') : null,
        chassis_no: chassis.size ? Array.from(chassis).join(', ') : null,
      };
    },
    [allocationsByRemittance, vehiclesById]
  );

  const allocationTimestamps = useCallback(
    (item: Remittance) => {
      const rows = allocationsByRemittance[item.id] || [];
      if (rows.length === 0) return { partially_allocated_at: null, fully_allocated_at: null };
      const used = allocatedByRemittance[item.id] || 0;
      const amount = Number(item.amount);
      const sorted = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      const first = sorted[0]?.created_at || null;
      const last = sorted[sorted.length - 1]?.created_at || null;
      const fully = used >= amount - 0.0001;
      const partial = used > 0 && !fully;
      return {
        partially_allocated_at: partial && first ? first.slice(0, 19).replace('T', ' ') : null,
        fully_allocated_at: fully && last ? last.slice(0, 19).replace('T', ' ') : null,
      };
    },
    [allocationsByRemittance, allocatedByRemittance]
  );

  const filteredRemittances = useMemo(() => {
    const inRange = (value: string | null | undefined, from: string, to: string) => {
      if (!from && !to) return true;
      if (!value) return false;
      const day = value.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    };

    const rows = remittances.filter((item) => {
      if (!inRange(item.received_date, filters.receivedFrom, filters.receivedTo)) return false;
      // remit_date filter ignored — remittances have no remit_date column yet
      void filters.remitFrom;
      void filters.remitTo;
      if (!inRange(item.created_at, filters.createdFrom, filters.createdTo)) return false;
      if (filters.customerId && item.customer_id !== filters.customerId) return false;
      if (filters.currency && item.currency !== filters.currency) return false;
      if (filters.officeId && item.office_id !== filters.officeId) return false;
      if (filters.agentId && item.received_by !== filters.agentId) return false;
      if (filters.status) {
        if (filters.status === 'unknown') {
          if (!(item.status === 'unknown' || item.is_unknown)) return false;
        } else if (item.status !== filters.status) {
          return false;
        }
      }
      if (filters.customerCountry) {
        const country = item.customer_id ? customerById.get(item.customer_id)?.country || '' : '';
        if (country !== filters.customerCountry) return false;
      }
      const amount = Number(item.amount);
      if (filters.minAmount !== '' && amount < Number(filters.minAmount)) return false;
      if (filters.maxAmount !== '' && amount > Number(filters.maxAmount)) return false;
      return true;
    });

    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (filters.sort) {
        case 'received_asc':
          return String(a.received_date).localeCompare(String(b.received_date)) || String(a.created_at).localeCompare(String(b.created_at));
        case 'created_desc':
          return String(b.created_at).localeCompare(String(a.created_at));
        case 'created_asc':
          return String(a.created_at).localeCompare(String(b.created_at));
        case 'amount_desc':
          return Number(b.amount) - Number(a.amount);
        case 'amount_asc':
          return Number(a.amount) - Number(b.amount);
        case 'number_asc':
          return String(a.remittance_number).localeCompare(String(b.remittance_number));
        case 'received_desc':
        default:
          return (
            String(b.received_date).localeCompare(String(a.received_date)) ||
            String(b.created_at).localeCompare(String(a.created_at))
          );
      }
    });
    return sorted;
  }, [remittances, filters, customerById]);

  const startCreate = () => {
    setEditingId(null);
    setAllocateFormRemittanceId(null);
    setForm(emptyForm);
    setFiles([]);
    setMessage('');
    setOpen(true);
  };

  const startEdit = (item: Remittance) => {
    setAllocateFormRemittanceId(null);
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
      status: item.status === 'unknown' ? 'confirmed' : item.status,
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
      status: current.status === 'unknown' || current.status === 'pending' ? 'confirmed' : current.status,
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
            ? 'Unknown TTS saved unconfirmed — link customer and agent from Unknown TTS to confirm.'
            : form.status === 'confirmed' && form.invoice_id
              ? 'Remittance confirmed and applied to the invoice once.'
              : form.status === 'confirmed'
                ? 'Remittance saved and confirmed.'
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

  const startAllocate = (item: Remittance) => {
    if (!item.customer_id) {
      toast.error('Link a customer on this remittance before allocating to stocks.');
      return;
    }
    if (item.is_unknown || item.status === 'unknown') {
      toast.error('Resolve unknown TTS before allocating.');
      return;
    }
    if (item.status !== 'confirmed') {
      toast.error('Confirm the remittance before allocating.');
      return;
    }
    const available = Number(item.amount) - (allocatedByRemittance[item.id] || 0);
    if (!(available > 0)) {
      toast.error('Nothing left to allocate on this remittance.');
      return;
    }
    setOpen(false);
    setEditingId(null);
    setAllocateFormRemittanceId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const allocateFormRemittance = allocateFormRemittanceId
    ? remittances.find((row) => row.id === allocateFormRemittanceId) || null
    : null;

  const staffName = useMemo(() => {
    const map = new Map(staff.map((u) => [u.id, u.full_name || u.email || u.id.slice(0, 8)]));
    return (id: string | null) => (id ? map.get(id) || '—' : null);
  }, [staff]);

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

  const currencyOptions = useMemo(() => {
    const set = new Set(remittances.map((r) => r.currency).filter(Boolean));
    return Array.from(set).sort();
  }, [remittances]);

  const countryOptions = useMemo(() => {
    const set = new Set(
      customers.map((c) => (c.country || '').trim()).filter((c) => c.length > 0)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const exportRemittances = async (format: 'xlsx' | 'csv' = 'xlsx') => {
    const selected = REMITTANCE_EXPORT_COLUMNS.filter((col) => exportColumns[col.key]);
    if (selected.length === 0) {
      toast.error('Select at least one export column.');
      return;
    }
    if (filteredRemittances.length === 0) {
      toast.error('No remittances match the current filters.');
      return;
    }
    setExporting(true);
    try {
      const rows = filteredRemittances.map((item) => {
        const customer = item.customer_id ? customerById.get(item.customer_id) : undefined;
        const stock = stockHintsForRemittance(item);
        const stamps = allocationTimestamps(item);
        const full = buildRemittanceExportRow({
          remittance_number: item.remittance_number,
          customer_id: item.customer_id,
          customer_code: customer?.customer_code || null,
          customer_name: item.customer_name,
          customer_country: customer?.country || null,
          currency: item.currency,
          sender_bank: item.sender_bank,
          receiving_bank: item.receiving_bank,
          bank_reference: item.bank_reference,
          amount: Number(item.amount),
          allocated: allocatedByRemittance[item.id] || 0,
          method: item.method,
          status: item.status,
          is_unknown: item.is_unknown,
          notes: item.notes,
          received_date: item.received_date,
          created_at: item.created_at,
          requester_name: staffName(item.received_by),
          office_name: item.office_id ? officeLabel(item.office_id) : null,
          stock_id: stock.stock_id,
          chassis_no: stock.chassis_no,
          partially_allocated_at: stamps.partially_allocated_at,
          fully_allocated_at: stamps.fully_allocated_at,
        });
        const picked: Record<string, string | number | null> = {};
        for (const col of selected) picked[col.key] = full[col.key];
        return picked;
      });

      if (format === 'csv') {
        const escapeCsv = (value: string | number | null | undefined) => {
          const raw = value == null ? '' : String(value);
          if (/[",\n\r]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
          return raw;
        };
        const header = selected.map((col) => escapeCsv(col.label)).join(',');
        const lines = rows.map((row) =>
          selected.map((col) => escapeCsv(row[col.key])).join(',')
        );
        const stamp = new Date().toISOString().slice(0, 10);
        const blob = new Blob([[header, ...lines].join('\n')], {
          type: 'text/csv;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `remittance-list-${stamp}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } else {
        await downloadExcelWorkbook({
          filename: 'remittance-list',
          sheetName: 'Remittances',
          columns: selected.map((col) => ({ header: col.label, key: col.key })),
          rows,
        });
      }
      toast.success(`Exported ${rows.length} remittance${rows.length === 1 ? '' : 's'}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

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
            <p className="mt-1 text-2xl font-bold">{filteredRemittances.length}</p>
            {filteredRemittances.length !== remittances.length ? (
              <p className="mt-1 text-xs text-muted-foreground">of {remittances.length} total</p>
            ) : null}
          </CardContent>
        </Card>
        {Object.entries(totals).map(([currency, total]) => (
            <Card key={currency}>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Confirmed {currency}</p>
                <p className="mt-1 text-2xl font-bold">{money(total, currency)}</p>
              </CardContent>
            </Card>
          ))}
      </div>

      <RemittanceExportPanel
        draft={filterDraft}
        onDraftChange={setFilterDraft}
        onSearch={() => setFilters({ ...filterDraft })}
        onClear={() => {
          const empty = emptyRemittanceListFilters();
          setFilterDraft(empty);
          setFilters(empty);
        }}
        onExport={(format) => void exportRemittances(format)}
        exporting={exporting}
        columnSelection={exportColumns}
        onColumnToggle={(key, checked) =>
          setExportColumns((current) => ({ ...current, [key]: checked }))
        }
        onSelectAllColumns={() => setExportColumns(defaultRemittanceExportSelection())}
        onUnselectAllColumns={() =>
          setExportColumns(
            Object.fromEntries(
              REMITTANCE_EXPORT_COLUMNS.map((col) => [col.key, false])
            ) as Record<RemittanceExportColumnKey, boolean>
          )
        }
        customerOptions={customerOptions}
        currencyOptions={currencyOptions}
        officeOptions={officeOptions}
        agentOptions={staffOptions}
        countryOptions={countryOptions}
        matchCount={filteredRemittances.length}
      />

      {allocateFormRemittance ? (
        <RemittanceAllocateStocksForm
          remittance={allocateFormRemittance}
          alreadyAllocated={allocatedByRemittance[allocateFormRemittance.id] || 0}
          onClose={() => setAllocateFormRemittanceId(null)}
          onAllocated={load}
        />
      ) : null}

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
                  <option>PKR</option>
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
                  {!form.customer_id && <option value="unknown">Unconfirmed (unknown TTS)</option>}
                  <option value="confirmed">Confirmed received</option>
                  <option value="pending">Pending review</option>
                  <option value="rejected">Rejected</option>
                  <option value="reversed">Reversed</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Known customer defaults to confirmed. Unknown TTS stays unconfirmed until linked.
                </p>
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
                  No customer selected — saved as Unknown TTS (unconfirmed) until linked to a customer and agent.
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
              {filteredRemittances.map((item) => {
                const docs = documents.filter((doc) => doc.remittance_id === item.id);
                const used = allocatedByRemittance[item.id] || 0;
                const remaining = Math.max(0, Number(item.amount) - used);
                const tagged = staffName(item.received_by);
                return (
                  <tr key={item.id} className="border-t align-top">
                    <td className="p-4 font-semibold">{item.remittance_number}</td>
                    <td className="p-4">
                      {item.customer_name}
                      <p className="text-xs text-muted-foreground">{item.sender_bank || item.method.replaceAll('_', ' ')}</p>
                      {tagged ? <p className="mt-1 text-[11px] text-muted-foreground">Tagged with: {tagged}</p> : null}
                    </td>
                    <td className="p-4 text-xs">{officeLabel(item.office_id)}</td>
                    <td className="p-4">
                      {item.received_date}
                      <p className="text-xs text-muted-foreground">{item.bank_reference || 'No reference'}</p>
                    </td>
                    <td className="p-4 text-right font-semibold">
                      {money(item.amount, item.currency)}
                      <p className="text-xs font-normal text-muted-foreground">
                        {money(remaining, item.currency)} remaining
                      </p>
                    </td>
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
                        {item.status === 'unknown' || item.is_unknown
                          ? 'Unconfirmed'
                          : item.status}
                      </span>
                      {item.status === 'confirmed' ? (
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-sky-700">
                          {remaining <= 0 ? 'Allocated' : used > 0 ? 'Partial' : 'Unallocated'}
                        </p>
                      ) : null}
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
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1">
                              Actions
                              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onSelect={() => {
                                setAllocateFormRemittanceId(null);
                                startEdit(item);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => startAllocate(item)}>
                              <Banknote className="h-3.5 w-3.5" />
                              Allocate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={busy}
                              onSelect={() => void remove(item)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRemittances.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-3 h-9 w-9" />
                    {remittances.length === 0
                      ? 'No remittances recorded.'
                      : 'No remittances match the current filters.'}
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

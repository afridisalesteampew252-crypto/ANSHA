'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Banknote,
  Building2,
  CheckCircle2,
  Contact,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  MapPin,
  Pencil,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  ShoppingBag,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addToCurrencyMap, formatMoney, normalizeCurrency } from '@/lib/money';
import { MoneyBreakdown } from '@/components/money-breakdown';
import { CustomerLifecycleTimeline } from '@/components/admin/customer-lifecycle-timeline';
import { cn } from '@/lib/utils';
import { downloadRowsAsXlsx } from '@/lib/export-excel';

const money = (value: number, currency = 'AED') => formatMoney(value, currency);
const receivableDocument = (type: string) => type === 'tax_invoice' || type === 'commercial_invoice';
const trimOrNull = (value: string) => value.trim() || null;

type Customer = {
  id: string;
  customer_code: string;
  full_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  address: string | null;
  notes: string | null;
  tax_registration_number: string | null;
  consignee_name: string | null;
  consignee_company: string | null;
  consignee_phone: string | null;
  consignee_email: string | null;
  consignee_address: string | null;
  consignee_country: string | null;
  consignee_notes: string | null;
};
type Invoice = { id: string; invoice_number: string; document_type: string; issue_date: string; currency: string; status: string; total_amount: number; amount_paid: number; balance_due: number };
type InvoiceItem = { id: string; invoice_id: string; description: string; quantity: number; line_total: number; inventory_type: string | null; inventory_reference: string | null; vehicle_id?: string | null; part_id?: string | null };
type Remittance = { id: string; remittance_number: string; received_date: string; amount: number; currency: string; status: string; method: string; bank_reference: string | null };
type Allocation = { id: string; remittance_id: string; invoice_id: string; invoice_payment_id: string; amount: number; created_at: string };
type PortalLink = { id: string; email: string; full_name: string | null; is_active: boolean };
type ReservedBuying = {
  key: string;
  kind: 'vehicle' | 'part';
  description: string;
  inventory_reference: string;
  line_total: number;
  currency: string;
  stock_id: string;
};

type ProfileForm = {
  full_name: string;
  company_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  country: string;
  address: string;
  notes: string;
  tax_registration_number: string;
  consignee_name: string;
  consignee_company: string;
  consignee_phone: string;
  consignee_email: string;
  consignee_address: string;
  consignee_country: string;
  consignee_notes: string;
};

const emptyProfileForm = (): ProfileForm => ({
  full_name: '',
  company_name: '',
  email: '',
  phone: '',
  whatsapp: '',
  country: '',
  address: '',
  notes: '',
  tax_registration_number: '',
  consignee_name: '',
  consignee_company: '',
  consignee_phone: '',
  consignee_email: '',
  consignee_address: '',
  consignee_country: '',
  consignee_notes: '',
});

const EDIT_SECTIONS = ['profile', 'company', 'contact', 'details', 'consignee'] as const;
type EditSection = (typeof EDIT_SECTIONS)[number];

function parseEditSection(hash: string): EditSection | null {
  return (EDIT_SECTIONS as readonly string[]).includes(hash) ? (hash as EditSection) : null;
}

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value?.trim() || '—'}</p>
    </div>
  );
}

export default function CustomerAccountPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [profileSaving, setProfileSaving] = useState(false);
  const [editingSection, setEditingSection] = useState<EditSection | null>(() =>
    typeof window !== 'undefined' ? parseEditSection(window.location.hash.replace(/^#/, '')) : null
  );
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [portalLink, setPortalLink] = useState<PortalLink | null>(null);
  const [portalEmail, setPortalEmail] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [portalBusy, setPortalBusy] = useState(false);
  const [isAccountAdmin, setIsAccountAdmin] = useState(false);
  const [remittanceId, setRemittanceId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [allocationAmount, setAllocationAmount] = useState('');
  const [reservedBuying, setReservedBuying] = useState<ReservedBuying[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const applyCustomerToForm = (row: Customer) => {
    setProfileForm({
      full_name: row.full_name || '',
      company_name: row.company_name || '',
      email: row.email || '',
      phone: row.phone || '',
      whatsapp: row.whatsapp || '',
      country: row.country || '',
      address: row.address || '',
      notes: row.notes || '',
      tax_registration_number: row.tax_registration_number || '',
      consignee_name: row.consignee_name || '',
      consignee_company: row.consignee_company || '',
      consignee_phone: row.consignee_phone || '',
      consignee_email: row.consignee_email || '',
      consignee_address: row.consignee_address || '',
      consignee_country: row.consignee_country || '',
      consignee_notes: row.consignee_notes || '',
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [customerResult, invoiceResult, remittanceResult, portalResult, sessionRes, vehicleReserveResult, partReserveResult] = await Promise.all([
      supabase
        .from('customers')
        .select(
          'id,customer_code,full_name,company_name,email,phone,whatsapp,country,address,notes,tax_registration_number,consignee_name,consignee_company,consignee_phone,consignee_email,consignee_address,consignee_country,consignee_notes'
        )
        .eq('id', customerId)
        .single(),
      supabase.from('invoices').select('id,invoice_number,document_type,issue_date,currency,status,total_amount,amount_paid,balance_due').eq('customer_id', customerId).order('issue_date', { ascending: false }),
      supabase.from('remittances').select('id,remittance_number,received_date,amount,currency,status,method,bank_reference').eq('customer_id', customerId).order('received_date', { ascending: false }),
      supabase.from('customer_profiles').select('id,email,full_name,is_active').eq('customer_id', customerId).maybeSingle(),
      supabase.auth.getSession(),
      supabase.from('vehicles').select('id,title,stock_number,chassis_number,price,price_fob,price_cf,price_cif,currency,reservation_price_term').eq('reserved_customer_id', customerId).eq('stock_status', 'reserved'),
      supabase.from('parts').select('id,name,part_code,part_number,price,price_fob,price_cf,price_cif,currency,reservation_price_term').eq('reserved_customer_id', customerId).eq('stock_status', 'reserved'),
    ]);
    if (customerResult.error) setNotice(customerResult.error.message);
    const invoiceRows = ((invoiceResult.data || []) as Invoice[]).filter((row) => row.status !== 'cancelled');
    const remittanceRows = (remittanceResult.data || []) as Remittance[];
    const customerRow = (customerResult.data || null) as Customer | null;
    setCustomer(customerRow);
    if (customerRow) applyCustomerToForm(customerRow);
    setPortalLink((portalResult.data || null) as PortalLink | null);
    setPortalEmail(customerResult.data?.email || '');
    setInvoices(invoiceRows);
    setRemittances(remittanceRows);
    const uid = sessionRes.data.session?.user?.id;
    if (uid) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', uid).maybeSingle();
      setIsAccountAdmin(prof?.role === 'admin');
    }
    const reservedPrice = (row: { reservation_price_term: string | null; price_fob: number | null; price_cf: number | null; price_cif: number | null; price: number | null }) => {
      if (row.reservation_price_term === 'fob') return Number(row.price_fob ?? row.price ?? 0);
      if (row.reservation_price_term === 'cf') return Number(row.price_cf ?? row.price ?? 0);
      if (row.reservation_price_term === 'cif') return Number(row.price_cif ?? row.price ?? 0);
      return Number(row.price ?? 0);
    };
    const reservedRows: ReservedBuying[] = [
      ...((vehicleReserveResult.data || []) as Array<{ id: string; title: string; stock_number: string | null; chassis_number: string | null; price: number | null; price_fob: number | null; price_cf: number | null; price_cif: number | null; currency: string; reservation_price_term: string | null }>).map((row) => ({
        key: `vehicle:${row.id}`,
        kind: 'vehicle' as const,
        description: row.title,
        inventory_reference: row.stock_number || row.chassis_number || row.id.slice(0, 8),
        line_total: reservedPrice(row),
        currency: row.currency || 'AED',
        stock_id: row.id,
      })),
      ...((partReserveResult.data || []) as Array<{ id: string; name: string; part_code: string; part_number: string | null; price: number | null; price_fob: number | null; price_cf: number | null; price_cif: number | null; currency: string; reservation_price_term: string | null }>).map((row) => ({
        key: `part:${row.id}`,
        kind: 'part' as const,
        description: row.name,
        inventory_reference: row.part_code || row.part_number || row.id.slice(0, 8),
        line_total: reservedPrice(row),
        currency: row.currency || 'AED',
        stock_id: row.id,
      })),
    ];
    setReservedBuying(reservedRows);
    const [itemResult, allocationResult] = await Promise.all([
      invoiceRows.length ? supabase.from('invoice_items').select('id,invoice_id,description,quantity,line_total,inventory_type,inventory_reference,vehicle_id,part_id').in('invoice_id', invoiceRows.map((row) => row.id)).order('sort_order') : Promise.resolve({ data: [] }),
      remittanceRows.length ? supabase.from('remittance_allocations').select('id,remittance_id,invoice_id,invoice_payment_id,amount,created_at').in('remittance_id', remittanceRows.map((row) => row.id)).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    setItems((itemResult.data || []) as InvoiceItem[]);
    setAllocations((allocationResult.data || []) as Allocation[]);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (loading || !customer) return;

    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      setEditingSection(parseEditSection(hash));
      if (!hash) return;
      window.setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [loading, customer]);

  const startEdit = useCallback((section: EditSection) => {
    setEditingSection(section);
    if (customer) applyCustomerToForm(customer);
    const next = `${window.location.pathname}${window.location.search}#${section}`;
    window.history.replaceState(null, '', next);
    window.setTimeout(() => {
      document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  }, [customer]);

  const stopEdit = useCallback(() => {
    setEditingSection(null);
    if (customer) applyCustomerToForm(customer);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }, [customer]);

  const allocatedByRemittance = useMemo(() => allocations.reduce<Record<string, number>>((sum, row) => ({ ...sum, [row.remittance_id]: (sum[row.remittance_id] || 0) + Number(row.amount) }), {}), [allocations]);
  const receivableInvoices = useMemo(() => invoices.filter((row) => receivableDocument(row.document_type) && row.status !== 'cancelled'), [invoices]);
  const openInvoices = useMemo(() => receivableInvoices.filter((row) => Number(row.balance_due) > 0), [receivableInvoices]);
  const usableRemittances = useMemo(() => remittances.filter((row) => row.status === 'confirmed' && Number(row.amount) - (allocatedByRemittance[row.id] || 0) > 0), [remittances, allocatedByRemittance]);
  const selectedRemittance = remittances.find((row) => row.id === remittanceId);
  const selectedInvoice = invoices.find((row) => row.id === invoiceId);

  const soaTotals = useMemo(() => {
    const invoiced: Record<string, number> = {};
    const allocated: Record<string, number> = {};
    const balance: Record<string, number> = {};
    const available: Record<string, number> = {};
    const remCurrency = new Map(remittances.map((row) => [row.id, row.currency]));
    for (const row of receivableInvoices) {
      addToCurrencyMap(invoiced, row.currency, Number(row.total_amount || 0));
      addToCurrencyMap(balance, row.currency, Number(row.balance_due || 0));
    }
    for (const row of allocations) {
      addToCurrencyMap(allocated, remCurrency.get(row.remittance_id), Number(row.amount || 0));
    }
    for (const row of remittances) {
      if (row.status !== 'confirmed') continue;
      addToCurrencyMap(available, row.currency, Math.max(0, Number(row.amount) - (allocatedByRemittance[row.id] || 0)));
    }
    return { invoiced, allocated, balance, available };
  }, [allocations, allocatedByRemittance, receivableInvoices, remittances]);

  const chartCurrency = normalizeCurrency(
    receivableInvoices[0]?.currency || remittances[0]?.currency || 'AED'
  );

  const chartData = useMemo(() => Array.from({ length: 6 }, (_, offset) => {
    const month = startOfMonth(subMonths(new Date(), 5 - offset));
    const key = format(month, 'yyyy-MM');
    return {
      month: format(month, 'MMM'),
      invoices: receivableInvoices
        .filter((row) => row.issue_date.startsWith(key) && normalizeCurrency(row.currency) === chartCurrency)
        .reduce((sum, row) => sum + Number(row.total_amount), 0),
      payments: allocations
        .filter((row) => {
          if (!row.created_at.startsWith(key)) return false;
          const rem = remittances.find((item) => item.id === row.remittance_id);
          return normalizeCurrency(rem?.currency) === chartCurrency;
        })
        .reduce((sum, row) => sum + Number(row.amount), 0),
    };
  }), [allocations, chartCurrency, receivableInvoices, remittances]);

  const stockRefsByInvoice = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const item of items) {
      const ref = item.inventory_reference?.trim();
      if (!ref) continue;
      if (!map[item.invoice_id]) map[item.invoice_id] = [];
      if (!map[item.invoice_id].includes(ref)) map[item.invoice_id].push(ref);
    }
    return map;
  }, [items]);

  const exportSoaExcel = async () => {
    if (!customer) return;
    await downloadRowsAsXlsx({
      filename: `${customer.customer_code}-soa`,
      sheetName: 'Customer SOA',
      columns: [
        { key: 'date', header: 'Date', width: 14 },
        { key: 'reference', header: 'Reference', width: 24 },
        { key: 'entry_type', header: 'Entry type', width: 18 },
        { key: 'stock', header: 'Stock', width: 28 },
        { key: 'currency', header: 'Currency', width: 12 },
        { key: 'debit', header: 'Debit', width: 16 },
        { key: 'credit', header: 'Credit', width: 16 },
        { key: 'balance', header: 'Balance', width: 16 },
        { key: 'status', header: 'Status', width: 16 },
      ],
      rows: [
        ...invoices.map((invoice) => ({
          date: invoice.issue_date,
          reference: invoice.invoice_number,
          entry_type: invoice.document_type.replaceAll('_', ' '),
          stock: stockRefsByInvoice[invoice.id]?.join(', ') || '',
          currency: invoice.currency,
          debit: receivableDocument(invoice.document_type) ? Number(invoice.total_amount || 0) : 0,
          credit: Number(invoice.amount_paid || 0),
          balance: receivableDocument(invoice.document_type) ? Number(invoice.balance_due || 0) : 0,
          status: invoice.status,
        })),
        ...remittances.filter((row) => row.status === 'confirmed').map((row) => ({
          date: row.received_date,
          reference: row.remittance_number,
          entry_type: 'confirmed remittance',
          stock: '',
          currency: row.currency,
          debit: 0,
          credit: Number(row.amount || 0),
          balance: Math.max(0, Number(row.amount || 0) - (allocatedByRemittance[row.id] || 0)),
          status: row.status,
        })),
      ],
    });
  };

  const reservedStockIds = useMemo(() => new Set(reservedBuying.map((row) => row.stock_id)), [reservedBuying]);
  const buyingInvoiceItems = useMemo(
    () => items.filter((item) => {
      if (item.vehicle_id && reservedStockIds.has(item.vehicle_id)) return false;
      if (item.part_id && reservedStockIds.has(item.part_id)) return false;
      return true;
    }),
    [items, reservedStockIds],
  );

  const chooseRemittance = (value: string) => {
    setRemittanceId(value);
    const remittance = remittances.find((row) => row.id === value);
    const available = remittance ? Number(remittance.amount) - (allocatedByRemittance[value] || 0) : 0;
    const invoice = openInvoices.find((row) => row.currency === remittance?.currency);
    if (invoice) setInvoiceId(invoice.id);
    setAllocationAmount(String(Math.min(available, Number(invoice?.balance_due || available)) || ''));
  };

  const allocate = async () => {
    if (!remittanceId || !invoiceId || Number(allocationAmount) <= 0) return setNotice('Choose a remittance, invoice, and positive amount.');
    setBusy(true); setNotice('Applying customer funds…');
    const { error } = await supabase.rpc('allocate_remittance', { p_remittance_id: remittanceId, p_invoice_id: invoiceId, p_amount: Number(allocationAmount) });
    setBusy(false);
    if (error) return setNotice(error.message);
    setNotice('Funds allocated. The invoice balance and customer statement were updated.');
    setRemittanceId(''); setInvoiceId(''); setAllocationAmount(''); await load();
  };

  const reverse = async (allocation: Allocation) => {
    if (!window.confirm('Reverse this allocation and restore both balances?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('reverse_remittance_allocation', { p_allocation_id: allocation.id });
    setBusy(false);
    if (error) return setNotice(error.message);
    setNotice('Allocation reversed and balances restored.'); await load();
  };

  const saveProfile = async (sectionLabel: string) => {
    if (!customer) return;
    if (!profileForm.full_name.trim()) {
      setNotice('Full name is required.');
      return;
    }
    setProfileSaving(true);
    setNotice(`Saving ${sectionLabel}…`);
    const payload = {
      full_name: profileForm.full_name.trim(),
      company_name: trimOrNull(profileForm.company_name),
      email: trimOrNull(profileForm.email),
      phone: trimOrNull(profileForm.phone),
      whatsapp: trimOrNull(profileForm.whatsapp),
      country: trimOrNull(profileForm.country),
      address: trimOrNull(profileForm.address),
      notes: trimOrNull(profileForm.notes),
      tax_registration_number: trimOrNull(profileForm.tax_registration_number),
      consignee_name: trimOrNull(profileForm.consignee_name),
      consignee_company: trimOrNull(profileForm.consignee_company),
      consignee_phone: trimOrNull(profileForm.consignee_phone),
      consignee_email: trimOrNull(profileForm.consignee_email),
      consignee_address: trimOrNull(profileForm.consignee_address),
      consignee_country: trimOrNull(profileForm.consignee_country),
      consignee_notes: trimOrNull(profileForm.consignee_notes),
    };
    const { error } = await supabase.from('customers').update(payload).eq('id', customer.id);
    setProfileSaving(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    setNotice(`${sectionLabel} saved.`);
    await load();
  };

  const enablePortal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!customer) return;
    setPortalBusy(true);
    setNotice('Creating portal access…');
    const { data, error } = await supabase.functions.invoke('portal-create-access', {
      body: {
        customer_id: customer.id,
        email: portalEmail.trim(),
        password: portalPassword,
        full_name: customer.full_name,
      },
    });
    setPortalBusy(false);
    if (error || data?.error) {
      setNotice(data?.error || error?.message || 'Could not enable portal access.');
      return;
    }
    setPortalPassword('');
    setNotice(`Portal access created for ${data.email}. Share the temporary password securely.`);
    await load();
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!customer) return <Card><CardContent className="p-10 text-center">Customer account not found.</CardContent></Card>;

  const setField = (key: keyof ProfileForm) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setProfileForm((prev) => ({ ...prev, [key]: event.target.value }));

  return <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
          <Link href="/admin/customers"><ArrowLeft className="h-4 w-4" />Customers</Link>
        </Button>
        <h1 className="text-2xl font-bold">{customer.company_name || customer.full_name}</h1>
        <p className="text-sm text-muted-foreground">
          Customer ID <span className="font-semibold text-foreground">{customer.customer_code}</span>
          {' · '}Statement of Account
          {[customer.email, customer.phone, customer.country].filter(Boolean).length
            ? ` · ${[customer.email, customer.phone, customer.country].filter(Boolean).join(' · ')}`
            : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link href="#soa">Statement of Account</Link></Button>
        <Button asChild variant="outline"><Link href={`/admin/chat?customer=${customer.id}`}>Open linked chat</Link></Button>
        <Button asChild><Link href={`/admin/invoices/new?customer=${customer.id}`}><ReceiptText className="h-4 w-4" />Create invoice</Link></Button>
      </div>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card id="profile" className={cn('scroll-mt-24', editingSection === 'profile' && 'ring-2 ring-accent/35')}>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserRound className="h-5 w-5 text-accent" />
            Profile
          </CardTitle>
          {editingSection === 'profile' ? (
            <Button type="button" variant="ghost" size="sm" onClick={stopEdit}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => startEdit('profile')}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {editingSection === 'profile' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="profile-customer-id">Customer ID</Label>
                <Input id="profile-customer-id" value={customer.customer_code} readOnly disabled className="bg-secondary/40" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-full-name">Full name</Label>
                <Input id="profile-full-name" value={profileForm.full_name} onChange={setField('full_name')} required />
              </div>
              <Button type="button" disabled={profileSaving} onClick={() => void saveProfile('Profile')}>
                {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save profile
              </Button>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <ReadField label="Customer ID" value={customer.customer_code} />
              <ReadField label="Full name" value={customer.full_name} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="company" className={cn('scroll-mt-24', editingSection === 'company' && 'ring-2 ring-accent/35')}>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5 text-accent" />
            Company info
          </CardTitle>
          {editingSection === 'company' ? (
            <Button type="button" variant="ghost" size="sm" onClick={stopEdit}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => startEdit('company')}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {editingSection === 'company' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="company-name">Company name</Label>
                <Input id="company-name" value={profileForm.company_name} onChange={setField('company_name')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company-trn">Tax registration number</Label>
                <Input id="company-trn" value={profileForm.tax_registration_number} onChange={setField('tax_registration_number')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company-country">Country</Label>
                <Input id="company-country" value={profileForm.country} onChange={setField('country')} />
              </div>
              <Button type="button" disabled={profileSaving} onClick={() => void saveProfile('Company info')}>
                {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save company info
              </Button>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <ReadField label="Company name" value={customer.company_name} />
              <ReadField label="Tax registration number" value={customer.tax_registration_number} />
              <ReadField label="Country" value={customer.country} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="contact" className={cn('scroll-mt-24', editingSection === 'contact' && 'ring-2 ring-accent/35')}>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Contact className="h-5 w-5 text-accent" />
            Contact info
          </CardTitle>
          {editingSection === 'contact' ? (
            <Button type="button" variant="ghost" size="sm" onClick={stopEdit}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => startEdit('contact')}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {editingSection === 'contact' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input id="contact-email" type="email" value={profileForm.email} onChange={setField('email')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-phone">Phone</Label>
                  <Input id="contact-phone" value={profileForm.phone} onChange={setField('phone')} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="contact-whatsapp">WhatsApp</Label>
                  <Input id="contact-whatsapp" value={profileForm.whatsapp} onChange={setField('whatsapp')} />
                </div>
              </div>
              <Button type="button" disabled={profileSaving} onClick={() => void saveProfile('Contact info')}>
                {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save contact info
              </Button>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <ReadField label="Email" value={customer.email} />
              <ReadField label="Phone" value={customer.phone} />
              <ReadField label="WhatsApp" value={customer.whatsapp} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="details" className={cn('scroll-mt-24', editingSection === 'details' && 'ring-2 ring-accent/35')}>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5 text-accent" />
            Customer details
          </CardTitle>
          {editingSection === 'details' ? (
            <Button type="button" variant="ghost" size="sm" onClick={stopEdit}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => startEdit('details')}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {editingSection === 'details' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="details-address">Address</Label>
                <Input id="details-address" value={profileForm.address} onChange={setField('address')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="details-notes">Notes</Label>
                <Input id="details-notes" value={profileForm.notes} onChange={setField('notes')} />
              </div>
              <Button type="button" disabled={profileSaving} onClick={() => void saveProfile('Customer details')}>
                {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save customer details
              </Button>
            </>
          ) : (
            <div className="grid gap-3">
              <ReadField label="Address" value={customer.address} />
              <ReadField label="Notes" value={customer.notes} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>

    <Card id="consignee" className={cn('scroll-mt-24', editingSection === 'consignee' && 'ring-2 ring-accent/35')}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShoppingBag className="h-5 w-5 text-accent" />
          Consignee details
        </CardTitle>
        {editingSection === 'consignee' ? (
          <Button type="button" variant="ghost" size="sm" onClick={stopEdit}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => startEdit('consignee')}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Shipping consignee used on export docs when different from the billing customer.</p>
        {editingSection === 'consignee' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="consignee-name">Consignee name</Label>
                <Input id="consignee-name" value={profileForm.consignee_name} onChange={setField('consignee_name')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consignee-company">Consignee company</Label>
                <Input id="consignee-company" value={profileForm.consignee_company} onChange={setField('consignee_company')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consignee-phone">Consignee phone</Label>
                <Input id="consignee-phone" value={profileForm.consignee_phone} onChange={setField('consignee_phone')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consignee-email">Consignee email</Label>
                <Input id="consignee-email" type="email" value={profileForm.consignee_email} onChange={setField('consignee_email')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consignee-country">Consignee country</Label>
                <Input id="consignee-country" value={profileForm.consignee_country} onChange={setField('consignee_country')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consignee-address">Consignee address</Label>
                <Input id="consignee-address" value={profileForm.consignee_address} onChange={setField('consignee_address')} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="consignee-notes">Consignee notes</Label>
                <Input id="consignee-notes" value={profileForm.consignee_notes} onChange={setField('consignee_notes')} />
              </div>
            </div>
            <Button type="button" disabled={profileSaving} onClick={() => void saveProfile('Consignee details')}>
              {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save consignee details
            </Button>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadField label="Consignee name" value={customer.consignee_name} />
            <ReadField label="Consignee company" value={customer.consignee_company} />
            <ReadField label="Consignee phone" value={customer.consignee_phone} />
            <ReadField label="Consignee email" value={customer.consignee_email} />
            <ReadField label="Consignee country" value={customer.consignee_country} />
            <ReadField label="Consignee address" value={customer.consignee_address} />
            <div className="sm:col-span-2">
              <ReadField label="Consignee notes" value={customer.consignee_notes} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    <Card id="portal" className="scroll-mt-24 border-accent/25 bg-accent/[0.04]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5 text-accent" />
          Customer portal access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This creates a separate login for the customer at <Link href="/portal" className="font-semibold text-accent underline">/portal</Link> so they can view their own invoices. It never adds them as staff.
        </p>
        {portalLink ? (
          <p className="rounded-lg border bg-background p-3 text-sm">
            Portal login active for <strong>{portalLink.email}</strong>
            {portalLink.is_active ? '' : ' (inactive)'}.
          </p>
        ) : isAccountAdmin ? (
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => void enablePortal(event)}>
            <div className="space-y-1.5">
              <Label htmlFor="portal-email">Portal email</Label>
              <Input id="portal-email" type="email" required value={portalEmail} onChange={(event) => setPortalEmail(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-password">Temporary password</Label>
              <Input id="portal-password" type="text" required minLength={8} value={portalPassword} onChange={(event) => setPortalPassword(event.target.value)} placeholder="At least 8 characters" />
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="accent" disabled={portalBusy}>
                {portalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Enable portal
              </Button>
            </div>
          </form>
        ) : (
          <p className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
            Portal access can only be enabled by an account administrator.
          </p>
        )}
      </CardContent>
    </Card>

    <CustomerLifecycleTimeline customerId={customerId} />

    <section id="soa" className="scroll-mt-24 space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Statement of Account</h2>
          <p className="text-sm text-muted-foreground">
            Balances listed per currency — amounts are not converted. Allocate only matching currencies.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void exportSoaExcel()} disabled={invoices.length === 0 && remittances.length === 0}>
            <FileSpreadsheet className="h-4 w-4" />
            Download Excel
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Save / Print PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {([
          ['Receivable invoices', soaTotals.invoiced, ReceiptText],
          ['Payments allocated', soaTotals.allocated, CheckCircle2],
          ['Outstanding balance', soaTotals.balance, WalletCards],
          ['Available remittance', soaTotals.available, Banknote],
        ] as const).map(([label, amounts, Icon]) => (
          <Card key={label}>
            <CardContent className="flex items-start justify-between gap-3 p-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">{label}</p>
                <div className="mt-1.5">
                  <MoneyBreakdown amounts={amounts} size="lg" />
                </div>
              </div>
              <span className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoices and payments · last 6 months</CardTitle>
            <p className="text-sm text-muted-foreground">Chart shows {chartCurrency} only — no FX conversion across currencies.</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => money(Number(value), chartCurrency)} />
                <Bar dataKey="invoices" name="Invoiced" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                <Bar dataKey="payments" name="Paid" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card id="allocate" className="scroll-mt-24">
          <CardHeader><CardTitle className="text-lg">Allocate received funds</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="soa-remittance">Confirmed remittance</Label>
              <select id="soa-remittance" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={remittanceId} onChange={(event) => chooseRemittance(event.target.value)}>
                <option value="">Select available funds</option>
                {usableRemittances.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.remittance_number} · {money(Number(row.amount) - (allocatedByRemittance[row.id] || 0), row.currency)} available
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="soa-invoice">Open invoice</Label>
              <select
                id="soa-invoice"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={invoiceId}
                onChange={(event) => {
                  setInvoiceId(event.target.value);
                  const invoice = invoices.find((row) => row.id === event.target.value);
                  const available = selectedRemittance ? Number(selectedRemittance.amount) - (allocatedByRemittance[selectedRemittance.id] || 0) : 0;
                  setAllocationAmount(String(Math.min(available, Number(invoice?.balance_due || 0)) || ''));
                }}
              >
                <option value="">Select invoice</option>
                {openInvoices
                  .filter((row) => !selectedRemittance || row.currency === selectedRemittance.currency)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.invoice_number}
                      {stockRefsByInvoice[row.id]?.length ? ` · ${stockRefsByInvoice[row.id].join(', ')}` : ''}
                      {' · '}
                      {money(row.balance_due, row.currency)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="soa-amount">Amount {selectedInvoice ? `(${selectedInvoice.currency})` : ''}</Label>
              <Input id="soa-amount" type="number" min="0.01" step="0.01" value={allocationAmount} onChange={(event) => setAllocationAmount(event.target.value)} />
            </div>
            <Button className="w-full" disabled={busy || !remittanceId || !invoiceId} onClick={() => void allocate()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
              Apply payment
            </Button>
            <p className="text-xs text-muted-foreground">Only matching customer and currency records can be linked. Every change remains auditable.</p>
          </CardContent>
        </Card>
      </div>

      {notice ? <div role="status" className="rounded-lg border bg-secondary/30 p-3 text-sm">{notice}</div> : null}

      <Card id="ledger" className="scroll-mt-24">
        <CardHeader><CardTitle className="text-lg">Statement ledger</CardTitle></CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No documents on this statement yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4">Reference</th>
                    <th className="p-4">Stock</th>
                    <th className="p-4">Type</th>
                    <th className="p-4 text-right">Debit</th>
                    <th className="p-4 text-right">Credit</th>
                    <th className="p-4 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-t">
                      <td className="p-4">{invoice.issue_date}</td>
                      <td className="p-4">
                        <Link href={`/admin/invoices/${invoice.id}`} className="font-semibold text-primary hover:underline">
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">{stockRefsByInvoice[invoice.id]?.join(', ') || '—'}</td>
                      <td className="p-4 capitalize">{invoice.document_type.replaceAll('_', ' ')}</td>
                      <td className="p-4 text-right">
                        {receivableDocument(invoice.document_type) ? money(invoice.total_amount, invoice.currency) : 'Non-posting'}
                      </td>
                      <td className="p-4 text-right">{money(invoice.amount_paid, invoice.currency)}</td>
                      <td className="p-4 text-right font-semibold">
                        {receivableDocument(invoice.document_type) ? money(invoice.balance_due, invoice.currency) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card id="remittances" className="scroll-mt-24">
          <CardHeader><CardTitle className="text-lg">Remittances and allocations</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {remittances.map((row) => {
              const used = allocatedByRemittance[row.id] || 0;
              return (
                <div key={row.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{row.remittance_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.received_date} · {row.method.replaceAll('_', ' ')} · {row.bank_reference || 'No bank reference'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{money(row.amount, row.currency)}</p>
                      <p className="text-xs text-muted-foreground">{money(Number(row.amount) - used, row.currency)} available</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {allocations
                      .filter((item) => item.remittance_id === row.id)
                      .map((allocation) => {
                        const invoice = invoices.find((item) => item.id === allocation.invoice_id);
                        const stock = stockRefsByInvoice[allocation.invoice_id]?.join(', ');
                        return (
                          <div key={allocation.id} className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2 text-xs">
                            <span>
                              Applied to {invoice?.invoice_number || 'invoice'}
                              {stock ? ` · ${stock}` : ''} · {money(allocation.amount, row.currency)}
                            </span>
                            <Button variant="ghost" size="sm" className="h-7 text-destructive" disabled={busy} onClick={() => void reverse(allocation)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                              Reverse
                            </Button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
            {remittances.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No remittances recorded for this customer.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card id="buying" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShoppingBag className="h-5 w-5" />
              Buying details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reservedBuying.map((item) => (
              <div key={item.key} className="flex items-start justify-between gap-4 rounded-lg border border-accent/30 bg-accent/[0.04] p-4">
                <div>
                  <p className="font-medium">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Reserved · {item.kind} · Ref {item.inventory_reference}
                  </p>
                </div>
                <span className="shrink-0 font-semibold">{money(item.line_total, item.currency || chartCurrency)}</span>
              </div>
            ))}
            {buyingInvoiceItems.map((item) => {
              const invoice = invoices.find((row) => row.id === item.invoice_id);
              return (
                <div key={item.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {invoice?.invoice_number} · Qty {item.quantity}
                      {item.inventory_reference ? ` · Ref ${item.inventory_reference}` : ''}
                      {item.inventory_type ? ` · ${item.inventory_type}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold">{money(item.line_total, invoice?.currency || chartCurrency)}</span>
                </div>
              );
            })}
            {reservedBuying.length === 0 && buyingInvoiceItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No reserved stock or invoice buying details yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  </div>;
}

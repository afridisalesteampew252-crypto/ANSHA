'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookmarkPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  SearchableSelect,
  customerSelectOption,
  vehicleSelectOption,
} from '@/components/admin/searchable-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { isFieldAgentRole } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import {
  PRICE_TERM_LABELS,
  PRICE_TERMS,
  REQUESTER_ROLE_LABELS,
  REQUESTER_ROLES,
  SHIPMENT_MODE_LABELS,
  SHIPMENT_MODES,
  inspectionChoiceToBool,
  priceForTerm,
  vatChoiceToBool,
  type InspectionChoice,
  type PriceTerm,
  type RequesterRole,
  type ShipmentMode,
  type VatChoice,
} from '@/lib/trade-terms';
import type { AdminRole } from '@/lib/types';

type Customer = {
  id: string;
  customer_code: string;
  full_name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
};
type Vehicle = {
  id: string;
  title: string;
  stock_number: string | null;
  chassis_number: string | null;
  make: string | null;
  model: string | null;
  price: number | null;
  price_fob: number | null;
  price_cf: number | null;
  price_cif: number | null;
  currency: string;
  stock_status: string;
  is_published: boolean;
};

const defaultDue = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
};

function roleToRequester(role: AdminRole | null): RequesterRole {
  if (role === 'admin') return 'admin';
  if (role === 'manager') return 'manager';
  return 'sales';
}

export default function ReservationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedVehicle = searchParams.get('vehicle') || '';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState(preselectedVehicle);
  const [unitPrice, setUnitPrice] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [taxRate, setTaxRate] = useState('5');
  const [dueDate, setDueDate] = useState(defaultDue);
  const [notes, setNotes] = useState('');
  const [priceTerm, setPriceTerm] = useState<PriceTerm | ''>('fob');
  const [shipmentTerm, setShipmentTerm] = useState<ShipmentMode | ''>('roro');
  const [inspectionRequired, setInspectionRequired] = useState<InspectionChoice | ''>('');
  const [vatApplicable, setVatApplicable] = useState<VatChoice | ''>('yes');
  const [requesterName, setRequesterName] = useState('');
  const [requesterRole, setRequesterRole] = useState<RequesterRole | ''>('sales');
  const [etd, setEtd] = useState('');
  const [eta, setEta] = useState('');
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);
  const fieldAgent = isFieldAgentRole(role);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const { data: prof } = await supabase
        .from('admin_profiles')
        .select('role,full_name,email')
        .eq('id', session.user.id)
        .maybeSingle();
      const nextRole = (prof?.role as AdminRole) || null;
      setRole(nextRole);
      setRequesterRole(roleToRequester(nextRole));
      if (prof?.full_name) setRequesterName(prof.full_name);
      else if (prof?.email) setRequesterName(prof.email);
    }
    const [custRes, vehRes] = await Promise.all([
      supabase
        .from('customers')
        .select('id,customer_code,full_name,company_name,phone,email')
        .eq('is_active', true)
        .order('full_name')
        .limit(500),
      supabase
        .from('vehicles')
        .select(
          'id,title,stock_number,chassis_number,make,model,price,price_fob,price_cf,price_cif,currency,stock_status,is_published'
        )
        .eq('stock_status', 'available')
        .order('created_at', { ascending: false })
        .limit(500),
    ]);
    if (custRes.error) toast.error(custRes.error.message);
    if (vehRes.error) toast.error(vehRes.error.message);
    setCustomers((custRes.data || []) as Customer[]);
    setVehicles((vehRes.data || []) as Vehicle[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (preselectedVehicle) setVehicleId(preselectedVehicle);
  }, [preselectedVehicle]);

  useEffect(() => {
    if (vatApplicable === 'no') setTaxRate('0');
    else if (vatApplicable === 'yes' && taxRate === '0') setTaxRate('5');
  }, [vatApplicable, taxRate]);

  const selectedVehicle = useMemo(() => vehicles.find((row) => row.id === vehicleId) || null, [vehicles, vehicleId]);
  const customerOptions = useMemo(() => customers.map(customerSelectOption), [customers]);
  const vehicleOptions = useMemo(() => vehicles.map(vehicleSelectOption), [vehicles]);

  useEffect(() => {
    if (!selectedVehicle) return;
    setCurrency(selectedVehicle.currency || 'AED');
    const term = priceTerm || 'fob';
    const quoted = priceForTerm(term, selectedVehicle);
    setUnitPrice(quoted != null ? String(quoted) : '');
  }, [selectedVehicle, priceTerm]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!customerId || !vehicleId) {
      toast.error('Select a customer and an available vehicle.');
      return;
    }
    if (!priceTerm) {
      toast.error('Select a price term (FOB, C&F, or CIF).');
      return;
    }
    if (!shipmentTerm) {
      toast.error('Select a shipment term.');
      return;
    }
    if (!inspectionRequired) {
      toast.error('Select whether inspection is required (Yes or No).');
      return;
    }
    if (!vatApplicable) {
      toast.error('Select whether VAT applies (Yes or No).');
      return;
    }
    if (!requesterName.trim()) {
      toast.error('Enter the requester name.');
      return;
    }
    if (!requesterRole) {
      toast.error('Select the requester role (Sales / Manager / Admin).');
      return;
    }
    const applyVat = vatChoiceToBool(vatApplicable) !== false;
    setBusy(true);
    const { data, error } = await supabase.rpc('create_vehicle_reservation_proforma', {
      p_vehicle_id: vehicleId,
      p_customer_id: customerId,
      p_unit_price: unitPrice === '' ? null : Number(unitPrice),
      p_currency: currency,
      p_tax_rate: applyVat ? Number(taxRate) || 5 : 0,
      p_due_date: dueDate,
      p_notes: notes || null,
      p_reference: null,
      p_price_term: priceTerm,
      p_shipment_term: shipmentTerm,
      p_inspection_required: inspectionChoiceToBool(inspectionRequired),
      p_vat_applicable: applyVat,
      p_etd: etd || null,
      p_eta: eta || null,
      p_requester_name: requesterName.trim(),
      p_requester_role: requesterRole,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as { invoice_id?: string; vehicle_id?: string } | null;
    toast.success('Vehicle reserved and assigned to you. Proforma created.');
    if (result?.invoice_id) {
      router.push(`/admin/invoices/${result.invoice_id}`);
      return;
    }
    await load();
    setVehicleId('');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reserve vehicle</h1>
        <p className="text-sm text-muted-foreground">
          Hold available stock for a customer, assign it to the reserving sales agent, unpublish it, and create a
          proforma draft. Capture requester, ETA/ETD, and VAT Yes/No.
          {fieldAgent ? ' Only you will see this reserved unit in your sales list (ops still see all).' : ''}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Customer + vehicle</CardTitle>
          <CardDescription>
            Only available vehicles are listed. Reserved units leave the public catalog automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="res-customer">Customer</Label>
              <SearchableSelect
                id="res-customer"
                value={customerId}
                onValueChange={setCustomerId}
                options={customerOptions}
                placeholder="Select customer"
                searchPlaceholder="Search code, name, company, phone, email…"
                clearLabel="Select customer"
                required
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="res-vehicle">Available vehicle</Label>
              <SearchableSelect
                id="res-vehicle"
                value={vehicleId}
                onValueChange={setVehicleId}
                options={vehicleOptions}
                placeholder="Select vehicle"
                searchPlaceholder="Search stock #, chassis, title, make/model…"
                clearLabel="Select vehicle"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-price-term">Price term</Label>
              <select
                id="res-price-term"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={priceTerm}
                onChange={(e) => setPriceTerm(e.target.value as PriceTerm)}
                required
              >
                {PRICE_TERMS.map((term) => (
                  <option key={term} value={term}>
                    {PRICE_TERM_LABELS[term]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-shipment-term">Shipment term</Label>
              <select
                id="res-shipment-term"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={shipmentTerm}
                onChange={(e) => setShipmentTerm(e.target.value as ShipmentMode)}
                required
              >
                {SHIPMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {SHIPMENT_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-inspection">Inspection</Label>
              <select
                id="res-inspection"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={inspectionRequired}
                onChange={(e) => setInspectionRequired(e.target.value as InspectionChoice | '')}
                required
              >
                <option value="" disabled>
                  Select Yes or No
                </option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-vat">VAT</Label>
              <select
                id="res-vat"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={vatApplicable}
                onChange={(e) => setVatApplicable(e.target.value as VatChoice | '')}
                required
              >
                <option value="yes">Yes — apply VAT</option>
                <option value="no">No — exclude VAT (0%)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-requester">Requester name</Label>
              <Input
                id="res-requester"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                required
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-requester-role">Requester role</Label>
              <select
                id="res-requester-role"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={requesterRole}
                onChange={(e) => setRequesterRole(e.target.value as RequesterRole)}
                required
              >
                {REQUESTER_ROLES.map((item) => (
                  <option key={item} value={item}>
                    {REQUESTER_ROLE_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-etd">ETD</Label>
              <Input id="res-etd" type="date" value={etd} onChange={(e) => setEtd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-eta">ETA</Label>
              <Input id="res-eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
            {selectedVehicle ? (
              <div className="sm:col-span-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Catalog quotes: FOB {selectedVehicle.price_fob ?? '—'} · C&F {selectedVehicle.price_cf ?? '—'} · CIF{' '}
                {selectedVehicle.price_cif ?? '—'} · list {selectedVehicle.price ?? '—'} ({selectedVehicle.currency})
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="res-price">Unit price</Label>
              <Input
                id="res-price"
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-currency">Currency</Label>
              <Input id="res-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-tax">VAT %</Label>
              <Input
                id="res-tax"
                type="number"
                min="0"
                step="0.01"
                value={taxRate}
                disabled={vatApplicable === 'no'}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-due">Proforma due date</Label>
              <Input id="res-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="res-notes">Notes</Label>
              <Textarea
                id="res-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional reservation note on the proforma"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                Reserve + create proforma
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href="/admin/customers">Customers</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

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
  SHIPMENT_MODE_LABELS,
  SHIPMENT_MODES,
  inspectionChoiceToBool,
  priceForTerm,
  type InspectionChoice,
  type PriceTerm,
  type ShipmentMode,
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
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);
  const fieldAgent = isFieldAgentRole(role);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const { data: prof } = await supabase.from('admin_profiles').select('role').eq('id', session.user.id).maybeSingle();
      setRole((prof?.role as AdminRole) || null);
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
    setBusy(true);
    const { data, error } = await supabase.rpc('create_vehicle_reservation_proforma', {
      p_vehicle_id: vehicleId,
      p_customer_id: customerId,
      p_unit_price: unitPrice === '' ? null : Number(unitPrice),
      p_currency: currency,
      p_tax_rate: Number(taxRate) || 5,
      p_due_date: dueDate,
      p_notes: notes || null,
      p_reference: null,
      p_price_term: priceTerm,
      p_shipment_term: shipmentTerm,
      p_inspection_required: inspectionChoiceToBool(inspectionRequired),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as { invoice_id?: string; vehicle_id?: string } | null;
    toast.success('Vehicle reserved and proforma created.');
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
          Hold available stock for a customer, unpublish it from the website, and create a proforma invoice draft.
          Choose price term (FOB / C&F / CIF), shipment term (DHL / RoRo / container), and inspection (Yes / No).
          {fieldAgent ? ' Ops will finalize the customer invoice after reservation.' : ''}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Customer + vehicle</CardTitle>
          <CardDescription>
            Only available vehicles are listed. Reserved units leave the public catalog automatically. Price term,
            shipment term, and inspection are stored on the vehicle until release.
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
              <Input id="res-tax" type="number" min="0" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
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

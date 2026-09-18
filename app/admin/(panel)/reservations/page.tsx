'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { supabase } from '@/lib/supabase/client';

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [taxRate, setTaxRate] = useState('5');
  const [dueDate, setDueDate] = useState(defaultDue);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [custRes, vehRes] = await Promise.all([
      supabase
        .from('customers')
        .select('id,customer_code,full_name,company_name,phone,email')
        .eq('is_active', true)
        .order('full_name')
        .limit(500),
      supabase
        .from('vehicles')
        .select('id,title,stock_number,chassis_number,make,model,price,currency,stock_status,is_published')
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

  const selectedVehicle = useMemo(() => vehicles.find((row) => row.id === vehicleId) || null, [vehicles, vehicleId]);
  const customerOptions = useMemo(() => customers.map(customerSelectOption), [customers]);
  const vehicleOptions = useMemo(() => vehicles.map(vehicleSelectOption), [vehicles]);

  useEffect(() => {
    if (!selectedVehicle) return;
    setUnitPrice(selectedVehicle.price != null ? String(selectedVehicle.price) : '');
    setCurrency(selectedVehicle.currency || 'AED');
  }, [selectedVehicle]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!customerId || !vehicleId) {
      toast.error('Select a customer and an available vehicle.');
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
    } else {
      await load();
      setVehicleId('');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reserve vehicle</h1>
        <p className="text-sm text-muted-foreground">
          Hold available stock for a customer, unpublish it from the website, and create a proforma invoice draft.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Customer + vehicle</CardTitle>
          <CardDescription>Only available vehicles are listed. Reserved units leave the public catalog automatically.</CardDescription>
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
              <Label htmlFor="res-price">Unit price</Label>
              <Input id="res-price" type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
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
              <Textarea id="res-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional reservation note on the proforma" />
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

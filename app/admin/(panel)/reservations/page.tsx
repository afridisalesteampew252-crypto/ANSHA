'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookmarkPlus, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { BulkReserveDialog } from '@/components/admin/bulk-reserve-dialog';
import {
  SearchableSelect,
  customerSelectOption,
  vehicleSelectOption,
} from '@/components/admin/searchable-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
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
  accountRoleToRequesterRole,
  inspectionChoiceToBool,
  priceForTerm,
  profileRequesterName,
  vatChoiceToBool,
  type InspectionChoice,
  type PriceTerm,
  type RequesterRole,
  type ShipmentMode,
  type VatChoice,
} from '@/lib/trade-terms';
import type { AdminRole } from '@/lib/types';
import { cn } from '@/lib/utils';

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
type Part = {
  id: string;
  name: string;
  part_code: string;
  oem_number: string | null;
  quantity: number;
  price: number | null;
  price_fob: number | null;
  price_cf: number | null;
  price_cif: number | null;
  currency: string;
  stock_status: string;
};

const defaultDue = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
};

const fieldClass = 'space-y-2';

function partSelectOption(part: Part) {
  return {
    value: part.id,
    label: `${part.part_code} — ${part.name}`,
    keywords: [part.part_code, part.name, part.oem_number],
  };
}

export default function ReservationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ReservationsPageInner />
    </Suspense>
  );
}

function ReservationsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedVehicle = searchParams.get('vehicle') || '';
  const preselectedPart = searchParams.get('part') || '';
  const kindParam = searchParams.get('kind');
  const initialKind: 'vehicle' | 'part' =
    kindParam === 'part' || preselectedPart ? 'part' : 'vehicle';

  const [kind, setKind] = useState<'vehicle' | 'part'>(initialKind);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState(preselectedVehicle);
  const [partId, setPartId] = useState(preselectedPart);
  const [unitPrice, setUnitPrice] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [taxRate, setTaxRate] = useState('5');
  const [dueDate, setDueDate] = useState(defaultDue);
  const [notes, setNotes] = useState('');
  const [priceTerm, setPriceTerm] = useState<PriceTerm | ''>('fob');
  const [shipmentTerm, setShipmentTerm] = useState<ShipmentMode | ''>(
    initialKind === 'part' ? 'dhl' : 'roro'
  );
  const [inspectionRequired, setInspectionRequired] = useState<InspectionChoice | ''>('');
  const [vatApplicable, setVatApplicable] = useState<VatChoice | ''>('yes');
  const [requesterName, setRequesterName] = useState('');
  const [requesterRole, setRequesterRole] = useState<RequesterRole | ''>('sales');
  const [etd, setEtd] = useState('');
  const [eta, setEta] = useState('');
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [bulkVehicleIds, setBulkVehicleIds] = useState<Set<string>>(new Set());
  const [bulkPartIds, setBulkPartIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const fieldAgent = isFieldAgentRole(role);
  const requesterLocked = fieldAgent;
  const inspectionInvalid = attemptedSubmit && !inspectionRequired;

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
      setRequesterRole(accountRoleToRequesterRole(nextRole));
      setRequesterName(profileRequesterName(prof));
    }
    const [custRes, vehRes, partRes] = await Promise.all([
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
      supabase
        .from('parts')
        .select(
          'id,name,part_code,oem_number,quantity,price,price_fob,price_cf,price_cif,currency,stock_status'
        )
        .eq('stock_status', 'available')
        .gt('quantity', 0)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);
    if (custRes.error) toast.error(custRes.error.message);
    if (vehRes.error) toast.error(vehRes.error.message);
    if (partRes.error) toast.error(partRes.error.message);
    setCustomers((custRes.data || []) as Customer[]);
    setVehicles((vehRes.data || []) as Vehicle[]);
    setParts((partRes.data || []) as Part[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (preselectedVehicle) {
      setKind('vehicle');
      setVehicleId(preselectedVehicle);
    }
  }, [preselectedVehicle]);

  useEffect(() => {
    if (preselectedPart) {
      setKind('part');
      setPartId(preselectedPart);
      setShipmentTerm((prev) => prev || 'dhl');
    }
  }, [preselectedPart]);

  useEffect(() => {
    if (kind === 'part' && !shipmentTerm) setShipmentTerm('dhl');
  }, [kind, shipmentTerm]);

  useEffect(() => {
    if (vatApplicable === 'no') setTaxRate('0');
    else if (vatApplicable === 'yes' && taxRate === '0') setTaxRate('5');
  }, [vatApplicable, taxRate]);

  const selectedVehicle = useMemo(
    () => vehicles.find((row) => row.id === vehicleId) || null,
    [vehicles, vehicleId]
  );
  const selectedPart = useMemo(() => parts.find((row) => row.id === partId) || null, [parts, partId]);
  const customerOptions = useMemo(() => customers.map(customerSelectOption), [customers]);
  const vehicleOptions = useMemo(() => vehicles.map(vehicleSelectOption), [vehicles]);
  const partOptions = useMemo(() => parts.map(partSelectOption), [parts]);
  const bulkVehicleLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of vehicles) {
      map[v.id] = v.stock_number || v.chassis_number || v.title || v.id.slice(0, 8);
    }
    return map;
  }, [vehicles]);
  const bulkPartLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.id] = p.part_code || p.name || p.id.slice(0, 8);
    }
    return map;
  }, [parts]);
  const bulkSelectedVehicleIds = useMemo(() => Array.from(bulkVehicleIds), [bulkVehicleIds]);
  const bulkSelectedPartIds = useMemo(() => Array.from(bulkPartIds), [bulkPartIds]);
  const bulkTotal = bulkSelectedVehicleIds.length + bulkSelectedPartIds.length;

  useEffect(() => {
    if (kind === 'vehicle' && selectedVehicle) {
      setCurrency(selectedVehicle.currency || 'AED');
      const term = priceTerm || 'fob';
      const quoted = priceForTerm(term, selectedVehicle);
      setUnitPrice(quoted != null ? String(quoted) : '');
    }
  }, [kind, selectedVehicle, priceTerm]);

  useEffect(() => {
    if (kind === 'part' && selectedPart) {
      setCurrency(selectedPart.currency || 'AED');
      const term = priceTerm || 'fob';
      const quoted = priceForTerm(term, selectedPart);
      setUnitPrice(quoted != null ? String(quoted) : '');
    }
  }, [kind, selectedPart, priceTerm]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttemptedSubmit(true);
    if (!customerId) {
      toast.error('Select a customer.');
      return;
    }
    if (kind === 'vehicle' && !vehicleId) {
      toast.error('Select an available vehicle.');
      return;
    }
    if (kind === 'part' && !partId) {
      toast.error('Select an available part.');
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
    if (!requesterLocked) {
      if (!requesterName.trim()) {
        toast.error('Enter the requester name.');
        return;
      }
      if (!requesterRole) {
        toast.error('Select the requester role.');
        return;
      }
    }
    const applyVat = vatChoiceToBool(vatApplicable) !== false;
    setBusy(true);

    if (kind === 'part') {
      const { data, error } = await supabase.rpc('create_part_reservation_proforma', {
        p_part_id: partId,
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
        p_requester_name: requesterLocked ? null : requesterName.trim(),
        p_requester_role: requesterLocked ? null : requesterRole,
        p_quantity: 1,
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      const result = data as { invoice_id?: string } | null;
      toast.success('Part reserved and assigned to you. Proforma created.');
      if (result?.invoice_id) {
        router.push(`/admin/invoices/${result.invoice_id}`);
        return;
      }
      await load();
      setPartId('');
      return;
    }

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
      p_requester_name: requesterLocked ? null : requesterName.trim(),
      p_requester_role: requesterLocked ? null : requesterRole,
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
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Reservations</p>
        <h1 className="flex items-center gap-2.5 text-2xl font-black tracking-tight sm:text-[1.75rem]">
          <BookmarkPlus className="h-6 w-6 shrink-0 text-accent" />
          {mode === 'bulk'
            ? 'Bulk reserve'
            : `Reserve ${kind === 'part' ? 'part' : 'vehicle'}`}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {mode === 'bulk'
            ? 'Select multiple available vehicles and/or parts, then reserve them together for one customer with shared trade terms. Each item is reserved individually so SOA stays correct.'
            : 'Hold available stock for a customer, assign it to the reserving sales agent, unpublish it, and create a proforma draft.'}
          {fieldAgent
            ? ' Requester is locked to your profile. Only you will see reserved units you own (ops still see all).'
            : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div
          className="inline-flex rounded-full border border-border/80 bg-card p-1 shadow-sm"
          role="group"
          aria-label="Reservation mode"
        >
          {([
            { id: 'single' as const, label: 'Single + proforma' },
            { id: 'bulk' as const, label: 'Bulk reserve' },
          ]).map((item) => {
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={cn(
                  'min-h-10 rounded-full px-4 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={active}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {mode === 'single' ? (
          <div
            className="inline-flex rounded-full border border-border/80 bg-card p-1 shadow-sm"
            role="group"
            aria-label="Stock kind"
          >
            {(['vehicle', 'part'] as const).map((item) => {
              const active = kind === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setKind(item);
                    if (item === 'part') setShipmentTerm('dhl');
                    else if (!shipmentTerm || shipmentTerm === 'dhl') setShipmentTerm('roro');
                  }}
                  className={cn(
                    'min-h-10 min-w-[5.5rem] rounded-full px-5 text-sm font-semibold capitalize transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-pressed={active}
                >
                  {item}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {mode === 'bulk' ? (
        <>
          <Card className="overflow-hidden">
            <CardHeader className="space-y-1.5 pb-4">
              <CardTitle className="text-lg">Select available stock</CardTitle>
              <CardDescription>
                Only available units are listed. Reserved or sold items cannot be selected. You can also
                multi-select from Vehicles / Parts inventory.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Vehicles ({vehicles.length})</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={vehicles.length === 0}
                    onClick={() => setBulkVehicleIds(new Set(vehicles.map((v) => v.id)))}
                  >
                    Select all
                  </Button>
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border/70 p-2">
                  {vehicles.length === 0 ? (
                    <p className="px-1 py-3 text-xs text-muted-foreground">No available vehicles.</p>
                  ) : (
                    vehicles.map((vehicle) => {
                      const checked = bulkVehicleIds.has(vehicle.id);
                      const label =
                        bulkVehicleLabelMap[vehicle.id] || vehicle.title || vehicle.id.slice(0, 8);
                      return (
                        <label
                          key={vehicle.id}
                          className={cn(
                            'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50',
                            checked && 'bg-accent/10'
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setBulkVehicleIds((prev) => {
                                const next = new Set(prev);
                                if (value === true) next.add(vehicle.id);
                                else next.delete(vehicle.id);
                                return next;
                              });
                            }}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{label}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {vehicle.title}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Parts ({parts.length})</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={parts.length === 0}
                    onClick={() => setBulkPartIds(new Set(parts.map((p) => p.id)))}
                  >
                    Select all
                  </Button>
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border/70 p-2">
                  {parts.length === 0 ? (
                    <p className="px-1 py-3 text-xs text-muted-foreground">No available parts.</p>
                  ) : (
                    parts.map((part) => {
                      const checked = bulkPartIds.has(part.id);
                      const label = bulkPartLabelMap[part.id] || part.name || part.id.slice(0, 8);
                      return (
                        <label
                          key={part.id}
                          className={cn(
                            'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50',
                            checked && 'bg-accent/10'
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setBulkPartIds((prev) => {
                                const next = new Set(prev);
                                if (value === true) next.add(part.id);
                                else next.delete(part.id);
                                return next;
                              });
                            }}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{label}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {part.name}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button
                  type="button"
                  disabled={bulkTotal === 0}
                  onClick={() => setBulkDialogOpen(true)}
                  className="min-h-10"
                >
                  <BookmarkPlus className="h-4 w-4" />
                  Continue with {bulkTotal || 0} selected
                </Button>
                {bulkTotal > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10"
                    onClick={() => {
                      setBulkVehicleIds(new Set());
                      setBulkPartIds(new Set());
                    }}
                  >
                    Clear selection
                  </Button>
                ) : null}
                <Button asChild type="button" variant="outline" className="min-h-10">
                  <Link href="/admin/vehicles">Vehicles inventory</Link>
                </Button>
                <Button asChild type="button" variant="outline" className="min-h-10">
                  <Link href="/admin/parts">Parts inventory</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <BulkReserveDialog
            open={bulkDialogOpen}
            onOpenChange={setBulkDialogOpen}
            vehicleIds={bulkSelectedVehicleIds}
            partIds={bulkSelectedPartIds}
            vehicleLabels={bulkVehicleLabelMap}
            partLabels={bulkPartLabelMap}
            onCompleted={() => {
              setBulkVehicleIds(new Set());
              setBulkPartIds(new Set());
              void load();
            }}
          />
        </>
      ) : (
      <Card className="overflow-hidden">
        <CardHeader className="space-y-1.5 pb-4">
          <CardTitle className="text-lg">Customer + {kind}</CardTitle>
          <CardDescription>
            Only available {kind === 'part' ? 'parts' : 'vehicles'} are listed. Reserved stock leaves the
            public catalog automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)} noValidate>
            <div className={cn(fieldClass, 'sm:col-span-2')}>
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
            {kind === 'vehicle' ? (
              <div className={cn(fieldClass, 'sm:col-span-2')}>
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
            ) : (
              <div className={cn(fieldClass, 'sm:col-span-2')}>
                <Label htmlFor="res-part">Available part</Label>
                <SearchableSelect
                  id="res-part"
                  value={partId}
                  onValueChange={setPartId}
                  options={partOptions}
                  placeholder="Select part"
                  searchPlaceholder="Search part code, name, OEM…"
                  clearLabel="Select part"
                  required
                />
              </div>
            )}
            <div className={fieldClass}>
              <Label htmlFor="res-price-term">Price term</Label>
              <NativeSelect
                id="res-price-term"
                value={priceTerm}
                onChange={(e) => setPriceTerm(e.target.value as PriceTerm)}
              >
                {PRICE_TERMS.map((term) => (
                  <option key={term} value={term}>
                    {PRICE_TERM_LABELS[term]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className={fieldClass}>
              <Label htmlFor="res-shipment-term">Shipment term</Label>
              <NativeSelect
                id="res-shipment-term"
                value={shipmentTerm}
                onChange={(e) => setShipmentTerm(e.target.value as ShipmentMode)}
              >
                {SHIPMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {SHIPMENT_MODE_LABELS[mode]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className={fieldClass}>
              <Label htmlFor="res-inspection">
                Inspection <span className="font-normal text-muted-foreground">(required)</span>
              </Label>
              <NativeSelect
                id="res-inspection"
                value={inspectionRequired}
                onChange={(e) => {
                  setInspectionRequired(e.target.value as InspectionChoice | '');
                }}
                aria-invalid={inspectionInvalid || undefined}
                data-touched={attemptedSubmit ? 'true' : undefined}
                className={inspectionInvalid ? 'border-destructive' : undefined}
              >
                <option value="">Select Yes or No</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </NativeSelect>
              {inspectionInvalid ? (
                <p className="text-[11px] text-destructive" role="alert">
                  Choose Yes or No before submitting.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Required for the reservation proforma.</p>
              )}
            </div>
            <div className={fieldClass}>
              <Label htmlFor="res-vat">VAT</Label>
              <NativeSelect
                id="res-vat"
                value={vatApplicable}
                onChange={(e) => setVatApplicable(e.target.value as VatChoice | '')}
              >
                <option value="yes">Yes — apply VAT</option>
                <option value="no">No — exclude VAT (0%)</option>
              </NativeSelect>
            </div>
            <div className={fieldClass}>
              <Label htmlFor="res-requester" className="flex items-center gap-1.5">
                Requester name
                {requesterLocked ? <Lock className="h-3 w-3 text-muted-foreground" aria-hidden /> : null}
              </Label>
              <Input
                id="res-requester"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                required={!requesterLocked}
                readOnly={requesterLocked}
                maxLength={120}
                className={requesterLocked ? 'admin-readonly-field' : undefined}
                aria-readonly={requesterLocked || undefined}
              />
              {requesterLocked ? (
                <p className="text-[11px] text-muted-foreground">Locked to your profile.</p>
              ) : null}
            </div>
            <div className={fieldClass}>
              <Label htmlFor="res-requester-role" className="flex items-center gap-1.5">
                Requester role
                {requesterLocked ? <Lock className="h-3 w-3 text-muted-foreground" aria-hidden /> : null}
              </Label>
              {requesterLocked ? (
                <>
                  <Input
                    id="res-requester-role"
                    readOnly
                    value={requesterRole ? REQUESTER_ROLE_LABELS[requesterRole] : ''}
                    className="admin-readonly-field"
                    aria-readonly
                  />
                  <p className="text-[11px] text-muted-foreground">Locked to your profile.</p>
                </>
              ) : (
                <NativeSelect
                  id="res-requester-role"
                  value={requesterRole}
                  onChange={(e) => setRequesterRole(e.target.value as RequesterRole)}
                >
                  {REQUESTER_ROLES.map((item) => (
                    <option key={item} value={item}>
                      {REQUESTER_ROLE_LABELS[item]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </div>
            <div className={fieldClass}>
              <Label htmlFor="res-etd">ETD</Label>
              <Input id="res-etd" type="date" value={etd} onChange={(e) => setEtd(e.target.value)} />
            </div>
            <div className={fieldClass}>
              <Label htmlFor="res-eta">ETA</Label>
              <Input id="res-eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
            {kind === 'vehicle' && selectedVehicle ? (
              <div className="sm:col-span-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                Catalog quotes: FOB {selectedVehicle.price_fob ?? '—'} · C&F {selectedVehicle.price_cf ?? '—'}{' '}
                · CIF {selectedVehicle.price_cif ?? '—'} · list {selectedVehicle.price ?? '—'} (
                {selectedVehicle.currency})
              </div>
            ) : null}
            {kind === 'part' && selectedPart ? (
              <div className="sm:col-span-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                Qty {selectedPart.quantity} · FOB {selectedPart.price_fob ?? '—'} · C&F{' '}
                {selectedPart.price_cf ?? '—'} · CIF {selectedPart.price_cif ?? '—'} · list{' '}
                {selectedPart.price ?? '—'} ({selectedPart.currency})
              </div>
            ) : null}
            <div className={fieldClass}>
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
            <div className={fieldClass}>
              <Label htmlFor="res-currency">Currency</Label>
              <Input
                id="res-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                maxLength={3}
              />
            </div>
            <div className={fieldClass}>
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
            <div className={fieldClass}>
              <Label htmlFor="res-due">Proforma due date</Label>
              <Input id="res-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className={cn(fieldClass, 'sm:col-span-2')}>
              <Label htmlFor="res-notes">Notes</Label>
              <Textarea
                id="res-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional reservation note on the proforma"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1 sm:col-span-2">
              <Button type="submit" disabled={busy} className="min-h-10">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                Reserve + create proforma
              </Button>
              <Button asChild type="button" variant="outline" className="min-h-10">
                <Link href="/admin/customers">Customers</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      )}
    </div>
  );
}

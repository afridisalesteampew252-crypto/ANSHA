'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, Save, Ship } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { STOCK_ORIGINS, stockOriginLabel } from '@/lib/stock';
import {
  LIFECYCLE_EVENT_TYPES,
  LIFECYCLE_STAGES,
  RECOMMENDED_NEXT_STAGE,
  lifecycleEventLabel,
  lifecycleStageLabel,
  type LifecycleStage,
} from '@/lib/vehicle-lifecycle';
import type { LifecycleEventType, StockStatus, Vehicle, VehicleLifecycleEvent } from '@/lib/types';

const statusClass: Record<StockStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  reserved: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sold: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
};

const stageClass: Record<LifecycleStage, string> = {
  unassigned: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  auction: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  yard: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  port: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  sold: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
};

export default function AdminVehicleDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const { id } = params;
  const router = useRouter();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [events, setEvents] = useState<VehicleLifecycleEvent[]>([]);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [recording, setRecording] = useState(false);

  const [title, setTitle] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [year, setYear] = useState('');
  const [stockNumber, setStockNumber] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [location, setLocation] = useState('');
  const [stockOrigin, setStockOrigin] = useState('dubai');
  const [stockStatus, setStockStatus] = useState<StockStatus>('available');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseCurrency, setPurchaseCurrency] = useState('AED');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [landedCost, setLandedCost] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: string; label: string }>>([]);
  const [supplierId, setSupplierId] = useState('');
  const [customers, setCustomers] = useState<Array<{ id: string; label: string }>>([]);
  const [reserveCustomerId, setReserveCustomerId] = useState('');
  const [reserveBusy, setReserveBusy] = useState(false);

  const [nextStage, setNextStage] = useState<LifecycleStage>('auction');
  const [stageNotes, setStageNotes] = useState('');
  const [eventType, setEventType] = useState<Exclude<LifecycleEventType, 'stage_change'>>('inspection');
  const [eventTitle, setEventTitle] = useState('');
  const [eventNotes, setEventNotes] = useState('');

  const load = useCallback(async () => {
    setFetching(true);
    const [vehicleRes, eventsRes] = await Promise.all([
      supabase.from('vehicles').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('vehicle_lifecycle_events')
        .select('*')
        .eq('vehicle_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (vehicleRes.error || !vehicleRes.data) {
      toast.error(vehicleRes.error?.message || 'Vehicle not found.');
      router.push('/admin/vehicles');
      return;
    }

    const row = vehicleRes.data as Vehicle;
    setVehicle(row);
    setTitle(row.title);
    setMake(row.make);
    setModel(row.model);
    setVariant(row.variant || '');
    setYear(row.year?.toString() || '');
    setStockNumber(row.stock_number || '');
    setChassisNumber(row.chassis_number || '');
    setLocation(row.location || '');
    setStockOrigin(row.stock_origin || 'dubai');
    setStockStatus(row.stock_status || 'available');
    setPurchasePrice(row.purchase_price != null ? String(row.purchase_price) : '');
    setPurchaseCurrency(row.purchase_currency || 'AED');
    setPurchaseDate(row.purchase_date || '');
    setLandedCost(row.landed_cost != null ? String(row.landed_cost) : '');
    setSupplierId(row.supplier_id || '');
    setReserveCustomerId(row.reserved_customer_id || '');
    setNextStage(RECOMMENDED_NEXT_STAGE[row.lifecycle_stage || 'unassigned'] || 'auction');
    setEvents((eventsRes.data || []) as VehicleLifecycleEvent[]);
    setFetching(false);

    const [supRes, custRes] = await Promise.all([
      supabase.from('suppliers').select('id,supplier_code,name').eq('is_active', true).order('name').limit(200),
      supabase.from('customers').select('id,customer_code,full_name,company_name').order('full_name').limit(500),
    ]);
    setSuppliers((supRes.data || []).map((item) => ({ id: item.id, label: `${item.supplier_code} — ${item.name}` })));
    setCustomers((custRes.data || []).map((item) => ({
      id: item.id,
      label: `${item.customer_code} — ${item.company_name || item.full_name}`,
    })));
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const stageOptions = useMemo(
    () => LIFECYCLE_STAGES.filter((stage) => stage.value !== (vehicle?.lifecycle_stage || 'unassigned')),
    [vehicle?.lifecycle_stage]
  );

  const saveBasics = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !make.trim() || !model.trim()) {
      toast.error('Title, make, and model are required.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('vehicles')
      .update({
        title: title.trim(),
        make: make.trim(),
        model: model.trim(),
        variant: variant.trim() || null,
        year: year ? Number.parseInt(year, 10) : null,
        stock_number: stockNumber.trim() || null,
        chassis_number: chassisNumber.trim() || null,
        location: location.trim() || null,
        stock_origin: stockOrigin,
        stock_status: stockStatus,
        purchase_price: purchasePrice === '' ? null : Number(purchasePrice),
        purchase_currency: purchaseCurrency.trim().toUpperCase() || 'AED',
        purchase_date: purchaseDate || null,
        landed_cost: landedCost === '' ? null : Number(landedCost),
        supplier_id: supplierId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Vehicle details saved.');
    await load();
  };

  const transitionStage = async () => {
    if (!vehicle) return;
    setTransitioning(true);
    const { error } = await supabase.rpc('transition_vehicle_lifecycle', {
      p_vehicle_id: id,
      p_to_stage: nextStage,
      p_notes: stageNotes.trim() || null,
      p_sync_stock_sold: true,
    });
    setTransitioning(false);
    if (error) return toast.error(error.message);
    toast.success(`Moved to ${lifecycleStageLabel(nextStage)}.`);
    setStageNotes('');
    await load();
  };

  const recordEvent = async () => {
    setRecording(true);
    const { error } = await supabase.rpc('record_vehicle_lifecycle_event', {
      p_vehicle_id: id,
      p_event_type: eventType,
      p_title: eventTitle.trim() || null,
      p_notes: eventNotes.trim() || null,
      p_metadata: {},
    });
    setRecording(false);
    if (error) return toast.error(error.message);
    toast.success(`${lifecycleEventLabel(eventType)} recorded.`);
    setEventTitle('');
    setEventNotes('');
    await load();
  };

  const reserveVehicle = async () => {
    if (!reserveCustomerId) {
      toast.error('Select a customer to reserve for.');
      return;
    }
    setReserveBusy(true);
    const { error } = await supabase.rpc('reserve_vehicle_stock', {
      p_vehicle_id: id,
      p_customer_id: reserveCustomerId,
    });
    setReserveBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Vehicle reserved and unpublished from the website.');
    await load();
  };

  const releaseReservation = async (republish = false) => {
    setReserveBusy(true);
    const { error } = await supabase.rpc('release_vehicle_reservation', {
      p_vehicle_id: id,
      p_republish: republish,
    });
    setReserveBusy(false);
    if (error) return toast.error(error.message);
    toast.success(republish ? 'Reservation released and published.' : 'Reservation released.');
    await load();
  };

  const setListing = async (publish: boolean) => {
    setReserveBusy(true);
    const { error } = await supabase.rpc('set_vehicle_public_listing', {
      p_vehicle_id: id,
      p_publish: publish,
    });
    setReserveBusy(false);
    if (error) return toast.error(error.message);
    toast.success(publish ? 'Published to website.' : 'Unpublished from website.');
    await load();
  };

  if (fetching || !vehicle) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
            <Link href="/admin/vehicles">
              <ArrowLeft className="h-4 w-4" />
              Back to vehicles
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{vehicle.title}</h1>
            <p className="text-sm text-muted-foreground">
              {stockOriginLabel(vehicle.stock_origin)} · {vehicle.stock_number || vehicle.chassis_number || vehicle.slug}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={stageClass[vehicle.lifecycle_stage || 'unassigned']}>
              {lifecycleStageLabel(vehicle.lifecycle_stage)}
            </Badge>
            <Badge className={statusClass[vehicle.stock_status || 'available']}>
              {(vehicle.stock_status || 'available').replace('_', ' ')}
            </Badge>
            {vehicle.is_published ? <Badge variant="outline">Public</Badge> : <Badge variant="secondary">Draft</Badge>}
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={`/vehicles/${vehicle.slug}`} target="_blank">
            View public page
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Purchase cost &amp; reservation</CardTitle>
          <CardDescription>
            Cost comes from receive-stock (GRN) or manual entry. Reserve for a customer to hold stock and hide it from the public catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void saveBasics(event)}>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Purchase price</span>
              <Input type="number" min="0" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Purchase currency</span>
              <Input value={purchaseCurrency} onChange={(e) => setPurchaseCurrency(e.target.value)} maxLength={3} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Purchase date</span>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Landed cost</span>
              <Input type="number" min="0" step="0.01" value={landedCost} onChange={(e) => setLandedCost(e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">Supplier</span>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">No supplier</option>
                {suppliers.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save purchase details</Button>
            </div>
          </form>
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_auto_auto]">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Reserve for customer</span>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reserveCustomerId} onChange={(e) => setReserveCustomerId(e.target.value)}>
                <option value="">Select customer</option>
                {customers.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              <Button type="button" disabled={reserveBusy || vehicle.stock_status === 'sold'} onClick={() => void reserveVehicle()}>
                {reserveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Reserve
              </Button>
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" disabled={reserveBusy || vehicle.stock_status !== 'reserved'} onClick={() => void releaseReservation(false)}>
                Release
              </Button>
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" disabled={reserveBusy || vehicle.stock_status !== 'reserved'} onClick={() => void releaseReservation(true)}>
                Release + publish
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button type="button" variant="outline" size="sm" disabled={reserveBusy || vehicle.stock_status !== 'available' || vehicle.is_published} onClick={() => void setListing(true)}>
              Publish when available
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={reserveBusy || !vehicle.is_published} onClick={() => void setListing(false)}>
              Unpublish
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/reservations">Sales reservation screen</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Or <Link href="/admin/inventory/receive" className="text-primary underline">receive stock (GRN)</Link> to set cost from a supplier invoice.
            Ops can also open <Link href="/admin/export-shipments" className="text-primary underline">export shipments</Link> for booking/BL.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ship className="h-5 w-5" />
            Operational lifecycle
          </CardTitle>
          <CardDescription>
            Recommended path: Auction → Yard → Port → Sold. Commercial availability (`available` / `reserved` / `sold`) stays separate and is only auto-synced when you move into Sold.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Move to stage</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={nextStage}
                onChange={(event) => setNextStage(event.target.value as LifecycleStage)}
              >
                {stageOptions.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <Button onClick={() => void transitionStage()} disabled={transitioning || stageOptions.length === 0}>
                {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Transition
              </Button>
            </div>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Transition notes</span>
            <Textarea value={stageNotes} onChange={(event) => setStageNotes(event.target.value)} rows={2} placeholder="Optional reason or reference" />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Record workflow event</CardTitle>
          <CardDescription>Log BL, inspection, shipping, and yard actions without changing the stage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Event type</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={eventType}
                onChange={(event) => setEventType(event.target.value as Exclude<LifecycleEventType, 'stage_change'>)}
              >
                {LIFECYCLE_EVENT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Title</span>
              <Input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="Optional short title" />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Notes</span>
            <Textarea value={eventNotes} onChange={(event) => setEventNotes(event.target.value)} rows={3} placeholder="Reference numbers, yard notes, courier details…" />
          </label>
          <Button onClick={() => void recordEvent()} disabled={recording}>
              {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record event
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assignable requests</CardTitle>
          <CardDescription>
            Lifecycle events stay on this vehicle. Open a BL, inspection, or shipping ticket when work needs an owner and due date.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/admin/requests?vehicle=${id}`}>Open requests for this vehicle</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/admin/chat?vehicle=${id}`}>Open linked chat</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity history</CardTitle>
          <CardDescription>Newest first. Stage changes and workflow events are append-only.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lifecycle events yet.</p>
          ) : (
            <ol className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{lifecycleEventLabel(event.event_type)}</Badge>
                    {event.event_type === 'stage_change' ? (
                      <span className="text-sm font-medium">
                        {lifecycleStageLabel(event.from_stage)} → {lifecycleStageLabel(event.to_stage)}
                      </span>
                    ) : event.title ? (
                      <span className="text-sm font-medium">{event.title}</span>
                    ) : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {format(new Date(event.created_at), 'dd MMM yyyy HH:mm')}
                    </span>
                  </div>
                  {event.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{event.notes}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vehicle details</CardTitle>
          <CardDescription>Catalog fields. Stock availability remains independent of operational stage.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveBasics}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="make">Make</Label>
                <Input id="make" value={make} onChange={(event) => setMake(event.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model">Model</Label>
                <Input id="model" value={model} onChange={(event) => setModel(event.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="variant">Variant</Label>
                <Input id="variant" value={variant} onChange={(event) => setVariant(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="year">Year</Label>
                <Input id="year" value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-number">Stock number</Label>
                <Input id="stock-number" value={stockNumber} onChange={(event) => setStockNumber(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="chassis-number">Chassis number</Label>
                <Input id="chassis-number" value={chassisNumber} onChange={(event) => setChassisNumber(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location">Location note</Label>
                <Input id="location" value={location} onChange={(event) => setLocation(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-origin">Stock location</Label>
                <select
                  id="stock-origin"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={stockOrigin}
                  onChange={(event) => setStockOrigin(event.target.value)}
                >
                  {STOCK_ORIGINS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-status">Availability</Label>
                <select
                  id="stock-status"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={stockStatus}
                  onChange={(event) => setStockStatus(event.target.value as StockStatus)}
                >
                  <option value="available">Available</option>
                  <option value="reserved">Reserved</option>
                  <option value="sold">Sold</option>
                </select>
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save details
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

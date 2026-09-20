'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Search, Ship, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ExportMasterSelect } from '@/components/admin/export-master-select';
import { ExportShipmentDocumentsPanel } from '@/components/admin/export-shipment-documents';
import { SearchableSelect, customerSelectOption, vehicleSelectOption } from '@/components/admin/searchable-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { isAccountAdminRole, isOpsRole } from '@/lib/admin-rbac';
import { matchesQuery } from '@/lib/matches-query';
import { supabase } from '@/lib/supabase/client';
import { SHIPMENT_MODE_LABELS, SHIPMENT_MODES, type ShipmentMode } from '@/lib/trade-terms';
import { exportShipmentStatusLabel } from '@/lib/vehicle-sales-status';
import type { Customer, ExportShipment, ExportShipmentMode, ExportShipmentStatus, ExportShipmentVehicle } from '@/lib/types';

type StockOption = {
  id: string;
  label: string;
  title?: string | null;
  stock_number?: string | null;
  chassis_number?: string | null;
};
type LineRow = ExportShipmentVehicle & { label: string };

const STATUS_FLOW: ExportShipmentStatus[] = ['draft', 'booked', 'loaded', 'sailed', 'arrived', 'completed'];

const statusBadge: Record<ExportShipmentStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  booked: 'bg-sky-100 text-sky-800',
  loaded: 'bg-amber-100 text-amber-800',
  sailed: 'bg-violet-100 text-violet-800',
  arrived: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-emerald-200 text-emerald-900',
  cancelled: 'bg-zinc-200 text-zinc-700',
};

const statusLabel = (status: ExportShipmentStatus) => exportShipmentStatusLabel(status);

const modeLabel = (mode: ExportShipmentMode) => SHIPMENT_MODE_LABELS[mode as ShipmentMode] || mode;

function ModeSelectOptions() {
  return (
    <>
      {SHIPMENT_MODES.map((mode) => (
        <option key={mode} value={mode}>
          {SHIPMENT_MODE_LABELS[mode]}
        </option>
      ))}
    </>
  );
}

export default function ExportShipmentsPage() {
  const [shipments, setShipments] = useState<ExportShipment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<StockOption[]>([]);
  const [parts, setParts] = useState<StockOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [partLines, setPartLines] = useState<Array<{ id: string; part_id: string; label: string }>>([]);
  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | ExportShipmentMode>('all');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [addVehicleId, setAddVehicleId] = useState('');
  const [isOps, setIsOps] = useState(false);
  const [isAccountAdmin, setIsAccountAdmin] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [mode, setMode] = useState<ExportShipmentMode>('roro');
  const [destinationCountry, setDestinationCountry] = useState('');
  const [loadingPort, setLoadingPort] = useState('');
  const [destinationPort, setDestinationPort] = useState('');
  const [blNumber, setBlNumber] = useState('');
  const [vesselName, setVesselName] = useState('');
  const [voyageNo, setVoyageNo] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [etd, setEtd] = useState('');
  const [eta, setEta] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [vehicleFormQuery, setVehicleFormQuery] = useState('');
  const [partFormQuery, setPartFormQuery] = useState('');

  const load = useCallback(async () => {
    const [{ data: sessionData }, shipRes, custRes, vehRes, partRes] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from('export_shipments').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('customers').select('*').eq('is_active', true).order('full_name').limit(400),
      supabase
        .from('vehicles')
        .select('id,title,stock_number,chassis_number')
        .neq('stock_status', 'sold')
        .order('created_at', { ascending: false })
        .limit(400),
      supabase
        .from('parts')
        .select('id,name,part_code')
        .neq('stock_status', 'sold')
        .order('created_at', { ascending: false })
        .limit(400),
    ]);
    if (shipRes.error) toast.error(shipRes.error.message);
    setShipments((shipRes.data || []) as ExportShipment[]);
    setCustomers((custRes.data || []) as Customer[]);
    setVehicles(
      (vehRes.data || []).map((row) => ({
        id: row.id,
        title: row.title,
        stock_number: row.stock_number,
        chassis_number: row.chassis_number,
        label: `${row.stock_number || row.chassis_number || row.id.slice(0, 8)} — ${row.title}`,
      }))
    );
    setParts(
      (partRes.data || []).map((row) => ({
        id: row.id,
        title: row.name,
        stock_number: row.part_code,
        chassis_number: null,
        label: `${row.part_code} — ${row.name}`,
      }))
    );
    const uid = sessionData.session?.user.id;
    if (uid) {
      const { data: profile } = await supabase.from('admin_profiles').select('role').eq('id', uid).maybeSingle();
      setIsOps(isOpsRole(profile?.role));
      setIsAccountAdmin(isAccountAdminRole(profile?.role));
    } else {
      setIsOps(false);
      setIsAccountAdmin(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = shipments.find((row) => row.id === selectedId) || null;
  const customerName = (id: string | null) => {
    if (!id) return '—';
    const row = customers.find((c) => c.id === id);
    return row?.company_name || row?.full_name || id.slice(0, 8);
  };

  const openShipment = async (id: string) => {
    setSelectedId(id);
    setAddVehicleId('');
    const [vehLink, partLink] = await Promise.all([
      supabase
        .from('export_shipment_vehicles')
        .select('*, vehicles(id,title,stock_number,chassis_number)')
        .eq('export_shipment_id', id)
        .order('sort_order'),
      supabase
        .from('export_shipment_parts')
        .select('*, parts(id,name,part_code)')
        .eq('export_shipment_id', id)
        .order('sort_order'),
    ]);
    if (vehLink.error) {
      toast.error(vehLink.error.message);
      setLines([]);
    } else {
      setLines(
        (vehLink.data || []).map((row) => {
          const vehicle = Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles;
          const label = vehicle
            ? `${vehicle.stock_number || vehicle.chassis_number || vehicle.id.slice(0, 8)} — ${vehicle.title}`
            : row.vehicle_id.slice(0, 8);
          return {
            id: row.id,
            export_shipment_id: row.export_shipment_id,
            vehicle_id: row.vehicle_id,
            sort_order: row.sort_order,
            notes: row.notes,
            created_at: row.created_at,
            label,
          } as LineRow;
        })
      );
    }
    if (partLink.error) {
      // Table may not exist until migration; ignore schema-missing soft errors
      if (!/does not exist|schema cache|export_shipment_parts/i.test(partLink.error.message)) {
        toast.error(partLink.error.message);
      }
      setPartLines([]);
    } else {
      setPartLines(
        (partLink.data || []).map((row) => {
          const part = Array.isArray(row.parts) ? row.parts[0] : row.parts;
          const label = part ? `${part.part_code} — ${part.name}` : row.part_id.slice(0, 8);
          return { id: row.id, part_id: row.part_id, label };
        })
      );
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shipments.filter((row) => {
      if (modeFilter !== 'all' && row.mode !== modeFilter) return false;
      if (!q) return true;
      return [
        row.shipment_number,
        row.status,
        row.mode,
        modeLabel(row.mode),
        row.bl_number,
        row.vessel_name,
        row.destination_country,
        customerName(row.customer_id),
      ].some((value) => value?.toLowerCase().includes(q));
    });
  }, [shipments, query, customers, modeFilter]);

  const customerOptions = useMemo(() => customers.map(customerSelectOption), [customers]);
  const vehicleOptions = useMemo(() => vehicles.map(vehicleSelectOption), [vehicles]);
  const addableVehicleOptions = useMemo(
    () => vehicleOptions.filter((option) => !lines.some((line) => line.vehicle_id === option.value)),
    [vehicleOptions, lines]
  );
  const formVehicles = useMemo(
    () =>
      vehicles.filter((row) =>
        matchesQuery(vehicleFormQuery, [row.label, row.title, row.stock_number, row.chassis_number])
      ),
    [vehicles, vehicleFormQuery]
  );
  const formParts = useMemo(
    () =>
      parts.filter((row) =>
        matchesQuery(partFormQuery, [row.label, row.title, row.stock_number])
      ),
    [parts, partFormQuery]
  );

  const resetForm = () => {
    setShowForm(false);
    setCustomerId('');
    setMode('roro');
    setDestinationCountry('');
    setLoadingPort('');
    setDestinationPort('');
    setBlNumber('');
    setVesselName('');
    setVoyageNo('');
    setBookingRef('');
    setEtd('');
    setEta('');
    setNotes('');
    setSelectedVehicleIds([]);
    setSelectedPartIds([]);
    setVehicleFormQuery('');
    setPartFormQuery('');
  };

  const toggleVehicle = (id: string) => {
    setSelectedVehicleIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
    );
  };

  const togglePart = (id: string) => {
    setSelectedPartIds((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
    );
  };

  const createShipment = async (confirm: boolean) => {
    if (mode !== 'dhl' && selectedVehicleIds.length === 0) {
      toast.error('Select at least one vehicle (or choose DHL for small-parts shipments without vehicles).');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('create_export_shipment', {
      p_customer_id: customerId || null,
      p_mode: mode,
      p_destination_country: destinationCountry || null,
      p_loading_port: loadingPort || null,
      p_destination_port: destinationPort || null,
      p_bl_number: blNumber || null,
      p_vessel_name: vesselName || null,
      p_voyage_no: voyageNo || null,
      p_booking_ref: bookingRef || null,
      p_etd: etd || null,
      p_eta: eta || null,
      p_notes: notes || null,
      p_vehicle_ids: selectedVehicleIds,
      p_confirm: confirm,
      p_part_ids: selectedPartIds.length ? selectedPartIds : null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(confirm ? 'Shipment booked.' : 'Shipment saved as draft.');
    resetForm();
    await load();
    if (data) await openShipment(String(data));
  };

  const saveHeader = async () => {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.rpc('update_export_shipment', {
      p_shipment_id: selected.id,
      p_customer_id: selected.customer_id,
      p_mode: selected.mode,
      p_destination_country: selected.destination_country,
      p_loading_port: selected.loading_port,
      p_destination_port: selected.destination_port,
      p_bl_number: selected.bl_number,
      p_vessel_name: selected.vessel_name,
      p_voyage_no: selected.voyage_no,
      p_booking_ref: selected.booking_ref,
      p_etd: selected.etd,
      p_eta: selected.eta,
      p_notes: selected.notes,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Shipment updated.');
    await load();
  };

  const setStatus = async (id: string, status: ExportShipmentStatus) => {
    if (status === 'cancelled' && !window.confirm('Cancel this export shipment?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('set_export_shipment_status', {
      p_shipment_id: id,
      p_status: status,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Status set to ${status}.`);
    await load();
    await openShipment(id);
  };

  const addVehicle = async () => {
    if (!selected || !addVehicleId) return;
    setBusy(true);
    const { error } = await supabase.rpc('add_export_shipment_vehicle', {
      p_shipment_id: selected.id,
      p_vehicle_id: addVehicleId,
      p_notes: null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Vehicle added.');
    setAddVehicleId('');
    await openShipment(selected.id);
  };

  const removeVehicle = async (vehicleId: string) => {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.rpc('remove_export_shipment_vehicle', {
      p_shipment_id: selected.id,
      p_vehicle_id: vehicleId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Vehicle removed.');
    await openShipment(selected.id);
  };

  const deleteShipment = async () => {
    if (!selected || !isOps) return;
    const softStatuses: ExportShipmentStatus[] = ['draft', 'cancelled'];
    const needsForce = !softStatuses.includes(selected.status);
    if (needsForce && !isAccountAdmin) {
      toast.error('Cancel this shipment before deleting, or ask an account admin to force-delete.');
      return;
    }
    const ok = window.confirm(
      needsForce
        ? `Force-delete ${selected.shipment_number}?\n\nStatus is ${statusLabel(selected.status)}. This permanently removes the shipment, vehicle/part lines, and documents. This cannot be undone.`
        : `Delete ${selected.shipment_number}?\n\nThis permanently removes the shipment, vehicle/part lines, and documents. This cannot be undone.`
    );
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_export_shipment', {
      p_shipment_id: selected.id,
      p_force: needsForce,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${selected.shipment_number}.`);
    setSelectedId(null);
    setLines([]);
    setPartLines([]);
    await load();
  };

  const patchSelected = (patch: Partial<ExportShipment>) => {
    if (!selectedId) return;
    setShipments((rows) => rows.map((row) => (row.id === selectedId ? { ...row, ...patch } : row)));
  };

  const nextStatuses = (status: ExportShipmentStatus): ExportShipmentStatus[] => {
    if (status === 'cancelled' || status === 'completed') return [];
    const idx = STATUS_FLOW.indexOf(status);
    const forward = idx >= 0 && idx < STATUS_FLOW.length - 1 ? [STATUS_FLOW[idx + 1]] : [];
    return status === 'draft' ? [...forward, 'cancelled'] : [...forward, 'cancelled'];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Export shipments</h1>
          <p className="text-sm text-muted-foreground">
            Booking / BL headers with shipment type (DHL, RoRo, 20ft, 40ft), PDF shipping docs, and inspection certificates.
          </p>
        </div>
        <Button type="button" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          New shipment
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New export shipment</CardTitle>
            <CardDescription>Save as draft or book immediately (writes export_request lifecycle events).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Customer (optional)</Label>
                <SearchableSelect
                  value={customerId}
                  onValueChange={setCustomerId}
                  options={customerOptions}
                  placeholder="None"
                  searchPlaceholder="Search code, name, company, phone, email…"
                  clearLabel="None"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Shipment type</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={mode} onChange={(e) => setMode(e.target.value as ExportShipmentMode)}>
                  <ModeSelectOptions />
                </select>
              </div>
              <div className="space-y-1.5">
                <ExportMasterSelect
                  kind="destination_country"
                  value={destinationCountry}
                  onChange={setDestinationCountry}
                />
              </div>
              <div className="space-y-1.5">
                <ExportMasterSelect kind="loading_port" value={loadingPort} onChange={setLoadingPort} />
              </div>
              <div className="space-y-1.5">
                <ExportMasterSelect
                  kind="destination_port"
                  value={destinationPort}
                  onChange={setDestinationPort}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Booking ref</Label>
                <Input value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>BL number</Label>
                <Input value={blNumber} onChange={(e) => setBlNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <ExportMasterSelect kind="vessel" value={vesselName} onChange={setVesselName} />
              </div>
              <div className="space-y-1.5">
                <ExportMasterSelect kind="voyage" value={voyageNo} onChange={setVoyageNo} />
              </div>
              <div className="space-y-1.5">
                <Label>ETD</Label>
                <Input type="date" value={etd} onChange={(e) => setEtd(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>ETA</Label>
                <Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Vehicles{mode === 'dhl' ? ' (optional for DHL / small parts)' : ''}</Label>
              <Input
                placeholder="Filter vehicles by stock #, chassis, title…"
                value={vehicleFormQuery}
                onChange={(e) => setVehicleFormQuery(e.target.value)}
              />
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {formVehicles.length === 0 ? (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
                ) : (
                  formVehicles.map((row) => (
                    <label key={row.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary/60">
                      <input type="checkbox" checked={selectedVehicleIds.includes(row.id)} onChange={() => toggleVehicle(row.id)} />
                      <span className="truncate">{row.label}</span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">{selectedVehicleIds.length} selected</p>
            </div>

            {(mode === 'dhl' || selectedPartIds.length > 0) && (
              <div className="space-y-2">
                <Label>Parts (DHL / small parts packing list)</Label>
                <Input
                  placeholder="Filter parts by code or name…"
                  value={partFormQuery}
                  onChange={(e) => setPartFormQuery(e.target.value)}
                />
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                  {formParts.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
                  ) : (
                    formParts.map((row) => (
                      <label
                        key={row.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary/60"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPartIds.includes(row.id)}
                          onChange={() => togglePart(row.id)}
                        />
                        <span className="truncate">{row.label}</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{selectedPartIds.length} parts selected</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void createShipment(false)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save draft
              </Button>
              <Button type="button" variant="accent" disabled={busy} onClick={() => void createShipment(true)}>
                Book shipment
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Ship className="h-5 w-5" />
              Shipments
            </CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search EXP-, BL, vessel…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value as 'all' | ExportShipmentMode)}
              >
                <option value="all">All types</option>
                <ModeSelectOptions />
              </select>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No export shipments yet.</p>
            ) : (
              filtered.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => void openShipment(row.id)}
                  className={`flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${selectedId === row.id ? 'border-primary bg-primary/5' : 'hover:bg-secondary/50'}`}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{row.shipment_number}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {modeLabel(row.mode)} · {customerName(row.customer_id)}
                      {row.destination_country ? ` · ${row.destination_country}` : ''}
                    </p>
                  </div>
                  <Badge className={statusBadge[row.status]}>{statusLabel(row.status)}</Badge>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{selected ? selected.shipment_number : 'Shipment detail'}</CardTitle>
            <CardDescription>
              {selected
                ? 'Edit booking details, advance status, or adjust vehicle lines before sailing.'
                : 'Select a shipment from the list.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Nothing selected.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusBadge[selected.status]}>{statusLabel(selected.status)}</Badge>
                  {nextStatuses(selected.status).map((status) => (
                    <Button key={status} type="button" size="sm" variant={status === 'cancelled' ? 'outline' : 'default'} disabled={busy} onClick={() => void setStatus(selected.id, status)}>
                      Mark {statusLabel(status)}
                    </Button>
                  ))}
                  {isOps && (['draft', 'cancelled'].includes(selected.status) || isAccountAdmin) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void deleteShipment()}
                    >
                      <Trash2 className="h-4 w-4" />
                      {['draft', 'cancelled'].includes(selected.status) ? 'Delete' : 'Force delete'}
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Customer</Label>
                    <SearchableSelect
                      value={selected.customer_id || ''}
                      disabled={['completed', 'cancelled'].includes(selected.status)}
                      onValueChange={(value) => patchSelected({ customer_id: value || null })}
                      options={customerOptions}
                      placeholder="None"
                      searchPlaceholder="Search code, name, company, phone, email…"
                      clearLabel="None"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Shipment type</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={selected.mode}
                      disabled={['completed', 'cancelled'].includes(selected.status)}
                      onChange={(e) => patchSelected({ mode: e.target.value as ExportShipmentMode })}
                    >
                      <ModeSelectOptions />
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <ExportMasterSelect
                      kind="destination_country"
                      value={selected.destination_country || ''}
                      disabled={['completed', 'cancelled'].includes(selected.status)}
                      onChange={(value) => patchSelected({ destination_country: value || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>BL number</Label>
                    <Input value={selected.bl_number || ''} disabled={['completed', 'cancelled'].includes(selected.status)} onChange={(e) => patchSelected({ bl_number: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <ExportMasterSelect
                      kind="loading_port"
                      value={selected.loading_port || ''}
                      disabled={['completed', 'cancelled'].includes(selected.status)}
                      onChange={(value) => patchSelected({ loading_port: value || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <ExportMasterSelect
                      kind="destination_port"
                      value={selected.destination_port || ''}
                      disabled={['completed', 'cancelled'].includes(selected.status)}
                      onChange={(value) => patchSelected({ destination_port: value || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <ExportMasterSelect
                      kind="vessel"
                      value={selected.vessel_name || ''}
                      disabled={['completed', 'cancelled'].includes(selected.status)}
                      onChange={(value) => patchSelected({ vessel_name: value || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <ExportMasterSelect
                      kind="voyage"
                      value={selected.voyage_no || ''}
                      disabled={['completed', 'cancelled'].includes(selected.status)}
                      onChange={(value) => patchSelected({ voyage_no: value || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Booking ref</Label>
                    <Input value={selected.booking_ref || ''} disabled={['completed', 'cancelled'].includes(selected.status)} onChange={(e) => patchSelected({ booking_ref: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ETD</Label>
                    <Input type="date" value={selected.etd || ''} disabled={['completed', 'cancelled'].includes(selected.status)} onChange={(e) => patchSelected({ etd: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ETA</Label>
                    <Input type="date" value={selected.eta || ''} disabled={['completed', 'cancelled'].includes(selected.status)} onChange={(e) => patchSelected({ eta: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Notes</Label>
                    <Textarea value={selected.notes || ''} disabled={['completed', 'cancelled'].includes(selected.status)} rows={2} onChange={(e) => patchSelected({ notes: e.target.value || null })} />
                  </div>
                </div>

                {!['completed', 'cancelled'].includes(selected.status) ? (
                  <Button type="button" disabled={busy} onClick={() => void saveHeader()}>
                    Save details
                  </Button>
                ) : null}

                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm font-semibold">Vehicles on shipment</p>
                  {lines.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No vehicles linked.</p>
                  ) : (
                    <ul className="space-y-2">
                      {lines.map((line) => (
                        <li key={line.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                          <Link href={`/admin/vehicles/${line.vehicle_id}`} className="font-medium text-primary hover:underline">
                            {line.label}
                          </Link>
                          {!['sailed', 'arrived', 'completed', 'cancelled'].includes(selected.status) ? (
                            <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label="Remove vehicle" onClick={() => void removeVehicle(line.vehicle_id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}

                  {!['completed', 'cancelled'].includes(selected.status) ? (
                    <div className="flex flex-wrap gap-2">
                      <SearchableSelect
                        className="min-w-[14rem] flex-1"
                        value={addVehicleId}
                        onValueChange={setAddVehicleId}
                        options={addableVehicleOptions}
                        placeholder="Add vehicle…"
                        searchPlaceholder="Search stock #, chassis, title…"
                        clearLabel="Add vehicle…"
                      />
                      <Button type="button" variant="outline" disabled={busy || !addVehicleId} onClick={() => void addVehicle()}>
                        Add
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm font-semibold">Parts on shipment</p>
                  {partLines.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No parts linked (use DHL create form to attach).</p>
                  ) : (
                    <ul className="space-y-2">
                      {partLines.map((line) => (
                        <li
                          key={line.id}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <Link
                            href={`/admin/parts/${line.part_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {line.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <ExportShipmentDocumentsPanel
                  shipmentId={selected.id}
                  readOnly={['completed', 'cancelled'].includes(selected.status)}
                  onDocumentsChanged={async () => {
                    await load();
                    await openShipment(selected.id);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

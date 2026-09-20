'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
  SearchableSelect,
  customerSelectOption,
} from '@/components/admin/searchable-select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
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
  profileRequesterName,
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

export type BulkReserveResult = {
  succeeded_vehicle_ids?: string[];
  succeeded_part_ids?: string[];
  failed_vehicles?: Array<{ id: string; error: string }>;
  failed_parts?: Array<{ id: string; error: string }>;
  succeeded_count?: number;
  failed_count?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleIds: string[];
  partIds: string[];
  vehicleLabels?: Record<string, string>;
  partLabels?: Record<string, string>;
  defaultShipment?: ShipmentMode;
  onCompleted?: (result: BulkReserveResult) => void;
};

export function BulkReserveDialog({
  open,
  onOpenChange,
  vehicleIds,
  partIds,
  vehicleLabels = {},
  partLabels = {},
  defaultShipment,
  onCompleted,
}: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [priceTerm, setPriceTerm] = useState<PriceTerm | ''>('fob');
  const [shipmentTerm, setShipmentTerm] = useState<ShipmentMode | ''>('roro');
  const [inspectionRequired, setInspectionRequired] = useState<InspectionChoice | ''>('');
  const [vatApplicable, setVatApplicable] = useState<VatChoice | ''>('yes');
  const [requesterName, setRequesterName] = useState('');
  const [requesterRole, setRequesterRole] = useState<RequesterRole | ''>('sales');
  const [etd, setEtd] = useState('');
  const [eta, setEta] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const fieldAgent = isFieldAgentRole(role);
  const requesterLocked = fieldAgent;
  const totalCount = vehicleIds.length + partIds.length;
  const inspectionInvalid = attemptedSubmit && !inspectionRequired;
  const customerOptions = useMemo(() => customers.map(customerSelectOption), [customers]);

  const loadProfileAndCustomers = useCallback(async () => {
    setLoadingCustomers(true);
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
    const { data, error } = await supabase
      .from('customers')
      .select('id,customer_code,full_name,company_name,phone,email')
      .eq('is_active', true)
      .order('full_name')
      .limit(500);
    if (error) toast.error(error.message);
    setCustomers((data || []) as Customer[]);
    setLoadingCustomers(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setAttemptedSubmit(false);
    setCustomerId('');
    setPriceTerm('fob');
    setInspectionRequired('');
    setVatApplicable('yes');
    setEtd('');
    setEta('');
    const preferParts = partIds.length > 0 && vehicleIds.length === 0;
    setShipmentTerm(defaultShipment || (preferParts ? 'dhl' : 'roro'));
    void loadProfileAndCustomers();
  }, [open, vehicleIds.length, partIds.length, defaultShipment, loadProfileAndCustomers]);

  const submit = async () => {
    setAttemptedSubmit(true);
    if (totalCount === 0) {
      toast.error('Select at least one available vehicle or part.');
      return;
    }
    if (!customerId) {
      toast.error('Select a customer.');
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

    setBusy(true);
    const { data, error } = await supabase.rpc('bulk_reserve_stock', {
      p_vehicle_ids: vehicleIds.length ? vehicleIds : null,
      p_part_ids: partIds.length ? partIds : null,
      p_customer_id: customerId,
      p_price_term: priceTerm,
      p_shipment_term: shipmentTerm,
      p_inspection_required: inspectionChoiceToBool(inspectionRequired),
      p_vat_applicable: vatChoiceToBool(vatApplicable) !== false,
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

    const result = (data || {}) as BulkReserveResult;
    const ok = result.succeeded_count ?? 0;
    const fail = result.failed_count ?? 0;
    const failMsgs = [
      ...(result.failed_vehicles || []).map((row) => {
        const label = vehicleLabels[row.id] || row.id.slice(0, 8);
        return `Vehicle ${label}: ${row.error}`;
      }),
      ...(result.failed_parts || []).map((row) => {
        const label = partLabels[row.id] || row.id.slice(0, 8);
        return `Part ${label}: ${row.error}`;
      }),
    ];

    if (ok > 0 && fail === 0) {
      toast.success(`Reserved ${ok} item${ok === 1 ? '' : 's'}.`);
    } else if (ok > 0 && fail > 0) {
      toast.warning(`Reserved ${ok}, skipped ${fail}. ${failMsgs.slice(0, 3).join(' · ')}`);
    } else {
      toast.error(failMsgs[0] || 'Nothing was reserved.');
      return;
    }

    onCompleted?.(result);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="h-5 w-5 text-accent" />
            Bulk reserve
          </DialogTitle>
          <DialogDescription>
            Reserve {totalCount} selected available item{totalCount === 1 ? '' : 's'} for one customer
            with shared trade terms. Each unit is reserved individually so SOA buying stays in sync.
            Already reserved or sold stock is skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {vehicleIds.length > 0 ? (
              <p>
                Vehicles ({vehicleIds.length}):{' '}
                {vehicleIds
                  .slice(0, 6)
                  .map((id) => vehicleLabels[id] || id.slice(0, 8))
                  .join(', ')}
                {vehicleIds.length > 6 ? ` +${vehicleIds.length - 6} more` : ''}
              </p>
            ) : null}
            {partIds.length > 0 ? (
              <p className={vehicleIds.length ? 'mt-1' : undefined}>
                Parts ({partIds.length}):{' '}
                {partIds
                  .slice(0, 6)
                  .map((id) => partLabels[id] || id.slice(0, 8))
                  .join(', ')}
                {partIds.length > 6 ? ` +${partIds.length - 6} more` : ''}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-res-customer">Customer</Label>
            <SearchableSelect
              id="bulk-res-customer"
              value={customerId}
              onValueChange={setCustomerId}
              options={customerOptions}
              placeholder={loadingCustomers ? 'Loading customers…' : 'Select customer'}
              searchPlaceholder="Search code, name, company, phone, email…"
              clearLabel="Select customer"
              required
              disabled={busy || loadingCustomers}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-res-price-term">Price term</Label>
              <NativeSelect
                id="bulk-res-price-term"
                value={priceTerm}
                disabled={busy}
                onChange={(e) => setPriceTerm(e.target.value as PriceTerm)}
              >
                {PRICE_TERMS.map((term) => (
                  <option key={term} value={term}>
                    {PRICE_TERM_LABELS[term]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-res-shipment">Shipment term</Label>
              <NativeSelect
                id="bulk-res-shipment"
                value={shipmentTerm}
                disabled={busy}
                onChange={(e) => setShipmentTerm(e.target.value as ShipmentMode)}
              >
                {SHIPMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {SHIPMENT_MODE_LABELS[mode]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-res-inspection">
                Inspection <span className="font-normal text-muted-foreground">(required)</span>
              </Label>
              <NativeSelect
                id="bulk-res-inspection"
                value={inspectionRequired}
                disabled={busy}
                aria-invalid={inspectionInvalid || undefined}
                className={inspectionInvalid ? 'border-destructive' : undefined}
                onChange={(e) => setInspectionRequired(e.target.value as InspectionChoice | '')}
              >
                <option value="">Select Yes or No</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-res-vat">VAT</Label>
              <NativeSelect
                id="bulk-res-vat"
                value={vatApplicable}
                disabled={busy}
                onChange={(e) => setVatApplicable(e.target.value as VatChoice | '')}
              >
                <option value="yes">Yes — apply VAT</option>
                <option value="no">No — exclude VAT</option>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-res-requester" className="flex items-center gap-1.5">
                Requester name
                {requesterLocked ? <Lock className="h-3 w-3 text-muted-foreground" aria-hidden /> : null}
              </Label>
              <Input
                id="bulk-res-requester"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                required={!requesterLocked}
                readOnly={requesterLocked}
                disabled={busy}
                maxLength={120}
                className={requesterLocked ? 'admin-readonly-field' : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-res-requester-role" className="flex items-center gap-1.5">
                Requester role
                {requesterLocked ? <Lock className="h-3 w-3 text-muted-foreground" aria-hidden /> : null}
              </Label>
              {requesterLocked ? (
                <Input
                  id="bulk-res-requester-role"
                  readOnly
                  value={requesterRole ? REQUESTER_ROLE_LABELS[requesterRole] : ''}
                  className="admin-readonly-field"
                />
              ) : (
                <NativeSelect
                  id="bulk-res-requester-role"
                  value={requesterRole}
                  disabled={busy}
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
            <div className="space-y-2">
              <Label htmlFor="bulk-res-etd">ETD</Label>
              <Input
                id="bulk-res-etd"
                type="date"
                value={etd}
                disabled={busy}
                onChange={(e) => setEtd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-res-eta">ETA</Label>
              <Input
                id="bulk-res-eta"
                type="date"
                value={eta}
                disabled={busy}
                onChange={(e) => setEta(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || totalCount === 0} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
            Reserve {totalCount || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

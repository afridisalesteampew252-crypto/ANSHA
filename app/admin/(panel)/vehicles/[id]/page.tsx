'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  FileText,
  Gavel,
  Image as ImageIcon,
  Loader2,
  PackagePlus,
  Paperclip,
  Replace,
  Save,
  Ship,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect, customerSelectOption } from '@/components/admin/searchable-select';
import { StockLinkedInvoices } from '@/components/admin/stock-linked-invoices';
import { VehicleFreightEstimator } from '@/components/admin/vehicle-freight-estimator';
import { IncotermPriceFields, parseOptionalPrice } from '@/components/admin/incoterm-price-fields';
import { PriceSanityHint } from '@/components/admin/price-sanity-hint';
import { VehicleDestinationMarketsField } from '@/components/admin/vehicle-destination-markets-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { compressCatalogImage } from '@/lib/catalog-image';
import { isAuctionSheetFilename, VEHICLE_PHOTO_VIEWS, VEHICLE_PHOTO_VIEW_LABELS, type VehiclePhotoView } from '@/lib/vehicle-photos';
import { supabase } from '@/lib/supabase/client';
import { STOCK_ORIGINS, isAuctionStockPool, stockOriginLabel, stockPoolLabel, type StockPool } from '@/lib/stock';
import {
  PRICE_TERM_LABELS,
  PRICE_TERMS,
  REQUESTER_ROLE_LABELS,
  REQUESTER_ROLES,
  SHIPMENT_MODE_LABELS,
  SHIPMENT_MODES,
  accountRoleToRequesterRole,
  boolToInspectionChoice,
  boolToVatChoice,
  inspectionChoiceToBool,
  inspectionRequiredLabel,
  profileRequesterName,
  vatApplicableLabel,
  vatChoiceToBool,
  type InspectionChoice,
  type PriceTerm,
  type RequesterRole,
  type ShipmentMode,
  type VatChoice,
} from '@/lib/trade-terms';
import {
  EQUIPMENT_CATEGORIES,
  isMachineryClass,
  VEHICLE_CLASSES,
  type VehicleClass,
} from '@/lib/vehicle-class';
import {
  LIFECYCLE_ATTACHMENT_MAX_BYTES,
  LIFECYCLE_EVENT_TYPES,
  LIFECYCLE_STAGES,
  RECOMMENDED_NEXT_STAGE,
  isRecommendedLifecycleTransition,
  lifecycleEventAttachmentStoragePath,
  lifecycleEventLabel,
  lifecycleStageLabel,
  type LifecycleStage,
} from '@/lib/vehicle-lifecycle';
import type {
  LifecycleEventType,
  StockStatus,
  Vehicle,
  VehicleLifecycleEvent,
  VehicleLifecycleEventAttachment,
  VehiclePhoto,
} from '@/lib/types';
import { requestPublicRevalidation } from '@/lib/revalidate-public';
import { normalizeVehicleModel } from '@/lib/vehicle-freight';

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
  const [attachmentsByEvent, setAttachmentsByEvent] = useState<
    Record<string, VehicleLifecycleEventAttachment[]>
  >({});
  const [isAccountAdmin, setIsAccountAdmin] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [forceOverride, setForceOverride] = useState(false);
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [photoActionId, setPhotoActionId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('details');
  useEffect(() => {
    if (window.location.hash === '#photos') setActiveSection('photos');
  }, []);
  const [draggingPhotoId, setDraggingPhotoId] = useState<string | null>(null);
  const [dropPhotoId, setDropPhotoId] = useState<string | null>(null);
  const photoDrag = useRef<{ id: string; x: number; y: number; moved: boolean; target: string | null } | null>(null);
  const reorderingPhotos = useRef(false);

  const [title, setTitle] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [year, setYear] = useState('');
  const [stockNumber, setStockNumber] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [location, setLocation] = useState('');
  const [destinationMarkets, setDestinationMarkets] = useState<string[]>([]);
  const [stockOrigin, setStockOrigin] = useState('dubai');
  const [stockPool, setStockPool] = useState<StockPool>('owned');
  const [stockStatus, setStockStatus] = useState<StockStatus>('available');
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('passenger');
  const [equipmentCategory, setEquipmentCategory] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseCurrency, setPurchaseCurrency] = useState('AED');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [landedCost, setLandedCost] = useState('');
  const [price, setPrice] = useState('');
  const [priceFob, setPriceFob] = useState('');
  const [priceCf, setPriceCf] = useState('');
  const [priceCif, setPriceCif] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [showPrice, setShowPrice] = useState(false);
  const [reservePriceTerm, setReservePriceTerm] = useState<PriceTerm | ''>('fob');
  const [reserveShipmentTerm, setReserveShipmentTerm] = useState<ShipmentMode | ''>('roro');
  const [reserveInspection, setReserveInspection] = useState<InspectionChoice | ''>('');
  const [reserveVat, setReserveVat] = useState<VatChoice | ''>('yes');
  const [reserveRequesterName, setReserveRequesterName] = useState('');
  const [reserveRequesterRole, setReserveRequesterRole] = useState<RequesterRole | ''>('admin');
  const [reserveEtd, setReserveEtd] = useState('');
  const [reserveEta, setReserveEta] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: string; label: string }>>([]);
  const [supplierId, setSupplierId] = useState('');
  const [customers, setCustomers] = useState<
    Array<{ id: string; customer_code: string; full_name: string; company_name: string | null; phone?: string | null; email?: string | null }>
  >([]);
  const [reserveCustomerId, setReserveCustomerId] = useState('');
  const [reserveBusy, setReserveBusy] = useState(false);

  const [nextStage, setNextStage] = useState<LifecycleStage>('auction');
  const [stageNotes, setStageNotes] = useState('');
  const [eventType, setEventType] = useState<Exclude<LifecycleEventType, 'stage_change'>>('inspection');
  const [eventTitle, setEventTitle] = useState('');
  const [eventNotes, setEventNotes] = useState('');

  const load = useCallback(async () => {
    setFetching(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [vehicleRes, photosRes, eventsRes, attachmentsRes, profileRes] = await Promise.all([
      supabase.from('vehicles').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('vehicle_photos')
        .select('id, vehicle_id, storage_path, is_cover, is_auction_sheet, view_type, sort_order, created_at')
        .eq('vehicle_id', id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('vehicle_lifecycle_events')
        .select('*')
        .eq('vehicle_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('vehicle_lifecycle_event_attachments')
        .select('*')
        .eq('vehicle_id', id)
        .order('created_at', { ascending: false }),
      user
        ? supabase.from('admin_profiles').select('role,full_name,email').eq('id', user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (vehicleRes.error || !vehicleRes.data) {
      toast.error(vehicleRes.error?.message || 'Vehicle not found.');
      router.push('/admin/vehicles');
      return;
    }

    const row = vehicleRes.data as Vehicle;
    setVehicle(row);
    setPhotos(((photosRes.data || []) as VehiclePhoto[]).sort((a, b) => a.sort_order - b.sort_order));
    setTitle(row.title);
    setMake(row.make);
    setModel(row.model);
    setVariant(row.variant || '');
    setYear(row.year?.toString() || '');
    setStockNumber(row.stock_number || '');
    setChassisNumber(row.chassis_number || '');
    setLocation(row.location || '');
    setDestinationMarkets(row.destination_markets || []);
    setStockOrigin(row.stock_origin || 'dubai');
    setStockPool((row.stock_pool as StockPool) || 'owned');
    setStockStatus(row.stock_status || 'available');
    setVehicleClass(row.vehicle_class || 'passenger');
    setEquipmentCategory(row.equipment_category || '');
    setOperatingHours(row.operating_hours != null ? String(row.operating_hours) : '');
    setPurchasePrice(row.purchase_price != null ? String(row.purchase_price) : '');
    setPurchaseCurrency(row.purchase_currency || 'AED');
    setPurchaseDate(row.purchase_date || '');
    setLandedCost(row.landed_cost != null ? String(row.landed_cost) : '');
    setPrice(row.price != null ? String(row.price) : '');
    setPriceFob(row.price_fob != null ? String(row.price_fob) : '');
    setPriceCf(row.price_cf != null ? String(row.price_cf) : '');
    setPriceCif(row.price_cif != null ? String(row.price_cif) : '');
    setCurrency(row.currency || 'USD');
    setShowPrice(Boolean(row.show_price));
    setReservePriceTerm((row.reservation_price_term as PriceTerm) || 'fob');
    setReserveShipmentTerm((row.reservation_shipment_term as ShipmentMode) || 'roro');
    setReserveInspection(boolToInspectionChoice(row.reservation_inspection_required));
    setReserveVat(boolToVatChoice(row.reservation_vat_applicable) || 'yes');
    const profileRole = (profileRes.data?.role as string) || null;
    if (row.stock_status === 'available' && !row.reservation_requester_name) {
      setReserveRequesterName(profileRequesterName(profileRes.data));
      setReserveRequesterRole(accountRoleToRequesterRole(profileRole));
    } else {
      setReserveRequesterName(row.reservation_requester_name || '');
      setReserveRequesterRole(
        (row.reservation_requester_role as RequesterRole) || accountRoleToRequesterRole(profileRole)
      );
    }
    setReserveEtd(row.reservation_etd || '');
    setReserveEta(row.reservation_eta || '');
    setSupplierId(row.supplier_id || '');
    setReserveCustomerId(row.reserved_customer_id || '');
    setNextStage(RECOMMENDED_NEXT_STAGE[row.lifecycle_stage || 'unassigned'] || 'auction');
    setForceOverride(false);
    setIsAccountAdmin(profileRes.data?.role === 'admin');
    setEvents((eventsRes.data || []) as VehicleLifecycleEvent[]);
    const grouped: Record<string, VehicleLifecycleEventAttachment[]> = {};
    for (const attachment of (attachmentsRes.data || []) as VehicleLifecycleEventAttachment[]) {
      grouped[attachment.event_id] = grouped[attachment.event_id] || [];
      grouped[attachment.event_id].push(attachment);
    }
    setAttachmentsByEvent(grouped);
    setFetching(false);

    const [supRes, custRes] = await Promise.all([
      supabase.from('suppliers').select('id,supplier_code,name').eq('is_active', true).order('name').limit(200),
      supabase.from('customers').select('id,customer_code,full_name,company_name,phone,email').order('full_name').limit(500),
    ]);
    setSuppliers((supRes.data || []).map((item) => ({ id: item.id, label: `${item.supplier_code} — ${item.name}` })));
    setCustomers((custRes.data || []) as typeof customers);
  }, [
    id,
    router,
    setChassisNumber,
    setCurrency,
    setDestinationMarkets,
    setEquipmentCategory,
    setLandedCost,
    setLocation,
    setMake,
    setModel,
    setNextStage,
    setOperatingHours,
    setPrice,
    setPriceCf,
    setPriceCif,
    setPriceFob,
    setPurchaseCurrency,
    setPurchaseDate,
    setPurchasePrice,
    setReserveCustomerId,
    setReserveEta,
    setReserveEtd,
    setReserveInspection,
    setReservePriceTerm,
    setReserveRequesterName,
    setReserveRequesterRole,
    setReserveShipmentTerm,
    setReserveVat,
    setShowPrice,
    setStockNumber,
    setStockOrigin,
    setStockPool,
    setStockStatus,
    setSupplierId,
    setTitle,
    setVariant,
    setVehicleClass,
    setYear,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentStage = (vehicle?.lifecycle_stage || 'unassigned') as LifecycleStage;
  const recommendedNext = RECOMMENDED_NEXT_STAGE[currentStage];
  const jumpNeedsForce = !isRecommendedLifecycleTransition(currentStage, nextStage);
  const stageOptions = useMemo(
    () => LIFECYCLE_STAGES.filter((stage) => stage.value !== currentStage),
    [currentStage]
  );
  const customerOptions = useMemo(() => customers.map(customerSelectOption), [customers]);

  const formatBytes = (value: number | null) => {
    if (!value) return '';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };

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
        destination_markets: destinationMarkets,
        stock_origin: stockOrigin,
        stock_pool: stockPool,
        stock_status: stockStatus,
        vehicle_class: vehicleClass,
        equipment_category: isMachineryClass(vehicleClass) ? (equipmentCategory.trim() || null) : null,
        operating_hours:
          isMachineryClass(vehicleClass) && operatingHours !== ''
            ? Number.parseInt(operatingHours, 10)
            : null,
        purchase_price: purchasePrice === '' ? null : Number(purchasePrice),
        purchase_currency: purchaseCurrency.trim().toUpperCase() || 'AED',
        purchase_date: purchaseDate || null,
        landed_cost: landedCost === '' ? null : Number(landedCost),
        supplier_id: supplierId || null,
        price: parseOptionalPrice(price),
        price_fob: parseOptionalPrice(priceFob),
        price_cf: parseOptionalPrice(priceCf),
        price_cif: parseOptionalPrice(priceCif),
        currency: currency.trim().toUpperCase() || 'USD',
        show_price: showPrice,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Vehicle details saved.');
    requestPublicRevalidation('vehicle', [vehicle?.slug]);
    await load();
  };

  const transitionStage = async () => {
    if (!vehicle) return;
    const needsForce = !isRecommendedLifecycleTransition(currentStage, nextStage);
    if (needsForce) {
      if (!isAccountAdmin) {
        toast.error(
          `Staff can only move to the next recommended stage (${lifecycleStageLabel(recommendedNext) || 'none'}). Ask an account admin to force a jump.`
        );
        return;
      }
      if (!forceOverride) {
        toast.error('Enable force override and enter a reason to skip stages.');
        return;
      }
      if (!stageNotes.trim()) {
        toast.error('Forced lifecycle jumps require a reason in notes.');
        return;
      }
    }
    setTransitioning(true);
    const { error } = await supabase.rpc('transition_vehicle_lifecycle', {
      p_vehicle_id: id,
      p_to_stage: nextStage,
      p_notes: stageNotes.trim() || null,
      p_sync_stock_sold: true,
      p_force: needsForce,
    });
    setTransitioning(false);
    if (error) return toast.error(error.message);
    toast.success(`Moved to ${lifecycleStageLabel(nextStage)}.`);
    setStageNotes('');
    setForceOverride(false);
    await load();
  };

  const uploadEventFiles = async (eventId: string, fileList: FileList | null) => {
    if (!fileList?.length || !vehicle) return;
    const files = Array.from(fileList);
    const tooLarge = files.find((file) => file.size > LIFECYCLE_ATTACHMENT_MAX_BYTES);
    if (tooLarge) {
      toast.error(`${tooLarge.name} is larger than 25 MB.`);
      return;
    }
    setUploadingEventId(eventId);
    try {
      for (const file of files) {
        const path = lifecycleEventAttachmentStoragePath(id, eventId, file.name);
        const { error: uploadError } = await supabase.storage
          .from('internal-files')
          .upload(path, file, { cacheControl: '3600' });
        if (uploadError) throw uploadError;
        const { error: registerError } = await supabase.rpc('register_vehicle_lifecycle_event_attachment', {
          p_event_id: eventId,
          p_storage_path: path,
          p_file_name: file.name,
          p_mime_type: file.type || null,
          p_size_bytes: file.size,
        });
        if (registerError) {
          await supabase.storage.from('internal-files').remove([path]);
          throw registerError;
        }
      }
      toast.success(files.length === 1 ? 'File attached.' : `${files.length} files attached.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to attach file.');
    } finally {
      setUploadingEventId(null);
    }
  };

  const openAttachment = async (attachment: VehicleLifecycleEventAttachment) => {
    const { data, error } = await supabase.storage
      .from('internal-files')
      .createSignedUrl(attachment.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message || 'Unable to open attachment.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const removeAttachment = async (attachment: VehicleLifecycleEventAttachment) => {
    setRemovingAttachmentId(attachment.id);
    const { error: storageError } = await supabase.storage
      .from('internal-files')
      .remove([attachment.storage_path]);
    if (storageError) {
      setRemovingAttachmentId(null);
      toast.error(storageError.message);
      return;
    }
    const { error } = await supabase.rpc('delete_vehicle_lifecycle_event_attachment', {
      p_attachment_id: attachment.id,
    });
    setRemovingAttachmentId(null);
    if (error) return toast.error(error.message);
    toast.success('Attachment removed.');
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
    if (!reservePriceTerm || !reserveShipmentTerm) {
      toast.error('Select price term and shipment term.');
      return;
    }
    if (!reserveInspection) {
      toast.error('Select whether inspection is required (Yes or No).');
      return;
    }
    if (!reserveVat) {
      toast.error('Select whether VAT applies (Yes or No).');
      return;
    }
    if (!reserveRequesterName.trim() || !reserveRequesterRole) {
      toast.error('Enter requester name and role.');
      return;
    }
    setReserveBusy(true);
    const { error } = await supabase.rpc('reserve_vehicle_stock', {
      p_vehicle_id: id,
      p_customer_id: reserveCustomerId,
      p_price_term: reservePriceTerm,
      p_shipment_term: reserveShipmentTerm,
      p_inspection_required: inspectionChoiceToBool(reserveInspection),
      p_vat_applicable: vatChoiceToBool(reserveVat) !== false,
      p_etd: reserveEtd || null,
      p_eta: reserveEta || null,
      p_requester_name: reserveRequesterName.trim(),
      p_requester_role: reserveRequesterRole,
    });
    setReserveBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Vehicle reserved and unpublished from the website.');
    requestPublicRevalidation('vehicle', [vehicle?.slug]);
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
    requestPublicRevalidation('vehicle', [vehicle?.slug]);
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
    requestPublicRevalidation('vehicle', [vehicle?.slug]);
    await load();
  };

  const getPhotoUrl = (path: string) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    return `${supabaseUrl}/storage/v1/object/public/vehicle-images/${path}`;
  };

  /**
   * Uploads vehicle photos. With `replaceExisting` (yard images), the current
   * photos are deleted only after every new image uploaded successfully.
   */
  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    replaceExisting = false
  ) => {
    const input = e.target;
    const files = input.files;
    if (!files || files.length === 0 || !vehicle) return;

    const previousPhotos = replaceExisting ? [...photos] : [];
    if (
      replaceExisting &&
      previousPhotos.length > 0 &&
      !window.confirm(
        `Upload ${files.length} yard image(s)? The ${previousPhotos.length} existing photo(s) will be permanently deleted once the upload completes.`
      )
    ) {
      input.value = '';
      return;
    }

    setUploadingPhotos(true);
    setUploadProgress({ completed: 0, total: files.length });
    const folder = vehicle.slug || vehicle.id;
    let successCount = 0;
    const startingCount = replaceExisting ? 0 : photos.length;
    const uploaded: VehiclePhoto[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const auctionSheet = isAuctionSheetFilename(file.name);
      const optimized = await compressCatalogImage(
        file,
        `${vehicle.make}-${vehicle.model}-${folder}-${auctionSheet ? 'auction-sheet' : replaceExisting ? `yard-${i + 1}` : startingCount + i + 1}`
      );
      const fileName = `${folder}/${Date.now()}-${optimized.file.name}`;

      const { error: upErr } = await supabase.storage
        .from('vehicle-images')
        .upload(fileName, optimized.file, { contentType: 'image/webp', cacheControl: '31536000' });

      if (upErr) {
        toast.error(`Failed to upload ${file.name}`);
        setUploadProgress((progress) => ({ ...progress, completed: progress.completed + 1 }));
        continue;
      }

      const { data: photoData, error: photoErr } = await supabase
        .from('vehicle_photos')
        .insert({
          vehicle_id: vehicle.id,
          storage_path: fileName,
          // When replacing, the cover is assigned after the old photos are removed.
          is_cover: !replaceExisting && !auctionSheet && startingCount === 0 && i === 0,
          is_auction_sheet: auctionSheet,
          view_type: 'other',
          sort_order: startingCount + i,
        })
        .select('id, vehicle_id, storage_path, is_cover, is_auction_sheet, sort_order, created_at')
        .single();

      if (!photoErr && photoData) {
        uploaded.push(photoData as VehiclePhoto);
        setPhotos((prev) => [...prev, photoData as VehiclePhoto]);
        successCount++;
      } else if (photoErr) {
        await supabase.storage.from('vehicle-images').remove([fileName]);
        toast.error(`Failed to save ${file.name}`);
      }
      setUploadProgress((progress) => ({ ...progress, completed: progress.completed + 1 }));
    }

    if (replaceExisting && successCount > 0) {
      const assignCover = async () => {
        const cover = uploaded.find((photo) => !photo.is_auction_sheet) || uploaded[0];
        const { error: coverError } = await supabase
          .from('vehicle_photos')
          .update({ is_cover: true })
          .eq('id', cover.id);
        return coverError ? null : cover.id;
      };

      if (successCount < files.length) {
        // Roll back the partial yard set so the vehicle never shows a mix of old and new photos.
        const uploadedIds = new Set(uploaded.map((photo) => photo.id));
        await supabase.from('vehicle_photos').delete().in('id', uploaded.map((photo) => photo.id));
        await supabase.storage.from('vehicle-images').remove(uploaded.map((photo) => photo.storage_path));
        setPhotos((current) => current.filter((photo) => !uploadedIds.has(photo.id)));
        successCount = 0;
        toast.error('Some yard images failed to upload. Nothing was changed; please try again.');
      } else {
        if (previousPhotos.length > 0) {
          // Delete database rows first so no photo ever points at a missing file.
          const { error: databaseError } = await supabase
            .from('vehicle_photos')
            .delete()
            .in('id', previousPhotos.map((photo) => photo.id));
          if (databaseError) {
            toast.error('Yard images uploaded, but the old photos could not be deleted.');
            await load();
          } else {
            const { error: storageError } = await supabase.storage
              .from('vehicle-images')
              .remove(previousPhotos.map((photo) => photo.storage_path));
            if (storageError) console.warn('Old vehicle image files were not removed from storage', storageError);
            const previousIds = new Set(previousPhotos.map((photo) => photo.id));
            const coverId = await assignCover();
            setPhotos((current) =>
              current
                .filter((photo) => !previousIds.has(photo.id))
                .map((photo) => ({ ...photo, is_cover: photo.id === coverId }))
            );
          }
        } else {
          const coverId = await assignCover();
          if (coverId) {
            setPhotos((current) => current.map((photo) => ({ ...photo, is_cover: photo.id === coverId })));
          }
        }

        // Best-effort audit trail on the vehicle timeline.
        const { error: eventError } = await supabase.rpc('record_vehicle_lifecycle_event', {
          p_vehicle_id: vehicle.id,
          p_event_type: 'yard_images',
          p_title: `${successCount} yard image(s) uploaded`,
          p_notes: previousPhotos.length > 0 ? `Replaced ${previousPhotos.length} previous photo(s).` : null,
          p_metadata: { uploaded: successCount, replaced: previousPhotos.length },
        });
        if (!eventError) void load();
      }
    }
    setUploadingPhotos(false);
    if (successCount > 0) {
      toast.success(
        replaceExisting ? `${successCount} yard image(s) uploaded.` : `${successCount} photo(s) uploaded.`
      );
      requestPublicRevalidation('vehicle', [vehicle?.slug]);
    }
    input.value = '';
  };

  const setCoverPhoto = async (photoId: string) => {
    if (!vehicle) return;
    const target = photos.find((photo) => photo.id === photoId);
    if (target?.is_auction_sheet) {
      toast.error('Auction sheets cannot be set as the cover photo.');
      return;
    }
    setPhotoActionId(photoId);
    const { error: clearError } = await supabase
      .from('vehicle_photos')
      .update({ is_cover: false })
      .eq('vehicle_id', vehicle.id);
    const { error: coverError } = await supabase
      .from('vehicle_photos')
      .update({ is_cover: true })
      .eq('id', photoId);
    setPhotoActionId(null);
    if (clearError || coverError) {
      toast.error('Could not update the cover photo.');
      return;
    }
    setPhotos((prev) => prev.map((photo) => ({ ...photo, is_cover: photo.id === photoId })));
    toast.success('Cover photo updated.');
    requestPublicRevalidation('vehicle', [vehicle?.slug]);
  };

  const setPhotoView = async (photoId: string, viewType: VehiclePhotoView) => {
    setPhotoActionId(photoId);
    const { error } = await supabase.from('vehicle_photos').update({ view_type: viewType }).eq('id', photoId);
    setPhotoActionId(null);
    if (error) return toast.error('Could not update the photo angle.');
    setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, view_type: viewType } : photo));
    toast.success('Photo angle updated.');
    requestPublicRevalidation('vehicle', [vehicle?.slug]);
  };

  const deletePhoto = async (photoId: string, storagePath: string) => {
    if (!vehicle) return;
    if (!window.confirm('Delete this photo permanently?')) return;
    setPhotoActionId(photoId);
    const deletedPhoto = photos.find((photo) => photo.id === photoId);
    const { error: storageError } = await supabase.storage.from('vehicle-images').remove([storagePath]);
    const { error: databaseError } = await supabase.from('vehicle_photos').delete().eq('id', photoId);
    if (storageError || databaseError) {
      setPhotoActionId(null);
      toast.error('Could not delete the photo.');
      return;
    }
    const remainingPhotos = photos.filter((photo) => photo.id !== photoId);
    setPhotos(remainingPhotos);
    if (deletedPhoto?.is_cover && remainingPhotos[0]) {
      const replacement = remainingPhotos.find((photo) => !photo.is_auction_sheet) || remainingPhotos[0];
      const { error: replacementError } = await supabase
        .from('vehicle_photos')
        .update({ is_cover: true })
        .eq('id', replacement.id);
      if (!replacementError) {
        setPhotos((current) =>
          current.map((photo) => ({ ...photo, is_cover: photo.id === replacement.id }))
        );
      }
    }
    setPhotoActionId(null);
    toast.success('Photo deleted.');
    requestPublicRevalidation('vehicle', [vehicle?.slug]);
  };

  const movePhoto = async (photoId: string, targetIndex: number) => {
    if (!vehicle || photoActionId || uploadingPhotos || reorderingPhotos.current) return;
    const index = photos.findIndex((photo) => photo.id === photoId);
    const swapIndex = targetIndex;
    if (index < 0 || swapIndex < 0 || swapIndex >= photos.length || index === swapIndex) return;

    const current = photos[index];
    reorderingPhotos.current = true;
    setPhotoActionId(photoId);

    const ordered = [...photos];
    ordered.splice(index, 1);
    ordered.splice(swapIndex, 0, current);
    const normalized = ordered.map((photo, sort_order) => ({ ...photo, sort_order }));
    setPhotos(normalized);
    try {
      const { error } = await supabase
        .from('vehicle_photos')
        .upsert(normalized.map((photo) => ({
          id: photo.id, vehicle_id: vehicle.id, storage_path: photo.storage_path,
          is_cover: photo.is_cover, is_auction_sheet: photo.is_auction_sheet,
          view_type: photo.view_type || 'other', sort_order: photo.sort_order, created_at: photo.created_at,
        })));
      if (error) throw error;
      requestPublicRevalidation('vehicle', [vehicle.slug]);
    } catch {
      setPhotos(photos);
      toast.error('Could not reorder photos. Please try again.');
    } finally {
      reorderingPhotos.current = false;
      setPhotoActionId(null);
    }
  };

  const replacePhoto = async (photoId: string, file: File | undefined) => {
    if (!vehicle || !file) return;
    const existing = photos.find((photo) => photo.id === photoId);
    if (!existing) return;

    setPhotoActionId(photoId);
    const folder = vehicle.slug || vehicle.id;
    const optimized = await compressCatalogImage(
      file,
      `${vehicle.make}-${vehicle.model}-${folder}-replace`
    );
    const fileName = `${folder}/${Date.now()}-${optimized.file.name}`;

    const { error: upErr } = await supabase.storage
      .from('vehicle-images')
      .upload(fileName, optimized.file, { contentType: 'image/webp', cacheControl: '31536000' });

    if (upErr) {
      setPhotoActionId(null);
      toast.error('Could not upload the replacement image.');
      return;
    }

    const { error: updateError } = await supabase
      .from('vehicle_photos')
      .update({ storage_path: fileName })
      .eq('id', photoId);

    if (updateError) {
      await supabase.storage.from('vehicle-images').remove([fileName]);
      setPhotoActionId(null);
      toast.error('Could not replace the photo.');
      return;
    }

    await supabase.storage.from('vehicle-images').remove([existing.storage_path]);
    setPhotos((prev) =>
      prev.map((photo) => (photo.id === photoId ? { ...photo, storage_path: fileName } : photo))
    );
    setPhotoActionId(null);
    toast.success('Photo replaced.');
    requestPublicRevalidation('vehicle', [vehicle?.slug]);
  };

  if (fetching || !vehicle) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const auctionPool = isAuctionStockPool(vehicle.stock_pool || stockPool);
  const listHref = auctionPool ? '/admin/auction-stock' : '/admin/vehicles';

  const transferPool = async (nextPool: StockPool) => {
    const toOwned = nextPool === 'owned';
    if (
      !window.confirm(
        toOwned
          ? `Transfer "${vehicle.title}" into owned Vehicles inventory?`
          : `Move "${vehicle.title}" to Auction stock (third-party)?`
      )
    ) {
      return;
    }
    const changes: Record<string, unknown> = { stock_pool: nextPool };
    if (toOwned && !vehicle.purchase_date && !purchaseDate) {
      changes.purchase_date = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase.from('vehicles').update(changes).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success(toOwned ? 'Transferred to owned inventory.' : 'Moved to auction stock.');
    requestPublicRevalidation('vehicle', [vehicle?.slug]);
    await load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
            <Link href={listHref}>
              <ArrowLeft className="h-4 w-4" />
              {auctionPool ? 'Back to auction stock' : 'Back to vehicles'}
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{vehicle.title}</h1>
            <p className="text-sm text-muted-foreground">
              {stockPoolLabel(vehicle.stock_pool)} · {stockOriginLabel(vehicle.stock_origin)} ·{' '}
              {vehicle.stock_number || vehicle.chassis_number || vehicle.slug}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={stageClass[vehicle.lifecycle_stage || 'unassigned']}>
              {lifecycleStageLabel(vehicle.lifecycle_stage)}
            </Badge>
            <Badge className={statusClass[vehicle.stock_status || 'available']}>
              {(vehicle.stock_status || 'available').replace('_', ' ')}
            </Badge>
            {auctionPool ? (
              <Badge className="border-0 bg-violet-600 text-white">Auction stock</Badge>
            ) : (
              <Badge variant="outline">Owned inventory</Badge>
            )}
            {vehicle.is_published ? <Badge variant="outline">Public</Badge> : <Badge variant="secondary">Draft</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {auctionPool ? (
            <Button type="button" variant="accent" onClick={() => void transferPool('owned')}>
              <PackagePlus className="h-4 w-4" />
              Transfer to inventory
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => void transferPool('auction_third_party')}>
              <Gavel className="h-4 w-4" />
              Mark as auction stock
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/vehicles/${vehicle.slug}`} target="_blank">
              View public page
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={activeSection} onValueChange={setActiveSection} className="space-y-4">
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1" aria-label="Vehicle edit sections">
          <TabsTrigger value="details" className="min-h-9 shrink-0">Details</TabsTrigger>
          <TabsTrigger value="photos" className="min-h-9 shrink-0">Photos ({photos.length})</TabsTrigger>
          <TabsTrigger value="pricing" className="min-h-9 shrink-0">Pricing</TabsTrigger>
          <TabsTrigger value="workflow" className="min-h-9 shrink-0">Workflow</TabsTrigger>
          <TabsTrigger value="history" className="min-h-9 shrink-0">History</TabsTrigger>
        </TabsList>
        <TabsContent value="details" forceMount className="space-y-4 data-[state=inactive]:hidden">
<Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Vehicle details</CardTitle>
          <CardDescription>Catalog fields. Stock availability remains independent of operational stage.</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <form className="space-y-3 [&_input]:h-9 [&_select]:h-9" onSubmit={saveBasics}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
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
                <Label htmlFor="vehicle-class">Inventory class</Label>
                <select
                  id="vehicle-class"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={vehicleClass}
                  onChange={(event) => {
                    const next = event.target.value as VehicleClass;
                    setVehicleClass(next);
                    if (!isMachineryClass(next)) {
                      setEquipmentCategory('');
                      setOperatingHours('');
                    }
                  }}
                >
                  {VEHICLE_CLASSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              {isMachineryClass(vehicleClass) ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="equipment-category">Equipment type</Label>
                    <select
                      id="equipment-category"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={equipmentCategory}
                      onChange={(event) => setEquipmentCategory(event.target.value)}
                    >
                      <option value="">Select type</option>
                      {EQUIPMENT_CATEGORIES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="operating-hours">Operating hours</Label>
                    <Input
                      id="operating-hours"
                      value={operatingHours}
                      onChange={(event) => setOperatingHours(event.target.value)}
                      inputMode="numeric"
                      placeholder="6500"
                    />
                  </div>
                </>
              ) : null}
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
              <VehicleDestinationMarketsField value={destinationMarkets} onChange={setDestinationMarkets} />
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
                <Label htmlFor="stock-pool">Stock pool</Label>
                <select
                  id="stock-pool"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={stockPool}
                  onChange={(event) => setStockPool(event.target.value as StockPool)}
                >
                  <option value="owned">Owned inventory (Vehicles)</option>
                  <option value="auction_third_party">Auction stock (third-party)</option>
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
              <div className="space-y-1.5">
                <Label htmlFor="sell-price">List price</Label>
                <Input id="sell-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sell-currency">Currency</Label>
                <Input id="sell-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
              </div>
              <div className="flex items-end sm:col-span-2 lg:col-span-3">
                <div className="flex items-center gap-2 pb-2">
                  <Switch id="show-sell-price" checked={showPrice} onCheckedChange={setShowPrice} />
                  <Label htmlFor="show-sell-price">Show prices publicly</Label>
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <IncotermPriceFields
                  currency={currency}
                  values={{ priceFob, priceCf, priceCif }}
                  onChange={(patch) => {
                    if (patch.priceFob !== undefined) setPriceFob(patch.priceFob);
                    if (patch.priceCf !== undefined) setPriceCf(patch.priceCf);
                    if (patch.priceCif !== undefined) setPriceCif(patch.priceCif);
                  }}
                />
                <PriceSanityHint price={priceFob} currency={currency} make={make} model={model} year={year} excludeVehicleId={id} />
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save details
            </Button>
          </form>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="photos" forceMount className="space-y-4 data-[state=inactive]:hidden">
<Card id="photos" className="scroll-mt-24 overflow-hidden">
        <CardHeader className="px-4 py-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Photos</CardTitle>
              <CardDescription>
                {photos.length} {photos.length === 1 ? 'image' : 'images'} · Drag photos to reorder
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
            <label>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => void handlePhotoUpload(event)}
                disabled={uploadingPhotos}
              />
              <Button type="button" variant="outline" size="sm" asChild disabled={uploadingPhotos}>
                <span>
                  {uploadingPhotos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploadingPhotos
                    ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}`
                    : 'Upload Photos'}
                </span>
              </Button>
            </label>
            <label title="Upload yard images and delete the current photos once the upload finishes">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(event) => void handlePhotoUpload(event, true)}
                disabled={uploadingPhotos}
              />
              <Button type="button" variant="outline" size="sm" asChild disabled={uploadingPhotos}>
                <span>
                  <Upload className="h-4 w-4" />
                  Upload Yard Images
                </span>
              </Button>
            </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/30 px-4 py-5 text-center transition-colors hover:border-foreground/30 hover:bg-secondary/60">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(event) => void handlePhotoUpload(event)}
              disabled={uploadingPhotos}
            />
            {uploadingPhotos ? (
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" />
            )}
            <span>
              <span className="block text-sm font-semibold">
                {uploadingPhotos ? 'Uploading your images…' : 'Select vehicle photos'}
              </span>
              <span className="block text-xs text-muted-foreground">
                PNG, JPG or WEBP · clear square images work best
              </span>
            </span>
          </label>
          {photos.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl bg-secondary/30 py-10 text-center">
              <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">No photos uploaded yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
              {photos.map((photo, index) => (
                <div
                  key={photo.id}
                  data-photo-id={photo.id}
                  className={`group overflow-hidden rounded-xl border bg-secondary/30 ${
                    dropPhotoId === photo.id && draggingPhotoId !== photo.id ? 'border-accent ring-4 ring-accent/30' : photo.is_cover ? 'border-accent ring-2 ring-accent/15' : 'border-border'
                  }`}
                >
                  <div
                    className={`relative h-28 sm:h-32 touch-none select-none rounded-t-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${draggingPhotoId === photo.id ? 'cursor-grabbing opacity-50' : 'cursor-grab'}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Reorder photo ${index + 1}. Drag to another photo, or use arrow keys.`}
                    aria-disabled={Boolean(photoActionId || uploadingPhotos)}
                    onKeyDown={(event) => {
                      const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
                      if (direction) {
                        event.preventDefault();
                        void movePhoto(photo.id, index + direction);
                      }
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || photoActionId || uploadingPhotos || reorderingPhotos.current) return;
                      event.preventDefault();
                      event.currentTarget.focus();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      photoDrag.current = { id: photo.id, x: event.clientX, y: event.clientY, moved: false, target: null };
                    }}
                    onPointerMove={(event) => {
                      const drag = photoDrag.current;
                      if (!drag || drag.id !== photo.id) return;
                      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8 && !drag.moved) return;
                      drag.moved = true;
                      if (event.clientY < 80) window.scrollBy(0, -16);
                      else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 16);
                      setDraggingPhotoId(photo.id);
                      const card = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-photo-id]');
                      drag.target = card?.dataset.photoId ?? null;
                      setDropPhotoId(drag.target);
                    }}
                    onPointerUp={(event) => {
                      const drag = photoDrag.current;
                      photoDrag.current = null;
                      setDraggingPhotoId(null);
                      setDropPhotoId(null);
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      if (drag?.moved && drag.target) void movePhoto(drag.id, photos.findIndex((item) => item.id === drag.target));
                    }}
                    onLostPointerCapture={() => {
                      photoDrag.current = null;
                      setDraggingPhotoId(null);
                      setDropPhotoId(null);
                    }}
                  >
                    <GripVertical className="pointer-events-none absolute bottom-2 left-2 z-10 h-5 w-5 rounded bg-background/90 text-muted-foreground" aria-hidden="true" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getPhotoUrl(photo.storage_path)}
                      draggable={false}
                      alt={`${title || vehicle.title || 'Vehicle'} photo ${index + 1}`}
                      className="h-full w-full object-contain p-2"
                    />
                    {photo.is_cover && (
                      <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-[11px] font-semibold text-accent-foreground shadow-sm">
                        <Star className="h-3 w-3 fill-current" /> Cover
                      </div>
                    )}
                    {photo.is_auction_sheet && (
                      <div className="absolute right-2 top-2 rounded-full border border-amber-500/40 bg-amber-500/90 px-2 py-1 text-[11px] font-semibold text-amber-950 shadow-sm">
                        Auction sheet
                      </div>
                    )}
                    {!photo.is_auction_sheet && (
                      <div className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-1 text-[11px] font-semibold shadow-sm">
                        {VEHICLE_PHOTO_VIEW_LABELS[photo.view_type || 'other']}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 border-t border-border p-2">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Photo angle
                      <select aria-label="Photo angle" value={photo.view_type || 'other'} disabled={photo.is_auction_sheet || Boolean(photoActionId) || uploadingPhotos} onChange={(event) => void setPhotoView(photo.id, event.target.value as VehiclePhotoView)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground">
                        {VEHICLE_PHOTO_VIEWS.map((view) => <option key={view} value={view}>{VEHICLE_PHOTO_VIEW_LABELS[view]}</option>)}
                      </select>
                    </label>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 px-0"
                        title={photo.is_cover ? 'Cover' : 'Make cover'}
                        aria-label={photo.is_cover ? 'Cover photo' : 'Make cover'}
                        disabled={photo.is_cover || photo.is_auction_sheet || Boolean(photoActionId) || uploadingPhotos}
                        onClick={() => void setCoverPhoto(photo.id)}
                      >
                        {photoActionId === photo.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Star className="h-3.5 w-3.5" />
                        )}
                        <span className="sr-only">{photo.is_cover ? 'Cover' : 'Make cover'}</span>
                      </Button>
                      <label className="flex-1">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={Boolean(photoActionId) || uploadingPhotos}
                          onChange={(event) => {
                            void replacePhoto(photo.id, event.target.files?.[0]);
                            event.currentTarget.value = '';
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 px-0"
                          title="Replace photo"
                          asChild
                          disabled={Boolean(photoActionId) || uploadingPhotos}
                        >
                          <span>
                            <Replace className="h-3.5 w-3.5" />
                            <span className="sr-only">Replace photo</span>
                          </span>
                        </Button>
                      </label>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={Boolean(photoActionId) || uploadingPhotos}
                        onClick={() => void deletePhoto(photo.id, photo.storage_path)}
                        aria-label={`Delete photo ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="pricing" forceMount className="space-y-4 data-[state=inactive]:hidden">
<StockLinkedInvoices vehicleId={vehicle.id} />

<VehicleFreightEstimator
        vehicleTitle={vehicle.title}
        make={make}
        model={model}
        savedVolumeM3={normalizeVehicleModel(make) === normalizeVehicleModel(vehicle.make) && normalizeVehicleModel(model) === normalizeVehicleModel(vehicle.model) ? vehicle.volume_m3 : null}
        priceFob={parseOptionalPrice(priceFob) ?? parseOptionalPrice(price)}
        currency={currency}
        onQuoteApply={({ cf, cif }) => {
          setPriceCf(String(cf));
          if (cif != null) setPriceCif(String(cif));
          toast.success('Quote prices added to the form. Save the vehicle to publish the changes.');
        }}
      />

<Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Purchase cost &amp; reservation</CardTitle>
          <CardDescription>
            Cost comes from receive-stock (GRN) or manual entry. Reserve for a customer to hold stock and hide it from the public catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void saveBasics(event)}>
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
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Price term</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={reservePriceTerm}
                disabled={vehicle.stock_status === 'reserved' || vehicle.stock_status === 'sold'}
                onChange={(e) => setReservePriceTerm(e.target.value as PriceTerm)}
              >
                {PRICE_TERMS.map((term) => (
                  <option key={term} value={term}>
                    {PRICE_TERM_LABELS[term]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Shipment term</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={reserveShipmentTerm}
                disabled={vehicle.stock_status === 'reserved' || vehicle.stock_status === 'sold'}
                onChange={(e) => setReserveShipmentTerm(e.target.value as ShipmentMode)}
              >
                {SHIPMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {SHIPMENT_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Inspection</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={reserveInspection}
                disabled={vehicle.stock_status === 'reserved' || vehicle.stock_status === 'sold'}
                onChange={(e) => setReserveInspection(e.target.value as InspectionChoice | '')}
                required
              >
                <option value="" disabled>
                  Select Yes or No
                </option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">VAT</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={reserveVat}
                disabled={vehicle.stock_status === 'reserved' || vehicle.stock_status === 'sold'}
                onChange={(e) => setReserveVat(e.target.value as VatChoice | '')}
              >
                <option value="yes">Yes — apply VAT</option>
                <option value="no">No — exclude VAT</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Requester name</span>
              <Input
                value={reserveRequesterName}
                disabled={vehicle.stock_status === 'reserved' || vehicle.stock_status === 'sold'}
                onChange={(e) => setReserveRequesterName(e.target.value)}
                maxLength={120}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Requester role</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={reserveRequesterRole}
                disabled={vehicle.stock_status === 'reserved' || vehicle.stock_status === 'sold'}
                onChange={(e) => setReserveRequesterRole(e.target.value as RequesterRole)}
              >
                {REQUESTER_ROLES.map((item) => (
                  <option key={item} value={item}>
                    {REQUESTER_ROLE_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">ETD</span>
              <Input
                type="date"
                value={reserveEtd}
                disabled={vehicle.stock_status === 'reserved' || vehicle.stock_status === 'sold'}
                onChange={(e) => setReserveEtd(e.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">ETA</span>
              <Input
                type="date"
                value={reserveEta}
                disabled={vehicle.stock_status === 'reserved' || vehicle.stock_status === 'sold'}
                onChange={(e) => setReserveEta(e.target.value)}
              />
            </label>
            {vehicle.stock_status === 'reserved' ? (
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Active reservation:{' '}
                {vehicle.reservation_price_term
                  ? PRICE_TERM_LABELS[vehicle.reservation_price_term]
                  : 'no price term'}{' '}
                ·{' '}
                {vehicle.reservation_shipment_term
                  ? SHIPMENT_MODE_LABELS[vehicle.reservation_shipment_term]
                  : 'no shipment term'}{' '}
                · Inspection: {inspectionRequiredLabel(vehicle.reservation_inspection_required)}
                · VAT: {vatApplicableLabel(vehicle.reservation_vat_applicable)}
                {vehicle.reservation_requester_name
                  ? ` · Requester: ${vehicle.reservation_requester_name}`
                  : ''}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_auto_auto]">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Reserve for customer</span>
              <SearchableSelect
                value={reserveCustomerId}
                onValueChange={setReserveCustomerId}
                options={customerOptions}
                placeholder="Select customer"
                searchPlaceholder="Search code, name, company, phone, email…"
                clearLabel="Select customer"
              />
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
            Or <Link href="/admin/inventory/receive" className="text-primary underline">receive stock (GRN)</Link> to set purchase cost from a supplier invoice.
            Ops can roll freight/duty into landed cost via <Link href="/admin/landed-cost" className="text-primary underline">landed-cost packs</Link>,
            or open <Link href="/admin/export-shipments" className="text-primary underline">export shipments</Link> for booking/BL.
          </p>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="workflow" forceMount className="space-y-4 data-[state=inactive]:hidden">
<Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ship className="h-5 w-5" />
            Operational lifecycle
          </CardTitle>
          <CardDescription>
            Recommended path: Auction → Yard → Port → Sold. Staff may only take the next recommended hop.
            Account admins can force a jump with a reason. Commercial availability stays separate and syncs to sold when you move into Sold.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {recommendedNext ? (
            <p className="text-sm text-muted-foreground">
              Next recommended: <span className="font-medium text-foreground">{lifecycleStageLabel(recommendedNext)}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No further recommended stage from Sold — any move needs an admin force override.</p>
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Move to stage</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={nextStage}
                onChange={(event) => {
                  const value = event.target.value as LifecycleStage;
                  setNextStage(value);
                  if (isRecommendedLifecycleTransition(currentStage, value)) setForceOverride(false);
                }}
              >
                {stageOptions.map((stage) => {
                  const recommended = isRecommendedLifecycleTransition(currentStage, stage.value);
                  return (
                    <option key={stage.value} value={stage.value}>
                      {stage.label}
                      {recommended ? ' (recommended)' : isAccountAdmin ? ' (admin force)' : ' (blocked for staff)'}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="flex items-end">
              <Button
                onClick={() => void transitionStage()}
                disabled={
                  transitioning ||
                  stageOptions.length === 0 ||
                  (jumpNeedsForce && (!isAccountAdmin || !forceOverride || !stageNotes.trim()))
                }
              >
                {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Transition
              </Button>
            </div>
          </div>
          {jumpNeedsForce ? (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
              {isAccountAdmin ? (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={forceOverride}
                    onChange={(event) => setForceOverride(event.target.checked)}
                  />
                  <span>
                    Force override (admin). Skips the recommended path. A reason in notes is required.
                  </span>
                </label>
              ) : (
                <p className="text-amber-900 dark:text-amber-100">
                  This jump is blocked for staff. Choose {lifecycleStageLabel(recommendedNext) || 'no further stage'} or ask an account admin to force with a reason.
                </p>
              )}
            </div>
          ) : null}
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">{jumpNeedsForce ? 'Override reason' : 'Transition notes'}</span>
            <Textarea
              value={stageNotes}
              onChange={(event) => setStageNotes(event.target.value)}
              rows={2}
              placeholder={jumpNeedsForce ? 'Required reason for skipping stages' : 'Optional reason or reference'}
              required={jumpNeedsForce}
            />
          </label>
        </CardContent>
      </Card>

<Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Record workflow event</CardTitle>
          <CardDescription>Log BL, inspection, shipping, and yard actions without changing the stage.</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
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
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Assignable requests</CardTitle>
          <CardDescription>
            Lifecycle events stay on this vehicle. Open a BL, inspection, or shipping ticket when work needs an owner and due date.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/admin/requests?vehicle=${id}`}>Open requests for this vehicle</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/admin/chat?vehicle=${id}`}>Open linked chat</Link>
          </Button>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="history" forceMount className="space-y-4 data-[state=inactive]:hidden">
<Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Activity history</CardTitle>
          <CardDescription>
            Newest first. Stage changes and workflow events are append-only. Attach private documents per event (internal-files).
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lifecycle events yet.</p>
          ) : (
            <ol className="space-y-3">
              {events.map((event) => {
                const files = attachmentsByEvent[event.id] || [];
                const forced =
                  event.metadata &&
                  typeof event.metadata === 'object' &&
                  !Array.isArray(event.metadata) &&
                  (event.metadata as { forced?: boolean }).forced === true;
                return (
                  <li key={event.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{lifecycleEventLabel(event.event_type)}</Badge>
                      {forced ? <Badge variant="secondary">Forced</Badge> : null}
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
                    {event.notes ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{event.notes}</p>
                    ) : null}
                    <div className="mt-3 space-y-2 border-t pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">Attachments</span>
                        <Label htmlFor={`lifecycle-files-${event.id}`} className="sr-only">
                          Attach files to event
                        </Label>
                        <Input
                          id={`lifecycle-files-${event.id}`}
                          type="file"
                          multiple
                          className="h-8 max-w-xs text-xs"
                          disabled={uploadingEventId === event.id}
                          onChange={(changeEvent) => {
                            void uploadEventFiles(event.id, changeEvent.target.files);
                            changeEvent.currentTarget.value = '';
                          }}
                        />
                        {uploadingEventId === event.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                      {files.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No files on this event.</p>
                      ) : (
                        <ul className="space-y-1">
                          {files.map((attachment) => (
                            <li
                              key={attachment.id}
                              className="flex flex-wrap items-center gap-2 text-sm"
                            >
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              <button
                                type="button"
                                className="text-left text-primary underline-offset-2 hover:underline"
                                onClick={() => void openAttachment(attachment)}
                              >
                                {attachment.file_name}
                              </button>
                              {attachment.size_bytes ? (
                                <span className="text-xs text-muted-foreground">
                                  {formatBytes(attachment.size_bytes)}
                                </span>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-7 px-2"
                                disabled={removingAttachmentId === attachment.id}
                                onClick={() => void removeAttachment(attachment)}
                              >
                                {removingAttachmentId === attachment.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                                <span className="sr-only">Remove</span>
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

'use client';

import { useState, useEffect, use, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Save,
  Loader2,
  ArrowLeft,
  Plus,
  X,
  Image as ImageIcon,
  Trash2,
  Upload,
  Star,
  Eye,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect, customerSelectOption } from '@/components/admin/searchable-select';
import { supabase } from '@/lib/supabase/client';
import { SUPPORTED_MANUFACTURERS } from '@/lib/manufacturer-logos';
import { compressCatalogImage } from '@/lib/catalog-image';
import { toast } from 'sonner';
import { STOCK_ORIGINS, stockOriginLabel } from '@/lib/stock';
import type { Category, PartCondition, PartCompatibility, PartPhoto, PartWithRelations, StockStatus } from '@/lib/types';
import { IncotermPriceFields, parseOptionalPrice } from '@/components/admin/incoterm-price-fields';
import { StockLinkedInvoices } from '@/components/admin/stock-linked-invoices';
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
import { requestPublicRevalidation } from '@/lib/revalidate-public';
import { buildPartIdentity } from '@/lib/part-identity';
import { useFinanceSettings } from '@/lib/use-finance-settings';

const statusClass: Record<StockStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  reserved: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sold: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
};

function parseTagList(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatTagList(values: string[] | null | undefined): string {
  return (values || []).join(', ');
}

export default function EditPartPage(props: { params: Promise<{ id: string }> }) {
  const financeSettings = useFinanceSettings();
  const params = use(props.params);
  const { id } = params;
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [part, setPart] = useState<PartWithRelations | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [photoActionId, setPhotoActionId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [oemNumber, setOemNumber] = useState('');
  const [manufacturerPartNumber, setManufacturerPartNumber] = useState('');
  const [interchangeNumbers, setInterchangeNumbers] = useState('');
  const [supersededPartNumbers, setSupersededPartNumbers] = useState('');
  const [exportMarkets, setExportMarkets] = useState('');
  const [condition, setCondition] = useState<PartCondition>('used');
  const [price, setPrice] = useState('');
  const [priceFob, setPriceFob] = useState('');
  const [priceCf, setPriceCf] = useState('');
  const [priceCif, setPriceCif] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [quantity, setQuantity] = useState('0');
  const [location, setLocation] = useState('');
  const [stockOrigin, setStockOrigin] = useState('dubai');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseCurrency, setPurchaseCurrency] = useState('AED');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [landedCost, setLandedCost] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: string; label: string }>>([]);
  const [description, setDescription] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [searchKeywords, setSearchKeywords] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [showPrice, setShowPrice] = useState(false);

  const [photos, setPhotos] = useState<PartPhoto[]>([]);
  const [compatRows, setCompatRows] = useState<Partial<PartCompatibility>[]>([]);

  const [reservePriceTerm, setReservePriceTerm] = useState<PriceTerm | ''>('fob');
  const [reserveShipmentTerm, setReserveShipmentTerm] = useState<ShipmentMode | ''>('dhl');
  const [reserveInspection, setReserveInspection] = useState<InspectionChoice | ''>('');
  const [reserveVat, setReserveVat] = useState<VatChoice | ''>('yes');
  const [reserveRequesterName, setReserveRequesterName] = useState('');
  const [reserveRequesterRole, setReserveRequesterRole] = useState<RequesterRole | ''>('admin');
  const [reserveEtd, setReserveEtd] = useState('');
  const [reserveEta, setReserveEta] = useState('');
  const [customers, setCustomers] = useState<
    Array<{
      id: string;
      customer_code: string;
      full_name: string;
      company_name: string | null;
      phone?: string | null;
      email?: string | null;
    }>
  >([]);
  const [reserveCustomerId, setReserveCustomerId] = useState('');
  const [reserveBusy, setReserveBusy] = useState(false);

  const hydratePart = useCallback(
    (
      p: PartWithRelations,
      profile: { role?: string | null; full_name?: string | null; email?: string | null } | null
    ) => {
      setPart(p);
      setName(p.name);
      setSlug(p.slug || '');
      setCategoryId(p.category_id || '');
      setBrand(p.brand || '');
      setPartNumber(p.part_number || '');
      setOemNumber(p.oem_number || '');
      setManufacturerPartNumber(p.manufacturer_part_number || '');
      setInterchangeNumbers(formatTagList(p.interchange_numbers));
      setSupersededPartNumbers(formatTagList(p.superseded_part_numbers));
      setExportMarkets(formatTagList(p.export_markets));
      setCondition(p.condition);
      setPrice(p.price?.toString() || '');
      setPriceFob(p.price_fob != null ? String(p.price_fob) : '');
      setPriceCf(p.price_cf != null ? String(p.price_cf) : '');
      setPriceCif(p.price_cif != null ? String(p.price_cif) : '');
      setCurrency(p.currency);
      setQuantity(p.quantity.toString());
      setLocation(p.location || '');
      setStockOrigin(p.stock_origin || 'dubai');
      setPurchasePrice(p.purchase_price != null ? String(p.purchase_price) : '');
      setPurchaseCurrency(p.purchase_currency || 'AED');
      setPurchaseDate(p.purchase_date || '');
      setLandedCost(p.landed_cost != null ? String(p.landed_cost) : '');
      setSupplierId(p.supplier_id || '');
      setDescription(p.description || '');
      setMetaTitle(p.meta_title || '');
      setMetaDescription(p.meta_description || '');
      setSearchKeywords(formatTagList(p.search_keywords));
      setIsPublished(p.is_published);
      setIsFeatured(p.is_featured);
      setShowPrice(p.show_price);
      setPhotos((p.part_photos || []).sort((a, b) => a.sort_order - b.sort_order));
      setCompatRows(
        (p.part_compatibility || []).length > 0
          ? (p.part_compatibility || []).map((c) => ({ ...c }))
          : [
              {
                make: '',
                model: '',
                variant: '',
                chassis_code: '',
                engine_code: '',
                year_from: undefined,
                year_to: undefined,
              },
            ]
      );
      setReservePriceTerm((p.reservation_price_term as PriceTerm) || 'fob');
      setReserveShipmentTerm((p.reservation_shipment_term as ShipmentMode) || 'dhl');
      setReserveInspection(boolToInspectionChoice(p.reservation_inspection_required));
      setReserveVat(boolToVatChoice(p.reservation_vat_applicable) || 'yes');
      const profileRole = profile?.role || null;
      if (p.stock_status === 'available' && !p.reservation_requester_name) {
        setReserveRequesterName(profileRequesterName(profile));
        setReserveRequesterRole(accountRoleToRequesterRole(profileRole));
      } else {
        setReserveRequesterName(p.reservation_requester_name || '');
        setReserveRequesterRole(
          (p.reservation_requester_role as RequesterRole) || accountRoleToRequesterRole(profileRole)
        );
      }
      setReserveEtd(p.reservation_etd || '');
      setReserveEta(p.reservation_eta || '');
      setReserveCustomerId(p.reserved_customer_id || '');
    },
    []
  );

  const load = useCallback(async () => {
    setFetching(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [catRes, partRes, supRes, custRes, profileRes] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase
        .from('parts')
        .select('*, categories(*), part_photos(*), part_compatibility(*)')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('suppliers').select('id,supplier_code,name').eq('is_active', true).order('name').limit(200),
      supabase
        .from('customers')
        .select('id,customer_code,full_name,company_name,phone,email')
        .order('full_name')
        .limit(500),
      user
        ? supabase.from('admin_profiles').select('role,full_name,email').eq('id', user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    setCategories((catRes.data || []) as Category[]);
    setSuppliers(
      (supRes.data || []).map((item) => ({ id: item.id, label: `${item.supplier_code} — ${item.name}` }))
    );
    setCustomers((custRes.data || []) as typeof customers);

    if (!partRes.data) {
      toast.error('Part not found.');
      router.push('/admin/parts');
      return;
    }

    hydratePart(partRes.data as unknown as PartWithRelations, profileRes.data);
    setFetching(false);
  }, [hydratePart, id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const customerOptions = useMemo(() => customers.map(customerSelectOption), [customers]);

  const addCompatRow = () => {
    setCompatRows((prev) => [
      ...prev,
      {
        make: '',
        model: '',
        variant: '',
        chassis_code: '',
        engine_code: '',
        year_from: undefined,
        year_to: undefined,
      },
    ]);
  };

  const removeCompatRow = (idx: number) => {
    setCompatRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCompatRow = (idx: number, field: string, value: string) => {
    setCompatRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        if (field === 'year_from' || field === 'year_to') {
          return { ...row, [field]: value ? parseInt(value, 10) : undefined };
        }
        return { ...row, [field]: value };
      })
    );
  };

  const handleSave = async () => {
    if (!part) return;
    if (!name.trim()) {
      toast.error('Part name is required.');
      return;
    }
    if (!slug.trim()) {
      toast.error('Slug is required.');
      return;
    }

    setLoading(true);

    const identity = buildPartIdentity({
      name, brand, part_number: partNumber, oem_number: oemNumber,
      manufacturer_part_number: manufacturerPartNumber, condition,
      compatibility: compatRows, search_keywords: parseTagList(searchKeywords),
    });
    const { error } = await supabase
      .from('parts')
      .update({
        name: name.trim(),
        slug: slug.trim(),
        category_id: categoryId || null,
        brand: brand.trim() || null,
        part_number: partNumber.trim() || null,
        oem_number: oemNumber.trim() || null,
        manufacturer_part_number: manufacturerPartNumber.trim() || null,
        interchange_numbers: parseTagList(interchangeNumbers),
        superseded_part_numbers: parseTagList(supersededPartNumbers),
        export_markets: parseTagList(exportMarkets),
        condition,
        price: price ? parseFloat(price) : null,
        price_fob: parseOptionalPrice(priceFob),
        price_cf: parseOptionalPrice(priceCf),
        price_cif: parseOptionalPrice(priceCif),
        currency,
        quantity: parseInt(quantity, 10) || 0,
        location: location.trim() || null,
        stock_origin: stockOrigin,
        purchase_price: purchasePrice === '' ? null : parseFloat(purchasePrice),
        purchase_currency: purchaseCurrency.trim().toUpperCase() || 'AED',
        purchase_date: purchaseDate || null,
        landed_cost: landedCost === '' ? null : parseFloat(landedCost),
        supplier_id: supplierId || null,
        description: description.trim() || null,
        meta_title: metaTitle.trim() || identity.meta_title,
        meta_description: metaDescription.trim() || identity.meta_description,
        search_keywords: identity.search_keywords,
        is_published: isPublished,
        is_featured: isFeatured,
        show_price: showPrice,
      })
      .eq('id', part.id);

    if (error) {
      setLoading(false);
      toast.error('Failed to update part: ' + error.message);
      return;
    }

    await supabase.from('part_compatibility').delete().eq('part_id', part.id);
    const validCompat = compatRows.filter((r) => r.make && r.model);
    if (validCompat.length > 0) {
      const compatData = validCompat.map((r) => ({
        part_id: part.id,
        make: r.make!,
        model: r.model!,
        variant: r.variant || null,
        chassis_code: r.chassis_code || null,
        engine_code: r.engine_code || null,
        year_from: r.year_from || null,
        year_to: r.year_to || null,
      }));
      await supabase.from('part_compatibility').insert(compatData);
    }

    setLoading(false);
    toast.success('Part saved successfully.');
    requestPublicRevalidation('part', [part?.slug, slug.trim()]);
    router.push('/admin/parts');
  };

  const reservePart = async () => {
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
    const { error } = await supabase.rpc('reserve_part_stock', {
      p_part_id: id,
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
    toast.success('Part reserved and unpublished from the website.');
    requestPublicRevalidation('part', [part?.slug]);
    await load();
  };

  const releaseReservation = async (republish = false) => {
    setReserveBusy(true);
    const { error } = await supabase.rpc('release_part_reservation', {
      p_part_id: id,
      p_republish: republish,
    });
    setReserveBusy(false);
    if (error) return toast.error(error.message);
    toast.success(republish ? 'Reservation released and published.' : 'Reservation released.');
    requestPublicRevalidation('part', [part?.slug]);
    await load();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !part) return;

    setUploading(true);
    setUploadProgress({ completed: 0, total: files.length });
    const partCode = part.part_code;
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const optimized = await compressCatalogImage(
        file,
        `${brand || 'part'}-${partNumber || partCode}-${photos.length + i + 1}`
      );
      const fileName = `${partCode}/${Date.now()}-${optimized.file.name}`;

      const { error: upErr } = await supabase.storage
        .from('part-images')
        .upload(fileName, optimized.file, { contentType: 'image/webp', cacheControl: '31536000' });

      if (upErr) {
        toast.error(`Failed to upload ${file.name}`);
        setUploadProgress((progress) => ({ ...progress, completed: progress.completed + 1 }));
        continue;
      }

      const { data: photoData, error: photoErr } = await supabase
        .from('part_photos')
        .insert({
          part_id: part.id,
          storage_path: fileName,
          is_cover: photos.length === 0 && i === 0,
          sort_order: photos.length + i,
        })
        .select('id, part_id, storage_path, is_cover, sort_order, created_at')
        .single();

      if (!photoErr && photoData) {
        setPhotos((prev) => [...prev, photoData as PartPhoto]);
        successCount++;
      }
      setUploadProgress((progress) => ({ ...progress, completed: progress.completed + 1 }));
    }

    setUploading(false);
    if (successCount > 0) {
      toast.success(`${successCount} photo(s) uploaded.`);
      requestPublicRevalidation('part', [part?.slug]);
    }
    e.target.value = '';
  };

  const setCoverPhoto = async (photoId: string) => {
    if (!part) return;
    setPhotoActionId(photoId);
    const { error: clearError } = await supabase.from('part_photos').update({ is_cover: false }).eq('part_id', part.id);
    const { error: coverError } = await supabase.from('part_photos').update({ is_cover: true }).eq('id', photoId);
    setPhotoActionId(null);
    if (clearError || coverError) {
      toast.error('Could not update the cover photo.');
      return;
    }
    setPhotos((prev) => prev.map((p) => ({ ...p, is_cover: p.id === photoId })));
    toast.success('Cover photo updated.');
    requestPublicRevalidation('part', [part?.slug]);
  };

  const deletePhoto = async (photoId: string, storagePath: string) => {
    if (!part) return;
    if (!window.confirm('Delete this photo permanently?')) return;
    setPhotoActionId(photoId);
    const deletedPhoto = photos.find((photo) => photo.id === photoId);
    const { error: storageError } = await supabase.storage.from('part-images').remove([storagePath]);
    const { error: databaseError } = await supabase.from('part_photos').delete().eq('id', photoId);
    if (storageError || databaseError) {
      setPhotoActionId(null);
      toast.error('Could not delete the photo.');
      return;
    }
    const remainingPhotos = photos.filter((photo) => photo.id !== photoId);
    setPhotos(remainingPhotos);
    if (deletedPhoto?.is_cover && remainingPhotos[0]) {
      const replacement = remainingPhotos[0];
      const { error: replacementError } = await supabase
        .from('part_photos')
        .update({ is_cover: true })
        .eq('id', replacement.id);
      if (!replacementError) {
        setPhotos((current) => current.map((photo) => ({ ...photo, is_cover: photo.id === replacement.id })));
      }
    }
    setPhotoActionId(null);
    toast.success('Photo deleted.');
    requestPublicRevalidation('part', [part?.slug]);
  };

  const getPhotoUrl = (path: string) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    return `${supabaseUrl}/storage/v1/object/public/part-images/${path}`;
  };

  if (fetching || !part) {
    return (
      <div className="max-w-3xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  const stockStatus = (part.stock_status || 'available') as StockStatus;
  const reservationLocked = stockStatus === 'reserved' || stockStatus === 'sold';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
            <Link href="/admin/parts">
              <ArrowLeft className="h-4 w-4" />
              Back to parts
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Edit Part</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{part.part_code}</span>
              {' · '}
              {stockOriginLabel(part.stock_origin)}
              {part.categories?.name ? ` · ${part.categories.name}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={statusClass[stockStatus]}>{stockStatus}</Badge>
            {part.is_published ? (
              <Badge variant="outline">Public</Badge>
            ) : (
              <Badge variant="secondary">Draft</Badge>
            )}
            {part.show_price ? <Badge variant="outline">Price shown</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/parts/${part.slug}`} target="_blank">
              <Eye className="h-4 w-4" />
              View public
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/reservations?part=${part.id}`}>
              <ExternalLink className="h-4 w-4" />
              Sales reservation
            </Link>
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Photos */}
        <Card id="photos" className="scroll-mt-24 overflow-hidden">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">Photos</CardTitle>
                <CardDescription>
                  {photos.length} {photos.length === 1 ? 'image' : 'images'} · Choose one cover image for listings
                </CardDescription>
              </div>
              <label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
                <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
                  <span>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading
                      ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}`
                      : 'Upload Photos'}
                  </span>
                </Button>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/30 px-4 py-5 text-center transition-colors hover:border-foreground/30 hover:bg-secondary/60">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
              <span>
                <span className="block text-sm font-semibold">
                  {uploading ? 'Uploading your images…' : 'Select multiple product photos'}
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className={`group overflow-hidden rounded-xl border bg-secondary/30 ${
                      photo.is_cover ? 'border-accent ring-2 ring-accent/15' : 'border-border'
                    }`}
                  >
                    <div className="relative aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getPhotoUrl(photo.storage_path)}
                        alt={`${name || 'Part'} photo ${index + 1}`}
                        className="h-full w-full object-contain p-2"
                      />
                      {photo.is_cover && (
                        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-[11px] font-semibold text-accent-foreground shadow-sm">
                          <Star className="h-3 w-3 fill-current" /> Cover
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border p-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 flex-1 justify-start px-2 text-xs"
                        disabled={photo.is_cover || photoActionId === photo.id}
                        onClick={() => setCoverPhoto(photo.id)}
                      >
                        {photoActionId === photo.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Star className="h-3.5 w-3.5" />
                        )}
                        {photo.is_cover ? 'Cover image' : 'Make cover'}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={photoActionId === photo.id}
                        onClick={() => deletePhoto(photo.id, photo.storage_path)}
                        aria-label={`Delete photo ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {part.id ? <StockLinkedInvoices partId={part.id} /> : null}

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Part Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="part-slug">URL slug *</Label>
              <Input
                id="part-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Public URL: /parts/{slug || '…'}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Brand</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_MANUFACTURERS.map((manufacturer) => (
                      <SelectItem key={manufacturer} value={manufacturer}>
                        {manufacturer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Identification */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Identification</CardTitle>
            <CardDescription>OEM, manufacturer, and cross-reference numbers for buyer search.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Part Number</Label>
              <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>OEM Number</Label>
              <Input value={oemNumber} onChange={(e) => setOemNumber(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Manufacturer part number</Label>
              <Input
                value={manufacturerPartNumber}
                onChange={(e) => setManufacturerPartNumber(e.target.value)}
                placeholder="Official MPN if different from part number"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Interchange numbers</Label>
              <Input
                value={interchangeNumbers}
                onChange={(e) => setInterchangeNumbers(e.target.value)}
                placeholder="Comma-separated cross-brand / aftermarket numbers"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Superseded part numbers</Label>
              <Input
                value={supersededPartNumbers}
                onChange={(e) => setSupersededPartNumbers(e.target.value)}
                placeholder="Comma-separated older numbers this replaces"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Export markets</Label>
              <Input
                value={exportMarkets}
                onChange={(e) => setExportMarkets(e.target.value)}
                placeholder="e.g. UAE, Kenya, Tanzania"
              />
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Compatibility */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">Vehicle Compatibility</CardTitle>
                <CardDescription>Add compatible vehicles for this part</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addCompatRow}>
                <Plus className="h-4 w-4" /> Add Row
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {compatRows.map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-2 items-end gap-2 rounded-md border border-border p-3 sm:grid-cols-4 lg:grid-cols-8"
              >
                <div className="space-y-1">
                  <Label className="text-xs">Make</Label>
                  <Input
                    value={row.make || ''}
                    onChange={(e) => updateCompatRow(idx, 'make', e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Model</Label>
                  <Input
                    value={row.model || ''}
                    onChange={(e) => updateCompatRow(idx, 'model', e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Variant</Label>
                  <Input
                    value={row.variant || ''}
                    onChange={(e) => updateCompatRow(idx, 'variant', e.target.value)}
                    className="h-9 text-sm"
                    placeholder="G / S"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Chassis</Label>
                  <Input
                    value={row.chassis_code || ''}
                    onChange={(e) => updateCompatRow(idx, 'chassis_code', e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Engine</Label>
                  <Input
                    value={row.engine_code || ''}
                    onChange={(e) => updateCompatRow(idx, 'engine_code', e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year From</Label>
                  <Input
                    type="number"
                    value={row.year_from ?? ''}
                    onChange={(e) => updateCompatRow(idx, 'year_from', e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year To</Label>
                  <Input
                    type="number"
                    value={row.year_to ?? ''}
                    onChange={(e) => updateCompatRow(idx, 'year_to', e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                {compatRows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => removeCompatRow(idx)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Inventory & sell pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inventory &amp; Pricing</CardTitle>
            <CardDescription>Stock location, quantity, and public sell quotes (FOB / C&amp;F / CIF).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select value={condition} onValueChange={(v) => setCondition(v as PartCondition)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                    <SelectItem value="refurbished">Refurbished</SelectItem>
                    <SelectItem value="for-parts">For Parts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Stock location</Label>
                <select
                  value={stockOrigin}
                  onChange={(e) => setStockOrigin(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {STOCK_ORIGINS.map((origin) => (
                    <option key={origin.value} value={origin.value}>
                      {origin.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Price</Label>
                <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set([...financeSettings.enabled_currencies, currency])).map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2 pb-2">
                  <Switch checked={showPrice} onCheckedChange={setShowPrice} />
                  <Label>Show price publicly</Label>
                </div>
              </div>
            </div>
            <IncotermPriceFields
              currency={currency}
              values={{ priceFob, priceCf, priceCif }}
              onChange={(patch) => {
                if (patch.priceFob !== undefined) setPriceFob(patch.priceFob);
                if (patch.priceCf !== undefined) setPriceCf(patch.priceCf);
                if (patch.priceCif !== undefined) setPriceCif(patch.priceCif);
              }}
            />
          </CardContent>
        </Card>

        {/* Purchase cost & reservation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Purchase cost &amp; reservation</CardTitle>
            <CardDescription>
              Cost from receive-stock (GRN) or manual entry. Reserve to hold stock and hide it from the public catalog.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Purchase price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Purchase currency</Label>
                <Input
                  value={purchaseCurrency}
                  onChange={(e) => setPurchaseCurrency(e.target.value)}
                  maxLength={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Purchase date</Label>
                <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Landed cost</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={landedCost}
                  onChange={(e) => setLandedCost(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Supplier</Label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">No supplier</option>
                  {suppliers.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Ops can allocate freight/duty via{' '}
              <Link href="/admin/landed-cost" className="text-primary underline">
                landed-cost packs
              </Link>{' '}
              or{' '}
              <Link href="/admin/inventory/receive" className="text-primary underline">
                receive stock (GRN)
              </Link>{' '}
              for purchase cost.
            </p>

            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Price term</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={reservePriceTerm}
                  disabled={reservationLocked}
                  onChange={(e) => setReservePriceTerm(e.target.value as PriceTerm)}
                >
                  {PRICE_TERMS.map((term) => (
                    <option key={term} value={term}>
                      {PRICE_TERM_LABELS[term]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Shipment term</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={reserveShipmentTerm}
                  disabled={reservationLocked}
                  onChange={(e) => setReserveShipmentTerm(e.target.value as ShipmentMode)}
                >
                  {SHIPMENT_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {SHIPMENT_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Inspection</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={reserveInspection}
                  disabled={reservationLocked}
                  onChange={(e) => setReserveInspection(e.target.value as InspectionChoice | '')}
                >
                  <option value="" disabled>
                    Select Yes or No
                  </option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>VAT</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={reserveVat}
                  disabled={reservationLocked}
                  onChange={(e) => setReserveVat(e.target.value as VatChoice | '')}
                >
                  <option value="yes">Yes — apply VAT</option>
                  <option value="no">No — exclude VAT</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Requester name</Label>
                <Input
                  value={reserveRequesterName}
                  disabled={reservationLocked}
                  onChange={(e) => setReserveRequesterName(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label>Requester role</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={reserveRequesterRole}
                  disabled={reservationLocked}
                  onChange={(e) => setReserveRequesterRole(e.target.value as RequesterRole)}
                >
                  {REQUESTER_ROLES.map((item) => (
                    <option key={item} value={item}>
                      {REQUESTER_ROLE_LABELS[item]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>ETD</Label>
                <Input
                  type="date"
                  value={reserveEtd}
                  disabled={reservationLocked}
                  onChange={(e) => setReserveEtd(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>ETA</Label>
                <Input
                  type="date"
                  value={reserveEta}
                  disabled={reservationLocked}
                  onChange={(e) => setReserveEta(e.target.value)}
                />
              </div>
              {stockStatus === 'reserved' ? (
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  Active reservation:{' '}
                  {part.reservation_price_term
                    ? PRICE_TERM_LABELS[part.reservation_price_term]
                    : 'no price term'}{' '}
                  ·{' '}
                  {part.reservation_shipment_term
                    ? SHIPMENT_MODE_LABELS[part.reservation_shipment_term]
                    : 'no shipment term'}{' '}
                  · Inspection: {inspectionRequiredLabel(part.reservation_inspection_required)} · VAT:{' '}
                  {vatApplicableLabel(part.reservation_vat_applicable)}
                  {part.reservation_requester_name
                    ? ` · Requester: ${part.reservation_requester_name}`
                    : ''}
                  {part.reservation_etd ? ` · ETD ${part.reservation_etd}` : ''}
                  {part.reservation_eta ? ` · ETA ${part.reservation_eta}` : ''}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_auto_auto]">
              <div className="space-y-2">
                <Label>Reserve for customer</Label>
                <SearchableSelect
                  value={reserveCustomerId}
                  onValueChange={setReserveCustomerId}
                  options={customerOptions}
                  placeholder="Select customer"
                  searchPlaceholder="Search code, name, company, phone, email…"
                  clearLabel="Select customer"
                  disabled={reservationLocked}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  disabled={reserveBusy || stockStatus === 'sold' || stockStatus === 'reserved'}
                  onClick={() => void reservePart()}
                >
                  {reserveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Reserve
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={reserveBusy || stockStatus !== 'reserved'}
                  onClick={() => void releaseReservation(false)}
                >
                  Release
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={reserveBusy || stockStatus !== 'reserved'}
                  onClick={() => void releaseReservation(true)}
                >
                  Release + publish
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
          </CardContent>
        </Card>

        {/* SEO */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">SEO</CardTitle>
            <CardDescription>Optional overrides for search engines and social previews.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meta-title">Meta title</Label>
              <Input
                id="meta-title"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder={name || 'SEO page title'}
              />
              <p className="text-xs text-muted-foreground">{metaTitle.length}/60 characters</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-desc">Meta description</Label>
              <Textarea
                id="meta-desc"
                rows={2}
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="Short description for search engines…"
              />
              <p className="text-xs text-muted-foreground">{metaDescription.length}/160 characters</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="search-keywords">Search keywords</Label>
              <Input
                id="search-keywords"
                value={searchKeywords}
                onChange={(e) => setSearchKeywords(e.target.value)}
                placeholder="Comma-separated keywords for catalog search"
              />
            </div>
          </CardContent>
        </Card>

        {/* Publishing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Publishing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
              <Label>Publish this part (visible to customers)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
              <Label>Boost in home rotation + featured badge</Label>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => router.push('/admin/parts')}>
            Cancel
          </Button>
          <Button disabled={loading} onClick={() => handleSave()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

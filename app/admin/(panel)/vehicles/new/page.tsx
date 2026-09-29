'use client';

import { Suspense, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, Loader2, ArrowLeft, Plus, X, Upload, Star, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { compressCatalogImage } from '@/lib/catalog-image';
import { isAuctionSheetFilename } from '@/lib/vehicle-photos';
import { toast } from 'sonner';
import { STOCK_ORIGINS, defaultStockPoolForOrigin, type StockPool } from '@/lib/stock';
import { IncotermPriceFields, parseOptionalPrice } from '@/components/admin/incoterm-price-fields';
import { VehicleDestinationMarketsField } from '@/components/admin/vehicle-destination-markets-field';
import {
  EQUIPMENT_CATEGORIES,
  isMachineryClass,
  isVehicleClass,
  VEHICLE_CLASSES,
  type VehicleClass,
} from '@/lib/vehicle-class';

interface PendingPhoto {
  file: File;
  previewUrl: string;
}

export default function AddVehiclePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <AddVehiclePageInner />
    </Suspense>
  );
}

function AddVehiclePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialClass = isVehicleClass(searchParams.get('class'))
    ? (searchParams.get('class') as VehicleClass)
    : 'passenger';
  const initialAuction = searchParams.get('pool') === 'auction';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [year, setYear] = useState('');
  const [stockNumber, setStockNumber] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [stockOrigin, setStockOrigin] = useState(initialAuction ? 'japan' : 'dubai');
  const [stockPool, setStockPool] = useState<StockPool>(
    initialAuction ? 'auction_third_party' : 'owned'
  );
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>(initialClass);
  const [equipmentCategory, setEquipmentCategory] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [chassisCode, setChassisCode] = useState('');
  const [engineCode, setEngineCode] = useState('');
  const [transmission, setTransmission] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [mileage, setMileage] = useState('');
  const [color, setColor] = useState('');
  const [price, setPrice] = useState('');
  const [priceFob, setPriceFob] = useState('');
  const [priceCf, setPriceCf] = useState('');
  const [priceCif, setPriceCif] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [showPrice, setShowPrice] = useState(false);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [destinationMarkets, setDestinationMarkets] = useState<string[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);

  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const machineryForm = isMachineryClass(vehicleClass);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newPhotos: PendingPhoto[] = [];
    for (let i = 0; i < files.length; i++) {
      newPhotos.push({ file: files[i], previewUrl: URL.createObjectURL(files[i]) });
    }
    setPendingPhotos((prev) => [...prev, ...newPhotos]);
    e.target.value = '';
  };

  const removePhoto = (idx: number) => {
    setPendingPhotos((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      URL.revokeObjectURL(prev[idx].previewUrl);
      if (coverIndex >= updated.length) setCoverIndex(Math.max(0, updated.length - 1));
      if (idx < coverIndex) setCoverIndex((c) => c - 1);
      return updated;
    });
  };

  const normalizeModelSpec = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

  const generateSlug = (text: string) => {
    return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').trim();
  };

  const handleSubmit = async (e: React.FormEvent, publish: boolean) => {
    e.preventDefault();

    if (!title.trim() || !make.trim() || !model.trim()) {
      toast.error('Title, make, and model are required.');
      return;
    }

    setLoading(true);

    const slug = generateSlug(title + '-' + Date.now().toString().slice(-6));
    const { data: modelSpec } = await supabase
      .from('vehicle_model_specs')
      .select('volume_m3')
      .eq('normalized_make', normalizeModelSpec(make))
      .eq('normalized_model', normalizeModelSpec(model))
      .maybeSingle();

    const { data: newVehicle, error } = await supabase
      .from('vehicles')
      .insert({
        title: title.trim(),
        slug,
        make: make.trim(),
        model: model.trim(),
        volume_m3: modelSpec?.volume_m3 ?? null,
        variant: variant.trim() || null,
        year: year ? parseInt(year, 10) : null,
        stock_number: stockNumber.trim() || null,
        chassis_number: chassisNumber.trim() || null,
        stock_origin: stockOrigin,
        stock_pool: stockPool,
        stock_status: 'available',
        lifecycle_stage: 'unassigned',
        vehicle_class: vehicleClass,
        equipment_category: machineryForm ? (equipmentCategory.trim() || null) : null,
        operating_hours: machineryForm && operatingHours ? parseInt(operatingHours, 10) : null,
        chassis_code: chassisCode.trim() || null,
        engine_code: engineCode.trim() || null,
        transmission: transmission.trim() || null,
        fuel_type: fuelType.trim() || null,
        mileage: mileage ? parseInt(mileage, 10) : null,
        color: color.trim() || null,
        price: price ? parseFloat(price) : null,
        price_fob: parseOptionalPrice(priceFob),
        price_cf: parseOptionalPrice(priceCf),
        price_cif: parseOptionalPrice(priceCif),
        currency,
        show_price: showPrice,
        description: description.trim() || null,
        location: location.trim() || null,
        destination_markets: destinationMarkets,
        is_published: publish,
        is_featured: isFeatured,
      })
      .select('id')
      .single();

    if (error) {
      setLoading(false);
      toast.error('Failed to create vehicle: ' + error.message);
      return;
    }

    const vehicleId = newVehicle.id;

    if (pendingPhotos.length > 0) {
      let uploadSuccessCount = 0;
      for (let i = 0; i < pendingPhotos.length; i++) {
        const photo = pendingPhotos[i];
        const auctionSheet = isAuctionSheetFilename(photo.file.name);
        const optimized = await compressCatalogImage(
          photo.file,
          `${make}-${model}-${chassisCode || slug}-${auctionSheet ? 'auction-sheet' : i + 1}`
        );
        const fileName = `${slug}/${Date.now()}-${optimized.file.name}`;

        const { error: upErr } = await supabase.storage
          .from('vehicle-images')
          .upload(fileName, optimized.file, { contentType: 'image/webp', cacheControl: '31536000' });

        if (upErr) {
          toast.error(`Failed to upload photo ${i + 1}`);
          continue;
        }

        const { error: photoErr } = await supabase
          .from('vehicle_photos')
          .insert({
            vehicle_id: vehicleId,
            storage_path: fileName,
            is_cover: !auctionSheet && i === coverIndex,
            is_auction_sheet: auctionSheet,
            sort_order: i,
          });

        if (!photoErr) uploadSuccessCount++;
      }
      if (uploadSuccessCount > 0) {
        toast.success(`${uploadSuccessCount} photo(s) uploaded.`);
      }
    }

    pendingPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));

    setLoading(false);
    toast.success(publish ? 'Vehicle published successfully.' : 'Draft saved successfully.');
    router.push(`/admin/vehicles/${vehicleId}`);
  };

  const backHref = stockPool === 'auction_third_party' ? '/admin/auction-stock' : '/admin/vehicles';
  const pageTitle =
    stockPool === 'auction_third_party'
      ? machineryForm
        ? 'Add auction machinery / truck'
        : 'Add auction stock'
      : machineryForm
        ? 'Add machinery / truck'
        : 'Add New Vehicle';
  const pageSubtitle =
    stockPool === 'auction_third_party'
      ? 'Third-party auction / yard listing — transfer to owned inventory when purchased'
      : machineryForm
        ? 'Excavators, loaders, trucks, and heavy equipment for the public machinery catalog'
        : 'Fill in the vehicle details below';

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">{pageSubtitle}</p>
        </div>
      </div>

      <form className="space-y-6">
        {/* Photos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Photos</CardTitle>
                <CardDescription>Upload now or add and manage photos later on the vehicle detail page</CardDescription>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Select Photos
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {pendingPhotos.length === 0 ? (
              <div
                className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-border py-10 text-center transition-colors hover:border-foreground/30"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">Click to select photos</p>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP — multiple files allowed</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {pendingPhotos.map((photo, idx) => (
                  <div key={idx} className="group relative overflow-hidden rounded-md border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.previewUrl} alt={`Preview ${idx + 1}`} className="aspect-square w-full object-cover" />
                    {idx === coverIndex && (
                      <div className="absolute top-1 left-1 rounded bg-foreground px-1.5 py-0.5 text-xs font-medium text-background">
                        Cover
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      {idx !== coverIndex && (
                        <Button type="button" size="icon" variant="secondary" className="h-8 w-8" onClick={() => setCoverIndex(idx)} title="Set as cover">
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button type="button" size="icon" variant="destructive" className="h-8 w-8" onClick={() => removePhoto(idx)} title="Remove">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  <Plus className="h-6 w-6" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vehicle-title">Title *</Label>
              <Input
                id="vehicle-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder={machineryForm ? 'e.g. Komatsu PC200-8 Excavator 2015' : 'e.g. Toyota Aqua 2018'}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vehicle-class">Inventory class *</Label>
                <select
                  id="vehicle-class"
                  value={vehicleClass}
                  onChange={(e) => {
                    const next = e.target.value as VehicleClass;
                    setVehicleClass(next);
                    if (!isMachineryClass(next)) {
                      setEquipmentCategory('');
                      setOperatingHours('');
                    }
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {VEHICLE_CLASSES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              {machineryForm ? (
                <div className="space-y-2">
                  <Label htmlFor="equipment-category">Equipment type</Label>
                  <select
                    id="equipment-category"
                    value={equipmentCategory}
                    onChange={(e) => setEquipmentCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select type</option>
                    {EQUIPMENT_CATEGORIES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="vehicle-make">Make *</Label>
                <Input id="vehicle-make" value={make} onChange={(e) => setMake(e.target.value)} required placeholder={machineryForm ? 'Komatsu / Caterpillar / Isuzu' : 'Toyota'} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle-model">Model *</Label>
                <Input id="vehicle-model" value={model} onChange={(e) => setModel(e.target.value)} required placeholder={machineryForm ? 'PC200-8' : 'Aqua'} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle-variant">Variant</Label>
                <Input id="vehicle-variant" value={variant} onChange={(e) => setVariant(e.target.value)} placeholder={machineryForm ? 'Long arm / Standard' : 'S, G, Limited'} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Specifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Specifications</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vehicle-year">Year</Label>
              <Input id="vehicle-year" type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2018" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-color">Color</Label>
              <Input id="vehicle-color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="White" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-transmission">Transmission</Label>
              <Input id="vehicle-transmission" value={transmission} onChange={(e) => setTransmission(e.target.value)} placeholder="Automatic / Manual" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-fuel">Fuel Type</Label>
              <Input id="vehicle-fuel" value={fuelType} onChange={(e) => setFuelType(e.target.value)} placeholder="Petrol / Hybrid / Diesel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-mileage">{machineryForm ? 'Mileage (km, optional)' : 'Mileage (km)'}</Label>
              <Input id="vehicle-mileage" type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="50000" />
            </div>
            {machineryForm ? (
              <div className="space-y-2">
                <Label htmlFor="vehicle-hours">Operating hours</Label>
                <Input id="vehicle-hours" type="number" value={operatingHours} onChange={(e) => setOperatingHours(e.target.value)} placeholder="6500" />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="vehicle-location">Location</Label>
              <Input id="vehicle-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Showroom / Warehouse" />
            </div>
            <VehicleDestinationMarketsField value={destinationMarkets} onChange={setDestinationMarkets} />
            <div className="space-y-2">
              <Label htmlFor="vehicle-stock-number">Stock / reference number</Label>
              <Input id="vehicle-stock-number" value={stockNumber} onChange={(e) => setStockNumber(e.target.value.toUpperCase())} placeholder="ANS-V-000001" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-chassis-number">Full chassis / VIN</Label>
              <Input id="vehicle-chassis-number" value={chassisNumber} onChange={(e) => setChassisNumber(e.target.value.toUpperCase())} placeholder="NHP10-1234567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-stock-origin">Stock location</Label>
              <select
                id="vehicle-stock-origin"
                value={stockOrigin}
                onChange={(e) => {
                  const next = e.target.value;
                  setStockOrigin(next);
                  if (initialAuction) setStockPool(defaultStockPoolForOrigin(next));
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {STOCK_ORIGINS.map((origin) => (
                  <option key={origin.value} value={origin.value}>
                    {origin.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-stock-pool">Stock pool</Label>
              <select
                id="vehicle-stock-pool"
                value={stockPool}
                onChange={(e) => setStockPool(e.target.value as StockPool)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="owned">Owned inventory (Vehicles)</option>
                <option value="auction_third_party">Auction stock (third-party)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-chassis">Chassis Code</Label>
              <Input id="vehicle-chassis" value={chassisCode} onChange={(e) => setChassisCode(e.target.value)} placeholder="NHP10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-engine">Engine Code</Label>
              <Input id="vehicle-engine" value={engineCode} onChange={(e) => setEngineCode(e.target.value)} placeholder="1NZ-FXE" />
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vehicle-price">Price</Label>
                <Input id="vehicle-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle-currency">Currency</Label>
                <select
                  id="vehicle-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="JPY">JPY</option>
                  <option value="AED">AED</option>
                  <option value="PKR">PKR</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="show-price" checked={showPrice} onCheckedChange={setShowPrice} />
              <Label htmlFor="show-price">Show price publicly</Label>
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

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the vehicle, its condition, history, and any notable details..." />
          </CardContent>
        </Card>

        {/* Publishing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Publishing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch id="is-published" checked={isPublished} onCheckedChange={setIsPublished} />
              <Label htmlFor="is-published">Publish this vehicle (visible to customers)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="is-featured" checked={isFeatured} onCheckedChange={setIsFeatured} />
              <Label htmlFor="is-featured">Boost in home rotation + featured badge</Label>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.push(backHref)}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" disabled={loading} onClick={(e) => handleSubmit(e as unknown as React.FormEvent, false)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Draft
          </Button>
          <Button type="button" disabled={loading} onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Publish {machineryForm ? 'Listing' : 'Vehicle'}
          </Button>
        </div>
      </form>
    </div>
  );
}

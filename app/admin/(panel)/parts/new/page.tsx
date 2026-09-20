'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2, ArrowLeft, Plus, X, Upload, Star, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { SUPPORTED_MANUFACTURERS } from '@/lib/manufacturer-logos';
import { compressCatalogImage } from '@/lib/catalog-image';
import { toast } from 'sonner';
import { STOCK_ORIGINS } from '@/lib/stock';
import type { Category, PartCondition, PartCompatibility } from '@/lib/types';
import { IncotermPriceFields, parseOptionalPrice } from '@/components/admin/incoterm-price-fields';

interface PendingPhoto {
  file: File;
  previewUrl: string;
}

export default function AddPartPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [oemNumber, setOemNumber] = useState('');
  const [condition, setCondition] = useState<PartCondition>('used');
  const [price, setPrice] = useState('');
  const [priceFob, setPriceFob] = useState('');
  const [priceCf, setPriceCf] = useState('');
  const [priceCif, setPriceCif] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [quantity, setQuantity] = useState('0');
  const [location, setLocation] = useState('');
  const [stockOrigin, setStockOrigin] = useState('dubai');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [showPrice, setShowPrice] = useState(false);

  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);

  const [compatRows, setCompatRows] = useState<Partial<PartCompatibility>[]>([
    { make: '', model: '', variant: '', chassis_code: '', engine_code: '', year_from: undefined, year_to: undefined },
  ]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('categories').select('*').order('sort_order');
      setCategories((data || []) as Category[]);
      setFetching(false);
    })();
  }, []);

  const addCompatRow = () => {
    setCompatRows((prev) => [...prev, { make: '', model: '', variant: '', chassis_code: '', engine_code: '', year_from: undefined, year_to: undefined }]);
  };

  const removeCompatRow = (idx: number) => {
    setCompatRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCompatRow = (idx: number, field: string, value: string) => {
    setCompatRows((prev) => prev.map((row, i) => {
      if (i !== idx) return row;
      if (field === 'year_from' || field === 'year_to') {
        return { ...row, [field]: value ? parseInt(value, 10) : undefined };
      }
      return { ...row, [field]: value };
    }));
  };

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

  const moveCover = (idx: number) => {
    setCoverIndex(idx);
  };

  const generateSlug = (text: string) => {
    return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').trim();
  };

  const handleSubmit = async (e: React.FormEvent, publish: boolean) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Part name is required.');
      return;
    }

    setLoading(true);

    const slug = generateSlug(name + '-' + Date.now().toString().slice(-6));

    const { count } = await supabase.from('parts').select('id', { count: 'exact', head: true });
    const partCode = `ANS-P-${String((count || 0) + 1).padStart(6, '0')}`;

    const { data: newPart, error } = await supabase
      .from('parts')
      .insert({
        part_code: partCode,
        name: name.trim(),
        slug,
        category_id: categoryId || null,
        brand: brand.trim() || null,
        part_number: partNumber.trim() || null,
        oem_number: oemNumber.trim() || null,
        condition,
        price: price ? parseFloat(price) : null,
        price_fob: parseOptionalPrice(priceFob),
        price_cf: parseOptionalPrice(priceCf),
        price_cif: parseOptionalPrice(priceCif),
        currency,
        quantity: parseInt(quantity, 10) || 0,
        location: location.trim() || null,
        stock_origin: stockOrigin,
        stock_status: 'available',
        description: description.trim() || null,
        is_published: publish,
        is_featured: isFeatured,
        show_price: showPrice,
      })
      .select('id')
      .single();

    if (error) {
      setLoading(false);
      toast.error('Failed to create part: ' + error.message);
      return;
    }

    const partId = newPart.id;

    // Upload photos
    if (pendingPhotos.length > 0) {
      let uploadSuccessCount = 0;
      for (let i = 0; i < pendingPhotos.length; i++) {
        const photo = pendingPhotos[i];
        const optimized = await compressCatalogImage(photo.file, `${brand || 'part'}-${partNumber || partCode}-${i + 1}`);
        const fileName = `${partCode}/${Date.now()}-${optimized.file.name}`;

        const { error: upErr } = await supabase.storage
          .from('part-images')
          .upload(fileName, optimized.file, { contentType: 'image/webp', cacheControl: '31536000' });

        if (upErr) {
          toast.error(`Failed to upload photo ${i + 1}`);
          continue;
        }

        const { error: photoErr } = await supabase
          .from('part_photos')
          .insert({
            part_id: partId,
            storage_path: fileName,
            is_cover: i === coverIndex,
            sort_order: i,
          });

        if (!photoErr) uploadSuccessCount++;
      }
      if (uploadSuccessCount > 0) {
        toast.success(`${uploadSuccessCount} photo(s) uploaded.`);
      }
    }

    // Save compatibility entries
    const validCompat = compatRows.filter((r) => r.make && r.model);
    if (validCompat.length > 0) {
      const compatData = validCompat.map((r) => ({
        part_id: partId,
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

    // Revoke object URLs
    pendingPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));

    setLoading(false);
    toast.success(publish ? 'Part published successfully.' : 'Draft saved successfully.');
    router.push('/admin/parts');
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/parts')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add New Part</h1>
          <p className="text-sm text-muted-foreground">Fill in the details below</p>
        </div>
      </div>

      <form className="space-y-6">
        {/* Photos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Photos</CardTitle>
                <CardDescription>Upload photos now or add them later by editing the part</CardDescription>
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
                className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-border py-10 text-center transition-colors hover:border-primary/50"
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
                      <div className="absolute top-1 left-1 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                        Cover
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      {idx !== coverIndex && (
                        <Button type="button" size="icon" variant="secondary" className="h-8 w-8" onClick={() => moveCover(idx)} title="Set as cover">
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button type="button" size="icon" variant="destructive" className="h-8 w-8" onClick={() => removePhoto(idx)} title="Remove">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {/* Add more button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
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
              <Label htmlFor="part-name">Part Name *</Label>
              <Input id="part-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Toyota Aqua NHP10 Headlight" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Brand</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_MANUFACTURERS.map((manufacturer) => (
                      <SelectItem key={manufacturer} value={manufacturer}>{manufacturer}</SelectItem>
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
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="part-number">Part Number</Label>
              <Input id="part-number" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Manufacturer part number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oem-number">OEM Number</Label>
              <Input id="oem-number" value={oemNumber} onChange={(e) => setOemNumber(e.target.value)} placeholder="OEM reference number" />
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Compatibility */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Vehicle Compatibility</CardTitle>
                <CardDescription>Add compatible vehicles for this part</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addCompatRow}>
                <Plus className="h-4 w-4" />
                Add Row
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {compatRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 items-end rounded-md border border-border p-3">
                <div className="space-y-1">
                  <Label className="text-xs">Make</Label>
                  <Input value={row.make || ''} onChange={(e) => updateCompatRow(idx, 'make', e.target.value)} placeholder="Toyota" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Model</Label>
                  <Input value={row.model || ''} onChange={(e) => updateCompatRow(idx, 'model', e.target.value)} placeholder="Aqua" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Chassis</Label>
                  <Input value={row.chassis_code || ''} onChange={(e) => updateCompatRow(idx, 'chassis_code', e.target.value)} placeholder="NHP10" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Engine</Label>
                  <Input value={row.engine_code || ''} onChange={(e) => updateCompatRow(idx, 'engine_code', e.target.value)} placeholder="1NZ" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year From</Label>
                  <Input type="number" value={row.year_from ?? ''} onChange={(e) => updateCompatRow(idx, 'year_from', e.target.value)} placeholder="2018" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year To</Label>
                  <Input type="number" value={row.year_to ?? ''} onChange={(e) => updateCompatRow(idx, 'year_to', e.target.value)} placeholder="2021" className="h-9 text-sm" />
                </div>
                {compatRows.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeCompatRow(idx)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Inventory & Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inventory & Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select value={condition} onValueChange={(v) => setCondition(v as PartCondition)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                    <SelectItem value="refurbished">Refurbished</SelectItem>
                    <SelectItem value="for-parts">For Parts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="part-quantity">Quantity</Label>
                <Input id="part-quantity" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="part-location">Location</Label>
                <Input id="part-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Warehouse / shelf" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="part-stock-origin">Stock location</Label>
                <select id="part-stock-origin" value={stockOrigin} onChange={(e) => setStockOrigin(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{STOCK_ORIGINS.map((origin) => <option key={origin.value} value={origin.value}>{origin.label}</option>)}</select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="part-price">Price</Label>
                <Input id="part-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2">
                  <Switch id="show-price" checked={showPrice} onCheckedChange={setShowPrice} />
                  <Label htmlFor="show-price">Show price publicly</Label>
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

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the part, its condition, and any notable details..." />
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
              <Label htmlFor="is-published">Publish this part (visible to customers)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="is-featured" checked={isFeatured} onCheckedChange={setIsFeatured} />
              <Label htmlFor="is-featured">Boost in home rotation + featured badge</Label>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.push('/admin/parts')}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" disabled={loading} onClick={(e) => handleSubmit(e as unknown as React.FormEvent, false)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Draft
          </Button>
          <Button type="button" disabled={loading} onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Publish Part
          </Button>
        </div>
      </form>
    </div>
  );
}

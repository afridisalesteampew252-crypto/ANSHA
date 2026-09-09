'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2, ArrowLeft, Plus, X, Image as ImageIcon, Trash2, Upload, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Category, PartCondition, PartCompatibility, PartPhoto, PartWithRelations } from '@/lib/types';

export default function EditPartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [part, setPart] = useState<PartWithRelations | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [oemNumber, setOemNumber] = useState('');
  const [condition, setCondition] = useState<PartCondition>('used');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [quantity, setQuantity] = useState('0');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [showPrice, setShowPrice] = useState(false);

  const [photos, setPhotos] = useState<PartPhoto[]>([]);
  const [compatRows, setCompatRows] = useState<Partial<PartCompatibility>[]>([]);

  useEffect(() => {
    (async () => {
      const [catRes, partRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase
          .from('parts')
          .select('*, categories(*), part_photos(*), part_compatibility(*)')
          .eq('id', id)
          .maybeSingle(),
      ]);

      setCategories((catRes.data || []) as Category[]);

      if (!partRes.data) {
        toast.error('Part not found.');
        router.push('/admin/parts');
        return;
      }

      const p = partRes.data as unknown as PartWithRelations;
      setPart(p);
      setName(p.name);
      setCategoryId(p.category_id || '');
      setBrand(p.brand || '');
      setPartNumber(p.part_number || '');
      setOemNumber(p.oem_number || '');
      setCondition(p.condition);
      setPrice(p.price?.toString() || '');
      setCurrency(p.currency);
      setQuantity(p.quantity.toString());
      setLocation(p.location || '');
      setDescription(p.description || '');
      setIsPublished(p.is_published);
      setIsFeatured(p.is_featured);
      setShowPrice(p.show_price);
      setPhotos((p.part_photos || []).sort((a, b) => a.sort_order - b.sort_order));
      setCompatRows(
        (p.part_compatibility || []).length > 0
          ? (p.part_compatibility || []).map((c) => ({ ...c }))
          : [{ make: '', model: '', variant: '', chassis_code: '', engine_code: '', year_from: undefined, year_to: undefined }]
      );
      setFetching(false);
    })();
  }, [id, router]);

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

  const handleSave = async () => {
    if (!part) return;
    if (!name.trim()) {
      toast.error('Part name is required.');
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from('parts')
      .update({
        name: name.trim(),
        category_id: categoryId || null,
        brand: brand.trim() || null,
        part_number: partNumber.trim() || null,
        oem_number: oemNumber.trim() || null,
        condition,
        price: price ? parseFloat(price) : null,
        currency,
        quantity: parseInt(quantity, 10) || 0,
        location: location.trim() || null,
        description: description.trim() || null,
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

    // Delete existing compatibility entries, then re-insert
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
    router.push('/admin/parts');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !part) return;

    setUploading(true);
    const partCode = part.part_code;
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop();
      const fileName = `${partCode}/${Date.now()}-${i}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('part-images')
        .upload(fileName, file);

      if (upErr) {
        toast.error(`Failed to upload ${file.name}`);
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
    }

    setUploading(false);
    if (successCount > 0) {
      toast.success(`${successCount} photo(s) uploaded.`);
    }
    e.target.value = '';
  };

  const setCoverPhoto = async (photoId: string) => {
    if (!part) return;
    await supabase.from('part_photos').update({ is_cover: false }).eq('part_id', part.id);
    await supabase.from('part_photos').update({ is_cover: true }).eq('id', photoId);
    setPhotos((prev) => prev.map((p) => ({ ...p, is_cover: p.id === photoId })));
    toast.success('Cover photo updated.');
  };

  const deletePhoto = async (photoId: string, storagePath: string) => {
    if (!part) return;
    await supabase.storage.from('part-images').remove([storagePath]);
    await supabase.from('part_photos').delete().eq('id', photoId);
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    toast.success('Photo deleted.');
  };

  const getPhotoUrl = (path: string) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    return `${supabaseUrl}/storage/v1/object/public/part-images/${path}`;
  };

  if (fetching) {
    return (
      <div className="max-w-3xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
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
          <h1 className="text-2xl font-bold tracking-tight">Edit Part</h1>
          <p className="text-sm text-muted-foreground font-mono">{part?.part_code}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Photos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Photos</CardTitle>
                <CardDescription>Upload and manage part images</CardDescription>
              </div>
              <label>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
                <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
                  <span>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Upload Photos
                  </span>
                </Button>
              </label>
            </div>
          </CardHeader>
          <CardContent>
            {photos.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">No photos uploaded yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="group relative overflow-hidden rounded-md border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getPhotoUrl(photo.storage_path)} alt="Part photo" className="aspect-square w-full object-cover" />
                    {photo.is_cover && (
                      <div className="absolute top-1 left-1 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                        Cover
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      {!photo.is_cover && (
                        <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => setCoverPhoto(photo.id)} title="Set as cover">
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => deletePhoto(photo.id, photo.storage_path)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Part Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
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
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Identification */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Identification</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Part Number</Label><Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} /></div>
            <div className="space-y-2"><Label>OEM Number</Label><Input value={oemNumber} onChange={(e) => setOemNumber(e.target.value)} /></div>
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
                <Plus className="h-4 w-4" /> Add Row
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {compatRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 items-end rounded-md border border-border p-3">
                <div className="space-y-1">
                  <Label className="text-xs">Make</Label>
                  <Input value={row.make || ''} onChange={(e) => updateCompatRow(idx, 'make', e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Model</Label>
                  <Input value={row.model || ''} onChange={(e) => updateCompatRow(idx, 'model', e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Chassis</Label>
                  <Input value={row.chassis_code || ''} onChange={(e) => updateCompatRow(idx, 'chassis_code', e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Engine</Label>
                  <Input value={row.engine_code || ''} onChange={(e) => updateCompatRow(idx, 'engine_code', e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year From</Label>
                  <Input type="number" value={row.year_from ?? ''} onChange={(e) => updateCompatRow(idx, 'year_from', e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year To</Label>
                  <Input type="number" value={row.year_to ?? ''} onChange={(e) => updateCompatRow(idx, 'year_to', e.target.value)} className="h-9 text-sm" />
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
          <CardHeader><CardTitle className="text-lg">Inventory & Pricing</CardTitle></CardHeader>
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
              <div className="space-y-2"><Label>Quantity</Label><Input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
              <div className="space-y-2"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2"><Label>Price</Label><Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
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
                  <Switch checked={showPrice} onCheckedChange={setShowPrice} />
                  <Label>Show price publicly</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Description</CardTitle></CardHeader>
          <CardContent><Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} /></CardContent>
        </Card>

        {/* Publishing */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Publishing</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
              <Label>Publish this part (visible to customers)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
              <Label>Feature on homepage</Label>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => router.push('/admin/parts')}>Cancel</Button>
          <Button disabled={loading} onClick={() => handleSave()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

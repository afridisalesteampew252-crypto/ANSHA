'use client';

import { useState } from 'react';
import readXlsxFile from 'read-excel-file';
import { unzipSync } from 'fflate';
import { BookOpen, Download, FileSpreadsheet, Images, MapPin, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { compressCatalogImage } from '@/lib/catalog-image';
import { STOCK_ORIGINS, defaultStockPoolForOrigin } from '@/lib/stock';
import { isAuctionSheetFilename } from '@/lib/vehicle-photos';
import type { StockOrigin } from '@/lib/types';

type Entity = 'parts' | 'vehicles';
type PreviewRow = Record<string, string | number | boolean | null>;

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const toBoolean = (value: unknown) => value === true || String(value ?? '').trim().toLowerCase() === 'true' || String(value ?? '').trim() === '1';

const templateLinks = {
  parts: '/templates/ansha-parts-import-template.xlsx',
  vehicles: '/templates/ansha-vehicles-import-template.xlsx',
};

export default function ImportsPage() {
  const [entity, setEntity] = useState<Entity>('parts');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [vehicleStockOrigin, setVehicleStockOrigin] = useState<StockOrigin>('dubai');
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);

  const chooseEntity = (next: Entity) => {
    setEntity(next); setFile(null); setRows([]); setMessage(''); setLastJobId(null);
  };

  const rollbackLastImport = async () => {
    if (!lastJobId || !window.confirm('Rollback the last catalog import? Records changed after the import will be skipped for safety.')) return;
    setRollbackBusy(true);
    const { data, error } = await supabase.rpc('rollback_import_job', { p_import_job_id: lastJobId });
    setRollbackBusy(false);
    if (error) return setMessage(error.message);
    const result = (data || {}) as { restored?: number; deleted?: number; skipped?: number; failed?: number };
    setMessage(`Rollback complete: ${result.restored || 0} restored, ${result.deleted || 0} deleted, ${result.skipped || 0} skipped, ${result.failed || 0} failed.`);
    setLastJobId(null);
  };

  const previewExcel = async (selected: File) => {
    setFile(selected); setMessage('Reading workbook…');
    const sheet = await readXlsxFile(selected);
    if (sheet.length < 2) return setMessage('Workbook has no data rows. Add records below the header row first.');
    const headers = sheet[0].map((cell) => String(cell || '').trim().toLowerCase().replaceAll(' ', '_'));
    const parsed = sheet.slice(1).filter((row) => row.some((cell) => cell !== null)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] === undefined ? null : row[index]])) as PreviewRow);
    setRows(parsed); setMessage(`${parsed.length} rows ready for validation and import.`);
  };

  const importExcel = async () => {
    if (!file || rows.length === 0) return;
    const confirmed = window.confirm(`Import ${rows.length} ${entity} rows into ANSHA? Existing matching records may be updated.`);
    if (!confirmed) return;
    setBusy(true); setMessage('Importing…');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return setMessage('Session expired.'); }
    const { data: job, error: jobError } = await supabase.from('import_jobs').insert({ import_type: `${entity}_excel`, file_name: file.name, total_rows: rows.length, created_by: user.id }).select('id').single();
    if (jobError || !job) { setBusy(false); return setMessage(jobError?.message || 'Could not create import job.'); }
    let success = 0; const results: Array<Record<string, unknown>> = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        if (entity === 'parts') {
          const partCode = String(row.part_code || '').trim(); const name = String(row.name || '').trim();
          if (!partCode || !name) throw new Error('part_code and name are required');
          const payload = { part_code: partCode, name, slug: String(row.slug || slugify(`${name}-${partCode}`)), brand: row.brand || null, part_number: row.part_number || null, oem_number: row.oem_number || null, condition: row.condition || 'used', price: row.price || null, currency: row.currency || 'USD', quantity: Number(row.quantity || 0), description: row.description || null, location: row.location || null, is_published: toBoolean(row.is_published), is_featured: toBoolean(row.is_featured), show_price: toBoolean(row.show_price) };
          const { data: existing } = await supabase.from('parts').select('*').eq('part_code', partCode).maybeSingle();
          const { data: saved, error } = await supabase.from('parts').upsert(payload, { onConflict: 'part_code' }).select('*').single(); if (error || !saved) throw error || new Error('Part import did not return the saved record');
          results.push({ import_job_id: job.id, row_number: index + 2, record_key: partCode, status: 'success', payload: row, target_table: 'parts', target_id: saved.id, previous_payload: existing || null, post_import_updated_at: saved.updated_at, rollback_status: 'pending' });
        } else {
          const chassis = String(row.chassis_number || '').trim(); const make = String(row.make || '').trim(); const model = String(row.model || '').trim();
          if (!chassis || !make || !model) throw new Error('chassis_number, make and model are required');
          const title = String(row.title || `${row.year || ''} ${make} ${model}`.trim());
          const payload = { chassis_number: chassis, stock_number: row.stock_number || null, title, slug: String(row.slug || slugify(`${title}-${chassis}`)), make, model, variant: row.variant || null, year: row.year ? Number(row.year) : null, chassis_code: row.chassis_code || null, engine_code: row.engine_code || null, transmission: row.transmission || null, fuel_type: row.fuel_type || null, mileage: row.mileage ? Number(row.mileage) : null, color: row.color || null, price: row.price || null, currency: row.currency || 'USD', description: row.description || null, location: row.location || null, stock_origin: vehicleStockOrigin, stock_pool: defaultStockPoolForOrigin(vehicleStockOrigin), show_price: toBoolean(row.show_price), is_published: toBoolean(row.is_published), is_featured: toBoolean(row.is_featured) };
          const { data: existing } = await supabase.from('vehicles').select('*').eq('chassis_number', chassis).maybeSingle();
          const mutation = existing ? supabase.from('vehicles').update(payload).eq('id', existing.id) : supabase.from('vehicles').insert(payload);
          const { data: saved, error } = await mutation.select('*').single(); if (error || !saved) throw error || new Error('Vehicle import did not return the saved record');
          results.push({ import_job_id: job.id, row_number: index + 2, record_key: chassis, status: 'success', payload: row, target_table: 'vehicles', target_id: saved.id, previous_payload: existing || null, post_import_updated_at: saved.updated_at, rollback_status: 'pending' });
        }
        success += 1;
      } catch (error) {
        results.push({ import_job_id: job.id, row_number: index + 2, record_key: String(row.part_code || row.chassis_number || ''), status: 'failed', message: error instanceof Error ? error.message : 'Import failed', payload: row });
      }
    }
    await supabase.from('import_rows').insert(results);
    await supabase.from('import_jobs').update({ status: success === rows.length ? 'completed' : 'completed_with_errors', successful_rows: success, failed_rows: rows.length - success, completed_at: new Date().toISOString() }).eq('id', job.id);
    setLastJobId(job.id);
    setBusy(false); setMessage(`Imported ${success} of ${rows.length} rows. ${rows.length - success} failed.`);
  };

  const importZip = async (selected: File) => {
    if (selected.size > 500 * 1024 * 1024) return setMessage('ZIP is too large. Maximum supported size is 500 MB.');
    setBusy(true); setMessage('Reading ZIP and matching filenames…');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return setMessage('Session expired.'); }
    const archive = unzipSync(new Uint8Array(await selected.arrayBuffer()));
    const imageEntries = Object.entries(archive).filter(([name]) => /\.(jpe?g|png|webp|gif|avif)$/i.test(name));
    if (imageEntries.length > 1000) {
      setBusy(false);
      return setMessage('ZIP contains more than 1,000 images. Split it into smaller import jobs.');
    }
    const lookupColumn = entity === 'vehicles' ? 'chassis_number' : 'part_number';
    const table = entity === 'vehicles' ? 'vehicles' : 'parts';
    const bucket = entity === 'vehicles' ? 'vehicle-images' : 'part-images';
    const { data: records } = await supabase.from(table).select(`id,${lookupColumn}`);
    const recordMap = new Map(((records || []) as Array<Record<string, string | null>>).map((record) => [normalize(String(record[lookupColumn] || '')), record.id]));
    const { data: job } = await supabase.from('import_jobs').insert({ import_type: `${entity}_images_zip`, file_name: selected.name, total_rows: imageEntries.length, created_by: user.id }).select('id').single();
    if (!job) { setBusy(false); return setMessage('Could not create image import job.'); }
    let success = 0; const results: Array<Record<string, unknown>> = [];
    for (let index = 0; index < imageEntries.length; index += 1) {
      const [name, bytes] = imageEntries[index]; const filename = name.split('/').pop() || name; const key = normalize(filename.replace(/\.[^.]+$/, '').split(/[_-](?:image|img|photo)?\d*$/i)[0]); const recordId = recordMap.get(key);
      try {
        if (!recordId) throw new Error(`No ${lookupColumn} match for ${filename}`);
        const sourceType = filename.toLowerCase().endsWith('.png') ? 'image/png' : filename.toLowerCase().endsWith('.webp') ? 'image/webp' : filename.toLowerCase().endsWith('.gif') ? 'image/gif' : filename.toLowerCase().endsWith('.avif') ? 'image/avif' : 'image/jpeg';
        const optimized = await compressCatalogImage(new Blob([bytes], { type: sourceType }), `${entity}-${key}-${index + 1}`);
        const storagePath = `${recordId}/${Date.now()}-${optimized.file.name}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, optimized.file, { contentType: 'image/webp', cacheControl: '31536000' }); if (uploadError) throw uploadError;
        if (entity === 'vehicles') {
          const { error: photoError } = await supabase.from('vehicle_photos').insert({
            vehicle_id: recordId,
            storage_path: storagePath,
            is_cover: false,
            is_auction_sheet: isAuctionSheetFilename(filename),
            sort_order: 99,
          });
          if (photoError) throw photoError;
        } else {
          const { error: photoError } = await supabase.from('part_photos').insert({
            part_id: recordId,
            storage_path: storagePath,
            is_cover: false,
            sort_order: 99,
          });
          if (photoError) throw photoError;
        }
        success += 1; results.push({ import_job_id: job.id, row_number: index + 1, record_key: key, status: 'success', payload: { filename } });
      } catch (error) { results.push({ import_job_id: job.id, row_number: index + 1, record_key: key, status: 'failed', message: error instanceof Error ? error.message : 'Image import failed', payload: { filename } }); }
    }
    await supabase.from('import_rows').insert(results);
    await supabase.from('import_jobs').update({ status: success === imageEntries.length ? 'completed' : 'completed_with_errors', successful_rows: success, failed_rows: imageEntries.length - success, completed_at: new Date().toISOString() }).eq('id', job.id);
    setBusy(false); setMessage(`Uploaded ${success} of ${imageEntries.length} images. ${imageEntries.length - success} unmatched or failed.`);
  };

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold">Bulk import</h1><p className="text-sm text-muted-foreground">Download the correct template, preview records, then import catalog data or matched image ZIPs.</p></div><Button asChild variant="outline"><a href={templateLinks[entity]} download><Download className="h-4 w-4" />Download {entity} template</a></Button></div>
    <div className="flex gap-2"><Button variant={entity === 'parts' ? 'default' : 'outline'} onClick={() => chooseEntity('parts')}>Parts</Button><Button variant={entity === 'vehicles' ? 'default' : 'outline'} onClick={() => chooseEntity('vehicles')}>Vehicles</Button></div>

    <Card className="border-primary/20 bg-primary/[0.03]"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BookOpen className="h-5 w-5" />Before you upload</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm md:grid-cols-3">
      <div><p className="font-semibold">1. Keep headers unchanged</p><p className="mt-1 text-muted-foreground">Use the downloaded workbook. Red columns are required and dropdowns prevent common format mistakes.</p></div>
      <div><p className="font-semibold">2. Match image names exactly</p><p className="mt-1 text-muted-foreground">{entity === 'parts' ? 'Use the exact part_number' : 'Use the exact chassis_number'}, followed by _1, _2 or _3 for multiple photos.</p></div>
      <div><p className="font-semibold">3. ZIP images only</p><p className="mt-1 text-muted-foreground">Put images directly in one ZIP. JPG, PNG, WebP, GIF and AVIF are accepted and optimized automatically.</p></div>
    </CardContent></Card>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="min-w-0"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileSpreadsheet className="h-5 w-5" />Excel catalog</CardTitle></CardHeader><CardContent className="space-y-4">{entity === 'vehicles' && <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4"><Label htmlFor="vehicle-stock-origin" className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Import into stock country</Label><select id="vehicle-stock-origin" value={vehicleStockOrigin} onChange={(event) => setVehicleStockOrigin(event.target.value as StockOrigin)} disabled={busy} className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm font-medium">{STOCK_ORIGINS.map((origin) => <option key={origin.value} value={origin.value}>{origin.label}</option>)}</select><p className="mt-2 text-xs text-muted-foreground">Every vehicle in this workbook will be assigned to the selected stock location. Existing matching chassis records will also move to this location.</p></div>}<div><Label htmlFor="excel-file">Excel file (.xlsx)</Label><input id="excel-file" className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2" type="file" accept=".xlsx" disabled={busy} onChange={(event) => event.target.files?.[0] && void previewExcel(event.target.files[0])} /></div>{rows.length > 0 && <div className="max-h-64 w-full overflow-auto rounded-md border text-xs"><table className="min-w-max"><thead className="sticky top-0 bg-secondary"><tr>{Object.keys(rows[0]).map((key) => <th key={key} className="whitespace-nowrap p-2 text-left">{key}</th>)}</tr></thead><tbody>{rows.slice(0, 10).map((row, index) => <tr key={index} className="border-t">{Object.values(row).map((value, cell) => <td key={cell} className="max-w-48 truncate p-2">{String(value ?? '')}</td>)}</tr>)}</tbody></table></div>}<div className="flex flex-wrap items-center gap-2"><Button disabled={busy || rows.length === 0} onClick={importExcel}><Upload className="h-4 w-4" />Import {entity === 'vehicles' ? `${STOCK_ORIGINS.find((origin) => origin.value === vehicleStockOrigin)?.label} vehicles` : entity}</Button>{lastJobId ? <Button type="button" variant="outline" disabled={rollbackBusy} onClick={() => void rollbackLastImport()}>{rollbackBusy ? 'Rolling back…' : 'Rollback last Excel import'}</Button> : null}</div><p className="text-xs text-muted-foreground">Successful Excel rows keep a snapshot for rollback. Records edited after import are skipped rather than overwritten.</p></CardContent></Card>
      <Card className="min-w-0"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Images className="h-5 w-5" />ZIP images</CardTitle></CardHeader><CardContent className="space-y-4"><div className="rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">Naming examples</p><code className="mt-2 block break-all">{entity === 'parts' ? '04465-0K340_1.jpg' : 'JTEBX3FJ10K123456_1.jpg'}</code><code className="block break-all">{entity === 'parts' ? '04465-0K340_2.png' : 'JTEBX3FJ10K123456_2.png'}</code></div><input className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2" type="file" accept=".zip" disabled={busy} onChange={(event) => event.target.files?.[0] && void importZip(event.target.files[0])} /></CardContent></Card>
    </div>
    {message && <div role="status" className="rounded-lg border bg-secondary/30 p-4 text-sm">{message}</div>}
  </div>;
}

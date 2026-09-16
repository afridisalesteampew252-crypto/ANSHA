'use client';

import { useState } from 'react';
import readXlsxFile from 'read-excel-file';
import { unzipSync } from 'fflate';
import { FileSpreadsheet, Images, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

type Entity = 'parts' | 'vehicles';
type PreviewRow = Record<string, string | number | boolean | null>;

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export default function ImportsPage() {
  const [entity, setEntity] = useState<Entity>('parts');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const previewExcel = async (selected: File) => {
    setFile(selected); setMessage('Reading workbook…');
    const sheet = await readXlsxFile(selected);
    if (sheet.length < 2) return setMessage('Workbook has no data rows.');
    const headers = sheet[0].map((cell) => String(cell || '').trim().toLowerCase().replaceAll(' ', '_'));
    const parsed = sheet.slice(1).filter((row) => row.some((cell) => cell !== null)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] === undefined ? null : row[index]])) as PreviewRow);
    setRows(parsed); setMessage(`${parsed.length} rows ready for validation and import.`);
  };

  const importExcel = async () => {
    if (!file || rows.length === 0) return;
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
          const payload = { part_code: partCode, name, slug: String(row.slug || slugify(`${name}-${partCode}`)), brand: row.brand || null, part_number: row.part_number || null, oem_number: row.oem_number || null, condition: row.condition || 'used', price: row.price || null, currency: row.currency || 'USD', quantity: Number(row.quantity || 0), description: row.description || null, location: row.location || null, is_published: Boolean(row.is_published ?? false), is_featured: Boolean(row.is_featured ?? false), show_price: Boolean(row.show_price ?? false) };
          const { error } = await supabase.from('parts').upsert(payload, { onConflict: 'part_code' }); if (error) throw error;
          results.push({ import_job_id: job.id, row_number: index + 2, record_key: partCode, status: 'success', payload: row });
        } else {
          const chassis = String(row.chassis_number || '').trim(); const make = String(row.make || '').trim(); const model = String(row.model || '').trim();
          if (!chassis || !make || !model) throw new Error('chassis_number, make and model are required');
          const title = String(row.title || `${row.year || ''} ${make} ${model}`.trim());
          const payload = { chassis_number: chassis, stock_number: row.stock_number || null, title, slug: String(row.slug || slugify(`${title}-${chassis}`)), make, model, variant: row.variant || null, year: row.year ? Number(row.year) : null, chassis_code: row.chassis_code || null, engine_code: row.engine_code || null, transmission: row.transmission || null, fuel_type: row.fuel_type || null, mileage: row.mileage ? Number(row.mileage) : null, color: row.color || null, price: row.price || null, currency: row.currency || 'USD', description: row.description || null, location: row.location || null, show_price: Boolean(row.show_price ?? false), is_published: Boolean(row.is_published ?? false), is_featured: Boolean(row.is_featured ?? false) };
          const { data: existing } = await supabase.from('vehicles').select('id').eq('chassis_number', chassis).maybeSingle();
          const mutation = existing
            ? supabase.from('vehicles').update(payload).eq('id', existing.id)
            : supabase.from('vehicles').insert(payload);
          const { error } = await mutation; if (error) throw error;
          results.push({ import_job_id: job.id, row_number: index + 2, record_key: chassis, status: 'success', payload: row });
        }
        success += 1;
      } catch (error) {
        results.push({ import_job_id: job.id, row_number: index + 2, record_key: String(row.part_code || row.chassis_number || ''), status: 'failed', message: error instanceof Error ? error.message : 'Import failed', payload: row });
      }
    }
    await supabase.from('import_rows').insert(results);
    await supabase.from('import_jobs').update({ status: success === rows.length ? 'completed' : 'completed_with_errors', successful_rows: success, failed_rows: rows.length - success, completed_at: new Date().toISOString() }).eq('id', job.id);
    setBusy(false); setMessage(`Imported ${success} of ${rows.length} rows. ${rows.length - success} failed.`);
  };

  const importZip = async (selected: File) => {
    setBusy(true); setMessage('Reading ZIP and matching filenames…');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return setMessage('Session expired.'); }
    const archive = unzipSync(new Uint8Array(await selected.arrayBuffer()));
    const imageEntries = Object.entries(archive).filter(([name]) => /\.(jpe?g|png|webp|gif|avif)$/i.test(name));
    const lookupColumn = entity === 'vehicles' ? 'chassis_number' : 'part_number';
    const table = entity === 'vehicles' ? 'vehicles' : 'parts';
    const photoTable = entity === 'vehicles' ? 'vehicle_photos' : 'part_photos';
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
        const storagePath = `${recordId}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, bytes, { contentType: filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg' }); if (uploadError) throw uploadError;
        const { error: photoError } = await supabase.from(photoTable).insert({ [entity === 'vehicles' ? 'vehicle_id' : 'part_id']: recordId, storage_path: storagePath, is_cover: false, sort_order: 99 }); if (photoError) throw photoError;
        success += 1; results.push({ import_job_id: job.id, row_number: index + 1, record_key: key, status: 'success', payload: { filename } });
      } catch (error) { results.push({ import_job_id: job.id, row_number: index + 1, record_key: key, status: 'failed', message: error instanceof Error ? error.message : 'Image import failed', payload: { filename } }); }
    }
    await supabase.from('import_rows').insert(results); await supabase.from('import_jobs').update({ status: success === imageEntries.length ? 'completed' : 'completed_with_errors', successful_rows: success, failed_rows: imageEntries.length - success, completed_at: new Date().toISOString() }).eq('id', job.id);
    setBusy(false); setMessage(`Uploaded ${success} of ${imageEntries.length} images. ${imageEntries.length - success} unmatched or failed.`);
  };

  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Bulk import</h1><p className="text-sm text-muted-foreground">Import Excel catalog data and ZIP image sets with auditable row results.</p></div>
    <div className="flex gap-2"><Button variant={entity==='parts'?'default':'outline'} onClick={()=>{setEntity('parts');setRows([]);}}>Parts</Button><Button variant={entity==='vehicles'?'default':'outline'} onClick={()=>{setEntity('vehicles');setRows([]);}}>Vehicles</Button></div>
    <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileSpreadsheet className="h-5 w-5"/>Excel catalog</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>Excel file (.xlsx)</Label><input className="mt-2 block w-full text-sm" type="file" accept=".xlsx" onChange={e=>e.target.files?.[0]&&void previewExcel(e.target.files[0])}/></div>{rows.length>0&&<div className="max-h-56 overflow-auto rounded-md border text-xs"><table className="w-full"><thead><tr>{Object.keys(rows[0]).map(key=><th key={key} className="p-2 text-left">{key}</th>)}</tr></thead><tbody>{rows.slice(0,10).map((row,i)=><tr key={i} className="border-t">{Object.values(row).map((value,j)=><td key={j} className="p-2">{String(value??'')}</td>)}</tr>)}</tbody></table></div>}<Button disabled={busy||rows.length===0} onClick={importExcel}><Upload className="h-4 w-4"/>Import {entity}</Button></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Images className="h-5 w-5"/>ZIP images</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Name vehicle images with the chassis number and part images with the part number. Multiple files may end in <code>_1</code>, <code>_2</code>, and so on.</p><input className="block w-full text-sm" type="file" accept=".zip" disabled={busy} onChange={e=>e.target.files?.[0]&&void importZip(e.target.files[0])}/></CardContent></Card></div>
    {message&&<div className="rounded-lg border bg-secondary/30 p-4 text-sm">{message}</div>}
  </div>;
}

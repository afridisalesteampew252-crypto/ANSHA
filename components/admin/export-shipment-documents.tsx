'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { EXPORT_MARKETS } from '@/lib/export-markets';
import { supabase } from '@/lib/supabase/client';
import {
  EXPORT_DOC_LABELS,
  SINGLE_SLOT_EXPORT_DOCS,
  type ExportDocType,
} from '@/lib/trade-terms';
import type { ExportShipmentDocument } from '@/lib/types';

const BUCKET = 'export-shipment-documents';
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

type Props = {
  shipmentId: string;
  readOnly?: boolean;
};

function formatBytes(value: number | null) {
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExportShipmentDocumentsPanel({ shipmentId, readOnly }: Props) {
  const [docs, setDocs] = useState<ExportShipmentDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [inspectionCountry, setInspectionCountry] = useState(EXPORT_MARKETS[0]?.code || 'AE');
  const [slotUploading, setSlotUploading] = useState<ExportDocType | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('export_shipment_documents')
      .select('*')
      .eq('export_shipment_id', shipmentId)
      .order('created_at', { ascending: true });
    if (error) {
      toast.error(error.message);
      setDocs([]);
      return;
    }
    setDocs((data || []) as ExportShipmentDocument[]);
  }, [shipmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const slotDoc = (type: ExportDocType) => docs.find((d) => d.doc_type === type) || null;
  const inspectionDocs = docs.filter((d) => d.doc_type === 'inspection_certificate');

  const openDoc = async (doc: ExportShipmentDocument) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 300);
    if (error || !data?.signedUrl) {
      toast.error(error?.message || 'Could not open document.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const uploadFile = async (
    file: File,
    docType: ExportDocType,
    countryCode?: string | null,
    countryName?: string | null
  ) => {
    if (docType === 'inspection_certificate' && !countryCode) {
      toast.error('Select a country for the inspection certificate.');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Session expired. Sign in again.');
      return;
    }

    setBusy(true);
    setSlotUploading(docType);
    try {
      // Replace existing single-slot document.
      if (docType !== 'inspection_certificate') {
        const existing = slotDoc(docType);
        if (existing) {
          await supabase.storage.from(BUCKET).remove([existing.storage_path]);
          await supabase.from('export_shipment_documents').delete().eq('id', existing.id);
        }
      }

      const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
      const path = `${user.id}/${shipmentId}/${docType}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        cacheControl: '31536000',
      });
      if (uploadError) throw uploadError;

      const market = countryCode
        ? EXPORT_MARKETS.find((m) => m.code === countryCode.toUpperCase())
        : null;
      const { error: rowError } = await supabase.from('export_shipment_documents').insert({
        export_shipment_id: shipmentId,
        doc_type: docType,
        country_code: countryCode ? countryCode.toUpperCase() : null,
        country_name: countryName || market?.name || null,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user.id,
      });
      if (rowError) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw rowError;
      }
      toast.success(`${EXPORT_DOC_LABELS[docType]} uploaded.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
      setSlotUploading(null);
    }
  };

  const removeDoc = async (doc: ExportShipmentDocument) => {
    if (!window.confirm(`Delete ${doc.file_name}?`)) return;
    setBusy(true);
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    if (storageError) {
      setBusy(false);
      toast.error(storageError.message);
      return;
    }
    const { error } = await supabase.from('export_shipment_documents').delete().eq('id', doc.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Document removed.');
    await load();
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div>
        <p className="text-sm font-semibold">Shipping documents</p>
        <p className="text-xs text-muted-foreground">
          PDF or image. Admin-only signed download. Courier document is typical for vehicle / RoRo / container flows; DHL
          often uses waybill.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SINGLE_SLOT_EXPORT_DOCS.map((docType) => {
          const existing = slotDoc(docType);
          return (
            <div key={docType} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{EXPORT_DOC_LABELS[docType]}</p>
                  {existing ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {existing.file_name}
                      {existing.size_bytes ? ` · ${formatBytes(existing.size_bytes)}` : ''}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No file yet</p>
                  )}
                </div>
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="flex flex-wrap gap-2">
                {existing ? (
                  <>
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void openDoc(existing)}>
                      <Download className="h-3.5 w-3.5" />
                      View
                    </Button>
                    {!readOnly ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        className="text-destructive"
                        onClick={() => void removeDoc(existing)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {!readOnly ? (
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept={ACCEPT}
                      className="hidden"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = '';
                        if (file) void uploadFile(file, docType);
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" disabled={busy} asChild>
                      <span>
                        {slotUploading === docType ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        {existing ? 'Replace' : 'Upload'}
                      </span>
                    </Button>
                  </label>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div>
          <p className="text-sm font-semibold">Inspection certificates</p>
          <p className="text-xs text-muted-foreground">
            Upload one or more certificates, each tied to a destination country (many markets need their own inspection).
          </p>
        </div>

        {!readOnly ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1.5">
              <Label htmlFor="inspection-country">Country</Label>
              <select
                id="inspection-country"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={inspectionCountry}
                onChange={(e) => setInspectionCountry(e.target.value)}
                disabled={busy}
              >
                {EXPORT_MARKETS.map((market) => (
                  <option key={market.code} value={market.code}>
                    {market.code} — {market.name}
                  </option>
                ))}
              </select>
            </div>
            <label>
              <input
                type="file"
                accept={ACCEPT}
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (!file) return;
                  const market = EXPORT_MARKETS.find((m) => m.code === inspectionCountry);
                  void uploadFile(file, 'inspection_certificate', inspectionCountry, market?.name || null);
                }}
              />
              <Button type="button" size="sm" disabled={busy} asChild>
                <span>
                  {slotUploading === 'inspection_certificate' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Upload inspection certificate
                </span>
              </Button>
            </label>
          </div>
        ) : null}

        {inspectionDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No inspection certificates yet.</p>
        ) : (
          <ul className="space-y-2">
            {inspectionDocs.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {doc.country_code || '—'}
                    {doc.country_name ? ` — ${doc.country_name}` : ''}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {doc.file_name}
                    {doc.size_bytes ? ` · ${formatBytes(doc.size_bytes)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label="View" onClick={() => void openDoc(doc)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {!readOnly ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      className="text-destructive"
                      aria-label="Delete"
                      onClick={() => void removeDoc(doc)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  catalogImageStoragePath,
  compressCatalogImage,
  isManagedCatalogImagePath,
  isWebpCatalogImagePath,
  shouldReplaceExistingCatalogImage,
} from '@/lib/catalog-image';
import { requestPublicRevalidation } from '@/lib/revalidate-public';
import { supabase } from '@/lib/supabase/client';

type ImageKind = 'vehicle' | 'part';

type ImageRecord = {
  kind: ImageKind;
  id: string;
  parentId: string;
  storagePath: string;
};

type RunStats = {
  processed: number;
  optimized: number;
  skipped: number;
  failed: number;
  deleteWarnings: number;
  bytesBefore: number;
  bytesAfter: number;
};

type OptimizeResult =
  | { status: 'optimized'; before: number; after: number; deleteWarning: boolean }
  | { status: 'skipped'; before: number }
  | { status: 'failed'; error: string };

const PAGE_SIZE = 500;
const EMPTY_STATS: RunStats = {
  processed: 0,
  optimized: 0,
  skipped: 0,
  failed: 0,
  deleteWarnings: 0,
  bytesBefore: 0,
  bytesAfter: 0,
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** power;
  return `${amount >= 10 || power === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[power]}`;
}

function fileStem(path: string) {
  const file = path.split('/').pop() || 'catalog-image';
  return file.replace(/\.[a-z0-9]+$/i, '') || 'catalog-image';
}

async function fetchAllVehiclePhotos(): Promise<ImageRecord[]> {
  const rows: ImageRecord[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('vehicle_photos')
      .select('id,vehicle_id,storage_path')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(
      ...page
        .filter((row) => Boolean(row.storage_path))
        .map((row) => ({
          kind: 'vehicle' as const,
          id: row.id,
          parentId: row.vehicle_id,
          storagePath: row.storage_path,
        }))
    );
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchAllPartPhotos(): Promise<ImageRecord[]> {
  const rows: ImageRecord[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('part_photos')
      .select('id,part_id,storage_path')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(
      ...page
        .filter((row) => Boolean(row.storage_path))
        .map((row) => ({
          kind: 'part' as const,
          id: row.id,
          parentId: row.part_id,
          storagePath: row.storage_path,
        }))
    );
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadSlugs(table: 'vehicles' | 'parts', ids: string[]) {
  if (!ids.length) return [] as string[];
  const unique = Array.from(new Set(ids));
  const slugs: string[] = [];
  for (let index = 0; index < unique.length; index += 100) {
    const batch = unique.slice(index, index + 100);
    const { data } = await supabase.from(table).select('id,slug').in('id', batch);
    for (const row of data || []) if (row.slug) slugs.push(row.slug);
  }
  return slugs;
}

export default function ImageOptimizationPage() {
  const [records, setRecords] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [scanError, setScanError] = useState('');
  const [deepScan, setDeepScan] = useState(false);
  const [deleteOriginals, setDeleteOriginals] = useState(true);
  const [running, setRunning] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [stats, setStats] = useState<RunStats>(EMPTY_STATS);
  const [lastError, setLastError] = useState('');
  const stopRequested = useRef(false);
  const changedVehicleIds = useRef(new Set<string>());
  const changedPartIds = useRef(new Set<string>());

  const scan = useCallback(async () => {
    setLoading(true);
    setScanError('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthorized(false);
        setRecords([]);
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from('admin_profiles')
        .select('role,is_active')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      const canRun = profile?.role === 'admin' && profile.is_active !== false;
      setAuthorized(canRun);
      if (!canRun) {
        setRecords([]);
        return;
      }

      const [vehicles, parts] = await Promise.all([fetchAllVehiclePhotos(), fetchAllPartPhotos()]);
      setRecords([...vehicles, ...parts]);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Could not scan the image library.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  const summary = useMemo(() => {
    const managed = records.filter((record) => isManagedCatalogImagePath(record.storagePath)).length;
    const legacyFormat = records.filter(
      (record) => !isManagedCatalogImagePath(record.storagePath) && !isWebpCatalogImagePath(record.storagePath)
    ).length;
    const unmanagedWebp = records.length - managed - legacyFormat;
    return { managed, legacyFormat, unmanagedWebp };
  }, [records]);

  const candidates = useMemo(
    () =>
      records.filter(
        (record) =>
          !isManagedCatalogImagePath(record.storagePath) &&
          (deepScan || !isWebpCatalogImagePath(record.storagePath))
      ),
    [deepScan, records]
  );

  const optimizeOne = async (record: ImageRecord): Promise<OptimizeResult> => {
    const bucket = record.kind === 'vehicle' ? 'vehicle-images' : 'part-images';
    try {
      const { data: sourceBlob, error: downloadError } = await supabase.storage
        .from(bucket)
        .download(record.storagePath);
      if (downloadError || !sourceBlob) throw downloadError || new Error('Image download failed.');
      if (!sourceBlob.type.startsWith('image/')) throw new Error('Stored object is not an image.');

      const optimized = await compressCatalogImage(sourceBlob, fileStem(record.storagePath));
      const decision = shouldReplaceExistingCatalogImage({
        storagePath: record.storagePath,
        originalBytes: optimized.originalBytes,
        compressedBytes: optimized.compressedBytes,
        originalWidth: optimized.originalWidth,
        originalHeight: optimized.originalHeight,
      });
      if (!decision.replace) return { status: 'skipped', before: optimized.originalBytes };

      const newPath = catalogImageStoragePath(record.storagePath, optimized.file.name);
      const { error: uploadError } = await supabase.storage.from(bucket).upload(newPath, optimized.file, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const updateQuery =
        record.kind === 'vehicle'
          ? supabase
              .from('vehicle_photos')
              .update({ storage_path: newPath })
              .eq('id', record.id)
              .eq('storage_path', record.storagePath)
          : supabase
              .from('part_photos')
              .update({ storage_path: newPath })
              .eq('id', record.id)
              .eq('storage_path', record.storagePath);
      const { data: updated, error: updateError } = await updateQuery.select('id').maybeSingle();
      if (updateError || !updated) {
        await supabase.storage.from(bucket).remove([newPath]);
        throw updateError || new Error('The image record changed during optimization.');
      }

      let deleteWarning = false;
      if (deleteOriginals) {
        const { error: deleteError } = await supabase.storage.from(bucket).remove([record.storagePath]);
        deleteWarning = Boolean(deleteError);
      }

      if (record.kind === 'vehicle') changedVehicleIds.current.add(record.parentId);
      else changedPartIds.current.add(record.parentId);

      return {
        status: 'optimized',
        before: optimized.originalBytes,
        after: optimized.compressedBytes,
        deleteWarning,
      };
    } catch (error) {
      return { status: 'failed', error: error instanceof Error ? error.message : 'Optimization failed.' };
    }
  };

  const refreshPublicPages = async () => {
    const [vehicleSlugs, partSlugs] = await Promise.all([
      loadSlugs('vehicles', Array.from(changedVehicleIds.current)),
      loadSlugs('parts', Array.from(changedPartIds.current)),
    ]);
    if (changedVehicleIds.current.size) requestPublicRevalidation('vehicle', vehicleSlugs);
    if (changedPartIds.current.size) requestPublicRevalidation('part', partSlugs);
  };

  const runOptimization = async () => {
    if (running || candidates.length === 0) return;
    if (!window.confirm(`Optimize ${candidates.length} existing catalog image${candidates.length === 1 ? '' : 's'} now?`)) return;

    stopRequested.current = false;
    changedVehicleIds.current.clear();
    changedPartIds.current.clear();
    setRunning(true);
    setStats(EMPTY_STATS);
    setLastError('');

    let nextStats = { ...EMPTY_STATS };
    for (const record of candidates) {
      if (stopRequested.current) break;
      setCurrentPath(record.storagePath);
      const result = await optimizeOne(record);
      nextStats = { ...nextStats, processed: nextStats.processed + 1 };
      if (result.status === 'optimized') {
        nextStats.optimized += 1;
        nextStats.bytesBefore += result.before;
        nextStats.bytesAfter += result.after;
        if (result.deleteWarning) nextStats.deleteWarnings += 1;
      } else if (result.status === 'skipped') {
        nextStats.skipped += 1;
      } else {
        nextStats.failed += 1;
        setLastError(`${record.storagePath}: ${result.error}`);
      }
      setStats({ ...nextStats });
    }

    setCurrentPath('');
    await refreshPublicPages();
    await scan();
    setRunning(false);
  };

  const savedBytes = Math.max(0, stats.bytesBefore - stats.bytesAfter);
  const savedPercent = stats.bytesBefore > 0 ? Math.round((savedBytes / stats.bytesBefore) * 100) : 0;

  if (loading && authorized === null) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-10">
        <Button asChild variant="ghost" className="-ml-3">
          <Link href="/admin/dashboard"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>Only an active Admin account can migrate stored catalog images.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" className="-ml-3">
            <Link href="/admin/system-health"><ArrowLeft className="h-4 w-4" />System health</Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ImageIcon className="h-6 w-6 text-accent" />Catalog image optimization
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            New vehicle and part uploads are automatically resized to a 1400px maximum edge and stored as WebP. This tool safely migrates older public catalog images.
          </p>
        </div>
        <Button variant="outline" disabled={loading || running} onClick={() => void scan()}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Rescan library
        </Button>
      </div>

      {scanError ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {scanError}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total references</CardDescription><CardTitle>{records.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Managed optimized</CardDescription><CardTitle>{summary.managed}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Legacy JPG/PNG/etc.</CardDescription><CardTitle>{summary.legacyFormat}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Older WebP</CardDescription><CardTitle>{summary.unmanagedWebp}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-emerald-600" />Safe migration controls</CardTitle>
          <CardDescription>
            Each image is downloaded, compressed, uploaded under a new versioned filename, then its database record is swapped. The old file is only deleted after the swap succeeds.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="flex items-start justify-between gap-4 rounded-xl border p-4">
            <span><span className="block text-sm font-semibold">Deep scan older WebP</span><span className="mt-1 block text-xs text-muted-foreground">Off by default. When enabled, older WebP is recompressed only if oversized or it saves at least 8%.</span></span>
            <Switch checked={deepScan} onCheckedChange={setDeepScan} disabled={running} />
          </label>
          <label className="flex items-start justify-between gap-4 rounded-xl border p-4">
            <span><span className="block text-sm font-semibold">Delete replaced originals</span><span className="mt-1 block text-xs text-muted-foreground">Recommended. Originals are removed only after the optimized object and database change are verified.</span></span>
            <Switch checked={deleteOriginals} onCheckedChange={setDeleteOriginals} disabled={running} />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Migration queue</CardTitle>
              <CardDescription>{candidates.length} image{candidates.length === 1 ? '' : 's'} currently eligible</CardDescription>
            </div>
            <div className="flex gap-2">
              {running ? (
                <Button variant="destructive" onClick={() => { stopRequested.current = true; }}>
                  <Square className="h-4 w-4" />Stop after current
                </Button>
              ) : (
                <Button onClick={() => void runOptimization()} disabled={loading || candidates.length === 0}>
                  <Play className="h-4 w-4" />Optimize existing
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {running || stats.processed > 0 ? (
            <div className="space-y-3 rounded-xl border bg-secondary/20 p-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">Processed {stats.processed}/{candidates.length}</Badge>
                <Badge variant="secondary">Optimized {stats.optimized}</Badge>
                <Badge variant="secondary">Skipped {stats.skipped}</Badge>
                {stats.failed ? <Badge variant="destructive">Failed {stats.failed}</Badge> : null}
                {stats.deleteWarnings ? <Badge variant="outline">Cleanup warnings {stats.deleteWarnings}</Badge> : null}
              </div>
              {stats.optimized > 0 ? (
                <p className="text-sm font-medium">
                  Saved {formatBytes(savedBytes)} ({savedPercent}%) across replaced images · {formatBytes(stats.bytesBefore)} → {formatBytes(stats.bytesAfter)}
                </p>
              ) : null}
              {currentPath ? <p className="truncate font-mono text-xs text-muted-foreground">Working: {currentPath}</p> : null}
              {lastError ? <p className="text-xs text-destructive">Latest error: {lastError}</p> : null}
            </div>
          ) : null}

          {candidates.length === 0 && !loading ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5 shrink-0" />No legacy images are waiting under the current scan settings.
            </div>
          ) : (
            <div className="rounded-xl border p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p>The migration runs sequentially to keep browser memory and Supabase traffic controlled. You can stop safely after the current image and run it again later; already managed files are skipped automatically.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

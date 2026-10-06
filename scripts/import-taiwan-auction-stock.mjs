/**
 * Taiwan auction stock bulk import from extracted ZIP folders.
 * Usage: node scripts/import-taiwan-auction-stock.mjs
 *
 * Sources under ANSHA/_import_taiwan_stock/<zip>/...
 * Dedupes by chassis_number / stock_number (ATW*). Merges richest photo set.
 * FOB: parsed from folder/file names when present; otherwise null + show_price false.
 * Draft publish (no prior Taiwan inventory; matches Singapore WhatsApp import).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, '_import_taiwan_stock');
const OUT = path.join(ROOT, '_import_taiwan_stock_optimized');
const REPORT = path.join(ROOT, '_import_taiwan_stock_report.json');
const MANIFEST = path.join(SRC, 'vehicle-candidates.json');

const MAX_EDGE = 1800;
const WEBP_QUALITY = 80;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const SKIP_DIR_NAMES = new Set(['_samples', 'node_modules']);

function loadEnvFallbacks() {
  for (const file of [path.join(ROOT, '.env.vercel.prod'), path.join(ROOT, '.env.local')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}

loadEnvFallbacks();

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://spmnxwhwsgpaoiklezex.supabase.co';

function looksLikeJwtOrSecret(key) {
  if (!key) return false;
  if (key.includes('[SENSITIVE]') || key.length < 40) return false;
  return true;
}

const serviceKey = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_SECRET_KEY,
  process.env.SUPABASE_SERVICE_KEY,
].find(looksLikeJwtOrSecret);
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const apiKey = serviceKey || anonKey;

if (!apiKey) {
  console.error('Missing Supabase API key');
  process.exit(1);
}

console.log('Using', serviceKey ? 'service_role/secret' : 'anon', 'key for import');

const supabase = createClient(url, apiKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function isAuctionSheetFilename(fileName) {
  const base = path.parse(fileName).name.trim();
  return (
    /^A$/i.test(base) ||
    /^A[\s._-]/i.test(base) ||
    /auction.?sheet/i.test(base) ||
    /sheet/i.test(base)
  );
}

function photoSortKey(fileName) {
  const base = path.parse(fileName).name.toUpperCase();
  if (base === 'F') return 0;
  if (base === 'B') return 1;
  if (base === 'M') return 2;
  if (/^\d+$/.test(base)) return 10 + Number(base);
  if (isAuctionSheetFilename(fileName)) return 900;
  return 100;
}

/** Parse FOB from free text (folder/file names). */
function parseFobFromText(text) {
  if (!text) return null;
  const t = String(text);
  // FOB USD 12500 / FOB$12,500 / FOB 12500USD
  let m = t.match(/FOB[\s:_-]*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(USD|JPY|\$)?/i);
  if (m) {
    const amount = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) {
      const curRaw = (m[2] || 'USD').toUpperCase().replace('$', 'USD');
      return { price_fob: amount, currency: curRaw === 'JPY' ? 'JPY' : 'USD' };
    }
  }
  m = t.match(/(USD|JPY|\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)/i);
  if (m && /FOB|PRICE|ASK/i.test(t)) {
    const amount = Number(m[2].replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) {
      const curRaw = m[1].toUpperCase().replace('$', 'USD');
      return { price_fob: amount, currency: curRaw === 'JPY' ? 'JPY' : 'USD' };
    }
  }
  return null;
}

const VIN_YEAR_MAP = {
  A: 2010,
  B: 2011,
  C: 2012,
  D: 2013,
  E: 2014,
  F: 2015,
  G: 2016,
  H: 2017,
  J: 2018,
  K: 2019,
  L: 2020,
  M: 2021,
  N: 2022,
  P: 2023,
  R: 2024,
  S: 2025,
  T: 2026,
};

function vinYear(vin) {
  const c = vin.charAt(9);
  return VIN_YEAR_MAP[c] || null;
}

function describeVin(raw) {
  const chassis_number = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const vin = chassis_number;
  const wmi = vin.slice(0, 3);
  const year = vinYear(vin);
  let make = 'Taiwan';
  let model = 'Passenger';

  // WMI / VDS mapping verified against this Taiwan lot's photos/rear badges
  if (wmi === '3TM' || vin.startsWith('3TMCZ')) {
    make = 'Toyota';
    model = 'Tacoma';
  } else if (vin.startsWith('4T1EZ')) {
    make = 'Toyota';
    model = 'Avalon';
  } else if (wmi === '4T1' || vin.startsWith('4T1')) {
    make = 'Toyota';
    model = 'Camry';
  } else if (vin.startsWith('5N1AL0')) {
    make = 'Infiniti';
    model = 'QX60';
  } else if (wmi === '5N1') {
    make = 'Nissan';
    model = 'Rogue';
  } else if (wmi === 'JTH') {
    make = 'Lexus';
    if (vin.startsWith('JTHCZ')) model = 'IS';
    else model = 'Sedan';
  } else if (wmi === 'JTJ') {
    make = 'Lexus';
    if (vin.startsWith('JTJHY')) model = 'LX 570';
    else if (vin.startsWith('JTJHZ')) model = 'RX 350L';
    else model = 'SUV';
  } else if (wmi === 'JTM') {
    make = 'Toyota';
    if (vin.startsWith('JTMRF')) model = 'RAV4';
    else model = 'SUV';
  } else if (vin.startsWith('SALGS')) {
    make = 'Land Rover';
    model = 'Range Rover';
  } else if (wmi === 'SAL') {
    make = 'Land Rover';
    model = 'Range Rover Sport';
  } else if (wmi === 'SCF') {
    make = 'Aston Martin';
    // SCF* is not always DBX — this lot's SCFSMG* unit is a Vantage coupe
    if (vin.startsWith('SCFSMG')) model = 'Vantage';
    else model = 'DBX';
  } else if (wmi === 'W1K') {
    make = 'Mercedes-Benz';
    if (vin.startsWith('W1K7X')) model = 'AMG GT 53';
    else if (vin.startsWith('W1KZF')) model = 'AMG E 53';
    else model = 'Passenger';
  } else if (wmi === 'WDC') {
    make = 'Mercedes-Benz';
    model = 'GLK';
  } else if (vin.startsWith('WDDSJ')) {
    make = 'Mercedes-Benz';
    model = 'CLA 250';
  } else if (wmi === 'WDD') {
    make = 'Mercedes-Benz';
    model = 'C-Class';
  } else if (wmi === 'WP1') {
    make = 'Porsche';
    model = 'Macan';
  } else if (vin.startsWith('WBA')) {
    make = 'BMW';
    model = 'Passenger';
  }

  const yearPart = year ? ` ${year}` : '';
  const title = `${make} ${model}${yearPart}`.trim().toUpperCase();
  return {
    kind: 'vin',
    chassis_number,
    chassis_code: null,
    stock_number: chassis_number,
    make,
    model,
    year,
    title,
    color: null,
    mileage: null,
  };
}

function describeAtw(folderName) {
  const stock_number = folderName.toUpperCase();
  const title = `TAIWAN AUCTION STOCK ${stock_number}`;
  return {
    kind: 'atw',
    chassis_number: stock_number, // stable dedupe key when VIN unknown
    chassis_code: null,
    stock_number,
    make: 'Taiwan',
    model: 'Auction Stock',
    year: null,
    title,
    color: null,
    mileage: null,
  };
}

function describeFolder(folderName) {
  const name = folderName.trim();
  if (/^ATW\d+/i.test(name)) return describeAtw(name);
  // VIN-like (with optional dash)
  const compact = name.replace(/[^A-Za-z0-9]/g, '');
  if (/^[A-HJ-NPR-Z0-9]{11,17}$/i.test(compact)) return describeVin(name);
  return describeAtw(name);
}

function listImageFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
    .filter((name) => !name.startsWith(',') && !name.startsWith('.'))
    .sort((a, b) => photoSortKey(a) - photoSortKey(b) || a.localeCompare(b));
}

function walkVehicleFolders(root) {
  /** @type {Array<{zip:string, folder:string, path:string, photos:string[], fob:ReturnType<typeof parseFobFromText>}>} */
  const found = [];
  if (!fs.existsSync(root)) return found;

  for (const zipEntry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!zipEntry.isDirectory() || SKIP_DIR_NAMES.has(zipEntry.name)) continue;
    const zipRoot = path.join(root, zipEntry.name);

    const stack = [zipRoot];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      const images = listImageFiles(dir);
      if (images.length > 0) {
        const folder = path.basename(dir);
        const fob =
          parseFobFromText(folder) ||
          parseFobFromText(dir) ||
          images.map((n) => parseFobFromText(n)).find(Boolean) ||
          null;
        found.push({
          zip: zipEntry.name,
          folder,
          path: dir,
          photos: images.map((n) => path.join(dir, n)),
          fob,
        });
      }
      for (const e of entries) {
        if (e.isDirectory() && !SKIP_DIR_NAMES.has(e.name)) {
          stack.push(path.join(dir, e.name));
        }
      }
    }
  }
  return found;
}

function mergeCandidates(raw) {
  /** @type {Map<string, typeof raw[0] & { meta: ReturnType<typeof describeFolder> }>} */
  const byKey = new Map();
  for (const item of raw) {
    const meta = describeFolder(item.folder);
    const key = (meta.chassis_number || meta.stock_number || item.folder).toUpperCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item, meta });
      continue;
    }
    // Prefer richer photo set; prefer explicit FOB
    const preferNew =
      item.photos.length > existing.photos.length ||
      (item.photos.length === existing.photos.length && item.fob && !existing.fob);
    if (preferNew) {
      byKey.set(key, {
        ...item,
        meta,
        fob: item.fob || existing.fob,
      });
    } else if (!existing.fob && item.fob) {
      existing.fob = item.fob;
    }
  }
  return [...byKey.values()].sort((a, b) => a.folder.localeCompare(b.folder));
}

async function optimizeToWebp(inputPath, outPath) {
  await sharp(inputPath, { failOn: 'none' })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outPath);
}

async function replacePhotos(vehicleId, slug, photoPaths, reportCtx) {
  // Delete existing photo rows (storage objects left; new paths are unique)
  const { data: oldPhotos } = await supabase
    .from('vehicle_photos')
    .select('id, storage_path')
    .eq('vehicle_id', vehicleId);
  if (oldPhotos?.length) {
    await supabase.from('vehicle_photos').delete().eq('vehicle_id', vehicleId);
  }

  const outDir = path.join(OUT, slug);
  fs.mkdirSync(outDir, { recursive: true });

  let publicCount = 0;
  let auctionCount = 0;
  let coverSet = false;
  const photoRows = [];

  for (let i = 0; i < photoPaths.length; i++) {
    const inputPath = photoPaths[i];
    const fileName = path.basename(inputPath);
    const auctionSheet = isAuctionSheetFilename(fileName);
    const stem = auctionSheet
      ? 'auction-sheet'
      : path.parse(fileName).name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || `photo-${i + 1}`;
    const outName = `${stem}-${i + 1}.webp`;
    const outPath = path.join(outDir, outName);

    try {
      await optimizeToWebp(inputPath, outPath);
    } catch (err) {
      reportCtx.errors.push({
        folder: reportCtx.folder,
        stage: 'optimize',
        file: fileName,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const storagePath = `${slug}/${Date.now()}-${outName}`;
    const body = fs.readFileSync(outPath);
    const { error: upErr } = await supabase.storage.from('vehicle-images').upload(storagePath, body, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });
    if (upErr) {
      reportCtx.errors.push({ folder: reportCtx.folder, stage: 'storage', file: fileName, message: upErr.message });
      continue;
    }

    const isCover = !auctionSheet && !coverSet;
    if (isCover) coverSet = true;
    photoRows.push({
      vehicle_id: vehicleId,
      storage_path: storagePath,
      is_cover: isCover,
      is_auction_sheet: auctionSheet,
      sort_order: i,
    });
    if (auctionSheet) auctionCount += 1;
    else publicCount += 1;
  }

  if (photoRows.length > 0) {
    const { error: photoErr } = await supabase.from('vehicle_photos').insert(photoRows);
    if (photoErr) {
      reportCtx.errors.push({ folder: reportCtx.folder, stage: 'photos', message: photoErr.message });
    }
  }

  return { publicCount, auctionCount, uploaded: photoRows.length };
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Missing source folder', SRC);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const raw = walkVehicleFolders(SRC);
  const candidates = mergeCandidates(raw);
  fs.writeFileSync(
    MANIFEST,
    JSON.stringify(
      candidates.map((c) => ({
        key: c.meta.chassis_number,
        zip: c.zip,
        folder: c.folder,
        photos: c.photos.length,
        fob: c.fob,
        make: c.meta.make,
        model: c.meta.model,
        year: c.meta.year,
      })),
      null,
      2
    )
  );
  const onlyRaw = process.env.ONLY_CHASSIS || process.argv.find((a) => a.startsWith('--only='))?.slice(7) || '';
  const onlyKeys = new Set(
    onlyRaw
      .split(',')
      .map((s) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .filter(Boolean)
  );
  let candidatesFiltered = candidates;
  if (onlyKeys.size > 0) {
    candidatesFiltered = candidates.filter((c) => {
      const key = String(c.meta.chassis_number || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      const stock = String(c.meta.stock_number || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      return onlyKeys.has(key) || onlyKeys.has(stock);
    });
    console.log(`ONLY_CHASSIS filter: ${onlyKeys.size} keys → ${candidatesFiltered.length} candidates`);
  }
  console.log(`Candidates: ${candidatesFiltered.length} (from ${raw.length} folders across ZIPs)`);

  // Prefer Taiwan rows; normalize chassis keys (strip dashes) for reliable dedupe.
  const { data: existingRows, error: existingErr } = await supabase
    .from('vehicles')
    .select('id, slug, chassis_number, stock_number, price_fob, currency, stock_origin')
    .eq('stock_origin', 'taiwan');
  if (existingErr) throw existingErr;

  const byChassis = new Map();
  const byStock = new Map();
  function normKey(v) {
    return String(v || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }
  for (const r of existingRows || []) {
    if (r.chassis_number) byChassis.set(normKey(r.chassis_number), r);
    if (r.stock_number) byStock.set(normKey(r.stock_number), r);
  }

  const report = {
    startedAt: new Date().toISOString(),
    created: [],
    updated: [],
    skipped: [],
    errors: [],
    zips: {},
    notes: [
      'No Excel/CSV/price sheets found inside the five ZIPs — price_fob left null unless folder/file name contained FOB.',
      'taiwan stock.zip and taiwan stock (1).zip are identical; deduped by chassis/stock.',
      'is_published=false (draft): no prior Taiwan inventory; matches Singapore WhatsApp import pattern.',
    ],
  };

  let idx = 0;
  for (const cand of candidatesFiltered) {
    idx += 1;
    const meta = cand.meta;
    const chassisKey = normKey(meta.chassis_number);
    const stockKey = normKey(meta.stock_number);
    const existing = byChassis.get(chassisKey) || byStock.get(stockKey) || null;

    const yearBit = meta.year ? String(meta.year) : null;
    const seoTitle =
      meta.kind === 'vin'
        ? `${meta.make} ${meta.model}${yearBit ? ` ${yearBit}` : ''} ${chassisKey} | Taiwan Auction | ANSHA`
        : `Taiwan Auction Stock ${stockKey} | ANSHA Trading`;
    const metaDescription =
      meta.kind === 'vin'
        ? `${meta.make} ${meta.model}${yearBit ? ` ${yearBit}` : ''} chassis ${chassisKey} — Taiwan auction stock, FOB export from ANSHA Trading.`
        : `Taiwan auction stock ${stockKey} available for export. Inquire for FOB pricing from ANSHA Trading.`;
    const keywords = [
      meta.make,
      meta.model,
      yearBit,
      chassisKey,
      stockKey,
      'taiwan',
      'auction',
      'fob',
      'export',
    ].filter(Boolean);

    const price_fob = cand.fob?.price_fob ?? null;
    const currency = cand.fob?.currency || 'USD';
    const show_price = price_fob != null && price_fob > 0;

    const vehicleFields = {
      title: meta.title,
      make: meta.make,
      model: meta.model,
      variant: null,
      year: meta.year,
      chassis_code: meta.chassis_code,
      chassis_number: meta.chassis_number,
      stock_number: meta.stock_number,
      engine_code: null,
      transmission: null,
      fuel_type: null,
      mileage: meta.mileage,
      color: meta.color,
      price: show_price ? price_fob : null,
      price_fob,
      currency,
      show_price,
      description:
        meta.kind === 'vin'
          ? `Taiwan auction stock — ${meta.make} ${meta.model}${yearBit ? ` (${yearBit})` : ''}, chassis ${chassisKey}. FOB export.`
          : `Taiwan auction stock ${stockKey}. Photos from WhatsApp/yard lot. Inquire for FOB.`,
      location: 'Taiwan',
      is_featured: false,
      stock_origin: 'taiwan',
      stock_pool: 'auction_third_party',
      stock_status: 'available',
      lifecycle_stage: 'auction',
      meta_title: seoTitle.slice(0, 120),
      meta_description: metaDescription.slice(0, 300),
      search_keywords: keywords,
      destination_markets: [],
      shipping_methods: [],
    };

    report.zips[cand.zip] = (report.zips[cand.zip] || 0) + 1;

    if (existing) {
      console.log(`[${idx}/${candidatesFiltered.length}] UPDATE ${chassisKey} id=${existing.id}`);
      const patch = {
        ...vehicleFields,
        // keep existing publish state; refresh pricing/SEO/pool
      };
      delete patch.title; // keep curated title if already set? Actually refresh title for SEO
      patch.title = vehicleFields.title;

      const { error: updErr } = await supabase.from('vehicles').update(patch).eq('id', existing.id);
      if (updErr) {
        report.errors.push({ folder: cand.folder, stage: 'update', message: updErr.message });
        console.error('FAIL update', cand.folder, updErr.message);
        continue;
      }

      const photoStats = await replacePhotos(existing.id, existing.slug || slugify(meta.title), cand.photos, {
        folder: cand.folder,
        errors: report.errors,
      });
      report.updated.push({
        folder: cand.folder,
        zip: cand.zip,
        id: existing.id,
        slug: existing.slug,
        chassis_number: chassisKey,
        ...photoStats,
        price_fob,
      });
      continue;
    }

    const slugBase = slugify(
      meta.kind === 'vin'
        ? `${meta.make}-${meta.model}-${yearBit || 'tw'}-${chassisKey.slice(-8)}`
        : `taiwan-auction-${stockKey}`
    );
    const slug = `${slugBase}-${Date.now().toString().slice(-5)}`;

    console.log(`[${idx}/${candidatesFiltered.length}] CREATE ${chassisKey}`);
    const { data: vehicle, error: vehicleErr } = await supabase
      .from('vehicles')
      .insert({
        ...vehicleFields,
        slug,
        is_published: false,
      })
      .select('id, slug, chassis_number')
      .single();

    if (vehicleErr || !vehicle) {
      // Concurrent import / missed lookup: fall back to update by chassis.
      if (vehicleErr?.message?.includes('vehicles_chassis_number_unique_idx')) {
        const { data: raced } = await supabase
          .from('vehicles')
          .select('id, slug, chassis_number, stock_number')
          .eq('chassis_number', meta.chassis_number)
          .maybeSingle();
        if (raced?.id) {
          console.log(`[${idx}/${candidatesFiltered.length}] RACE→UPDATE ${chassisKey} id=${raced.id}`);
          const { error: updErr } = await supabase.from('vehicles').update(vehicleFields).eq('id', raced.id);
          if (updErr) {
            report.errors.push({ folder: cand.folder, stage: 'race-update', message: updErr.message });
            continue;
          }
          const photoStats = await replacePhotos(raced.id, raced.slug || slug, cand.photos, {
            folder: cand.folder,
            errors: report.errors,
          });
          byChassis.set(chassisKey, raced);
          byStock.set(stockKey, raced);
          report.updated.push({
            folder: cand.folder,
            zip: cand.zip,
            id: raced.id,
            slug: raced.slug,
            chassis_number: chassisKey,
            ...photoStats,
            price_fob,
          });
          continue;
        }
      }
      report.errors.push({
        folder: cand.folder,
        stage: 'vehicle',
        message: vehicleErr?.message || 'insert failed',
      });
      console.error('FAIL vehicle', cand.folder, vehicleErr?.message);
      continue;
    }

    byChassis.set(chassisKey, vehicle);
    byStock.set(stockKey, vehicle);

    const photoStats = await replacePhotos(vehicle.id, vehicle.slug, cand.photos, {
      folder: cand.folder,
      errors: report.errors,
    });

    report.created.push({
      folder: cand.folder,
      zip: cand.zip,
      id: vehicle.id,
      slug: vehicle.slug,
      chassis_number: vehicle.chassis_number,
      ...photoStats,
      price_fob,
    });
  }

  report.finishedAt = new Date().toISOString();
    report.summary = {
    candidates: candidatesFiltered.length,
    created: report.created.length,
    updated: report.updated.length,
    skipped: report.skipped.length,
    errors: report.errors.length,
    photosUploaded:
      report.created.reduce((s, r) => s + (r.uploaded || 0), 0) +
      report.updated.reduce((s, r) => s + (r.uploaded || 0), 0),
    withFob: [...report.created, ...report.updated].filter((r) => r.price_fob != null).length,
    zips: report.zips,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\nDone', report.summary);
  console.log('Report', REPORT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * One-off Japan stock vehicle import from extracted ZIP folders.
 * Usage: node --env-file=.env.vercel.prod scripts/import-japan-stock-vehicles.mjs
 *
 * Source: ANSHA/_import_japan_stock/<chassis>/ with F/B/M/PixPin photos + optional A.png auction sheets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, '_import_japan_stock');
const OUT = path.join(ROOT, '_import_japan_stock_optimized');
const REPORT = path.join(ROOT, '_import_japan_stock_report.json');

const MAX_EDGE = 1600;
const WEBP_QUALITY = 78;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

function loadEnvFallbacks() {
  const candidates = [path.join(ROOT, '.env.vercel.prod'), path.join(ROOT, '.env.local')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]]) continue;
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

const serviceKeyCandidates = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_SECRET_KEY,
  process.env.SUPABASE_SERVICE_KEY,
];
const serviceKey = serviceKeyCandidates.find(looksLikeJwtOrSecret);
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const apiKey = serviceKey || anonKey;

if (!apiKey) {
  console.error('Missing Supabase API key (service role preferred; anon OK with temp import policies).');
  process.exit(1);
}

console.log('Using', serviceKey ? 'service_role/secret' : 'anon', 'key for import');

const supabase = createClient(url, apiKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Basename exactly A, or A followed by separator — auction sheet only. */
function isAuctionSheetFilename(fileName) {
  const base = path.parse(fileName).name.trim();
  return /^A$/i.test(base) || /^A[\s._-]/i.test(base);
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Chassis prefix → make/model for common JP auction codes in this ZIP. */
const CHASSIS_MAP = {
  BP5P: { make: 'Honda', model: 'Freed' },
  BP8P: { make: 'Honda', model: 'Freed' },
  BP8R: { make: 'Honda', model: 'Freed' },
  DJ5FS: { make: 'Mazda', model: 'Demio' },
  DJLFS: { make: 'Mazda', model: 'Demio' },
  DM8P: { make: 'Mazda', model: 'CX-30' },
  DM8R: { make: 'Mazda', model: 'CX-30' },
  DMEJ3P: { make: 'Mazda', model: 'MX-30' },
  DMEJ3R: { make: 'Mazda', model: 'MX-30' },
  KE2AW: { make: 'Mazda', model: 'CX-5' },
  KE2FW: { make: 'Mazda', model: 'CX-5' },
  KF2P: { make: 'Mazda', model: 'CX-5' },
  KFEP: { make: 'Mazda', model: 'CX-5' },
  KH3R3P: { make: 'Mazda', model: 'CX-60' },
  // MXPK11 / MXPK11IS / MXPK16 = 2nd-gen Toyota Aqua (not Raize)
  MXPK11: { make: 'Toyota', model: 'Aqua' },
  MXPK11IS: { make: 'Toyota', model: 'Aqua' },
  MXPK16: { make: 'Toyota', model: 'Aqua' },
};

function decodeBmwFromVin(vin) {
  const upper = vin.toUpperCase();
  // Best-effort labels when only VIN folder names are available.
  if (upper.startsWith('WBA12')) return { make: 'BMW', model: '2 Series' };
  if (upper.startsWith('WBA42')) return { make: 'BMW', model: 'X1' };
  return { make: 'BMW', model: 'Passenger' };
}

function describeFolder(folderName) {
  if (/^WBA/i.test(folderName)) {
    const { make, model } = decodeBmwFromVin(folderName);
    return {
      chassis_code: null,
      chassis_number: folderName.toUpperCase(),
      stock_number: folderName.toUpperCase(),
      make,
      model,
      title: `${make} ${model} ${folderName.toUpperCase()}`.toUpperCase(),
    };
  }

  const dash = folderName.indexOf('-');
  const chassis_code = dash > 0 ? folderName.slice(0, dash).toUpperCase() : folderName.toUpperCase();
  const chassis_number = folderName.toUpperCase();
  const mapped = CHASSIS_MAP[chassis_code];
  const make = mapped?.make || 'Japan';
  const model = mapped?.model || chassis_code;
  const title = `${make} ${model} ${chassis_number}`.toUpperCase();
  return {
    chassis_code,
    chassis_number,
    stock_number: chassis_number,
    make,
    model,
    title,
  };
}

function photoSortKey(fileName) {
  const base = path.parse(fileName).name.toUpperCase();
  if (base === 'F') return 0;
  if (base === 'B') return 1;
  if (base === 'M') return 2;
  if (isAuctionSheetFilename(fileName)) return 900;
  return 100;
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

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Missing source folder', SRC);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const folders = fs
    .readdirSync(SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const { data: existingRows, error: existingErr } = await supabase
    .from('vehicles')
    .select('id, chassis_number, stock_number');
  if (existingErr) throw existingErr;

  const byChassis = new Map(
    (existingRows || [])
      .filter((r) => r.chassis_number)
      .map((r) => [String(r.chassis_number).toUpperCase(), r.id])
  );

  const report = { startedAt: new Date().toISOString(), imported: [], skipped: [], errors: [] };

  for (const folder of folders) {
    const folderPath = path.join(SRC, folder);
    const meta = describeFolder(folder);
    const chassisKey = meta.chassis_number.toUpperCase();

    if (byChassis.has(chassisKey)) {
      report.skipped.push({ folder, reason: 'chassis_number already exists', id: byChassis.get(chassisKey) });
      console.log('SKIP existing', chassisKey);
      continue;
    }

    const files = fs
      .readdirSync(folderPath)
      .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
      .filter((name) => !name.startsWith(',')) // ignore corrupt ",.png"
      .sort((a, b) => photoSortKey(a) - photoSortKey(b) || a.localeCompare(b));

    if (files.length === 0) {
      report.skipped.push({ folder, reason: 'no images' });
      continue;
    }

    const slug = slugify(`${meta.title}-${Date.now().toString().slice(-6)}`);
    const vehiclePayload = {
      title: meta.title,
      slug,
      make: meta.make,
      model: meta.model,
      variant: null,
      year: null,
      chassis_code: meta.chassis_code,
      chassis_number: meta.chassis_number,
      stock_number: meta.stock_number,
      engine_code: null,
      transmission: null,
      fuel_type: null,
      mileage: null,
      color: null,
      price: null,
      currency: 'USD',
      show_price: false,
      description: `Japan stock import — chassis ${meta.chassis_number}.`,
      location: 'Japan',
      is_published: true,
      is_featured: false,
      stock_origin: 'japan',
      stock_status: 'available',
      lifecycle_stage: 'unassigned',
      meta_title: `${meta.title} | ANSHA Trading`,
      meta_description: `Japan stock ${meta.make} ${meta.model} (${meta.chassis_number}) available for export from ANSHA.`,
      search_keywords: [meta.make, meta.model, meta.chassis_number, meta.chassis_code, 'japan'].filter(Boolean),
      destination_markets: [],
      shipping_methods: [],
    };

    const { data: vehicle, error: vehicleErr } = await supabase
      .from('vehicles')
      .insert(vehiclePayload)
      .select('id, slug, chassis_number')
      .single();

    if (vehicleErr || !vehicle) {
      report.errors.push({ folder, stage: 'vehicle', message: vehicleErr?.message || 'insert failed' });
      console.error('FAIL vehicle', folder, vehicleErr?.message);
      continue;
    }

    byChassis.set(chassisKey, vehicle.id);
    const outDir = path.join(OUT, folder);
    fs.mkdirSync(outDir, { recursive: true });

    let publicCount = 0;
    let auctionCount = 0;
    let coverSet = false;
    const photoRows = [];

    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];
      const auctionSheet = isAuctionSheetFilename(fileName);
      const inputPath = path.join(folderPath, fileName);
      const stem = auctionSheet
        ? 'auction-sheet'
        : path.parse(fileName).name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || `photo-${i + 1}`;
      const outName = `${stem}-${i + 1}.webp`;
      const outPath = path.join(outDir, outName);

      try {
        await optimizeToWebp(inputPath, outPath);
      } catch (err) {
        report.errors.push({
          folder,
          stage: 'optimize',
          file: fileName,
          message: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      const storagePath = `${vehicle.slug}/${Date.now()}-${outName}`;
      const body = fs.readFileSync(outPath);
      const { error: upErr } = await supabase.storage.from('vehicle-images').upload(storagePath, body, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false,
      });

      if (upErr) {
        report.errors.push({ folder, stage: 'storage', file: fileName, message: upErr.message });
        continue;
      }

      const isCover = !auctionSheet && !coverSet;
      if (isCover) coverSet = true;

      photoRows.push({
        vehicle_id: vehicle.id,
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
        report.errors.push({ folder, stage: 'photos', message: photoErr.message });
        console.error('FAIL photos', folder, photoErr.message);
      }
    }

    const entry = {
      folder,
      id: vehicle.id,
      chassis_number: vehicle.chassis_number,
      slug: vehicle.slug,
      publicPhotos: publicCount,
      auctionSheets: auctionCount,
    };
    report.imported.push(entry);
    console.log(
      `OK ${meta.chassis_number} public=${publicCount} auction=${auctionCount} id=${vehicle.id}`
    );
  }

  report.finishedAt = new Date().toISOString();
  report.summary = {
    folders: folders.length,
    imported: report.imported.length,
    skipped: report.skipped.length,
    errors: report.errors.length,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\nDone', report.summary);
  console.log('Report', REPORT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

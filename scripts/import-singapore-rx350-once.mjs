/**
 * One-off: Singapore stock Lexus RX350 2016 from WhatsApp ZIP photos.
 * Chassis JTJBZMCA402009697 — imported 2026-09-22 as draft
 *   id 85490eb7-37c1-477e-84c4-0b68e3b99d5d (idempotent: exits if chassis exists).
 *
 * Usage:
 *   Expand ZIP to %TEMP%\ansha-sg-rx350-import (or set SG_RX350_SRC)
 *   node --env-file=.env.local scripts/import-singapore-rx350-once.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (or equivalent secret) for inserts.
 * Do not commit .env / media; keep ZIP local-only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SRC =
  process.env.SG_RX350_SRC ||
  path.join(process.env.TEMP || process.env.TMP || '/tmp', 'ansha-sg-rx350-import');
const OUT = path.join(ROOT, '_import_sg_rx350_optimized');

const MAX_EDGE = 1600;
const WEBP_QUALITY = 78;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const CHASSIS = 'JTJBZMCA402009697';

function loadEnvFallbacks() {
  const candidates = [path.join(ROOT, '.env.local'), path.join(ROOT, '.env.vercel.prod')];
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
  'https://ydrnilquojvalhgifest.supabase.co';

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

console.log('Using', serviceKey ? 'service_role/secret' : 'anon', 'key');
console.log('Source', SRC);

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

/** Skip WhatsApp noise: .txt, .opus, stickers, tiny files, non-images. */
function isUsableImage(filePath, name) {
  const ext = path.extname(name).toLowerCase();
  if (!IMAGE_EXT.has(ext)) return false;
  if (/^STK-/i.test(name)) return false;
  if (/whatsapp.*(audio|document|video)/i.test(name)) return false;
  const stat = fs.statSync(filePath);
  if (stat.size < 8_000) return false;
  return true;
}

function whatsappSortKey(name) {
  const m = name.match(/\((\d+)\)\.[^.]+$/i);
  if (m) return parseInt(m[1], 10);
  return 0;
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

  const { data: existing, error: existingErr } = await supabase
    .from('vehicles')
    .select('id, slug, chassis_number, is_published')
    .ilike('chassis_number', CHASSIS)
    .maybeSingle();

  if (existingErr) throw existingErr;
  if (existing) {
    console.log('Chassis already exists', existing);
    process.exit(0);
  }

  const files = fs
    .readdirSync(SRC)
    .filter((name) => isUsableImage(path.join(SRC, name), name))
    .sort((a, b) => whatsappSortKey(a) - whatsappSortKey(b) || a.localeCompare(b));

  if (files.length === 0) {
    console.error('No usable images in', SRC);
    process.exit(1);
  }

  console.log(`Found ${files.length} images`);

  const title = 'Lexus RX350 2016 Luxury AT SR';
  const slug = slugify(`${title}-${Date.now().toString().slice(-6)}`);
  const description = [
    'Singapore stock — Lexus RX350 Luxury AT SR.',
    'Registration: 2016/04.',
    'Engine: 3456 cc Petrol · Automatic · RHD · 2WD.',
    'Gray · 5 seats · 5 doors.',
    `Chassis ${CHASSIS}. Mileage 50,602 km.`,
    'FOB USD 10,300.',
  ].join(' ');

  const vehiclePayload = {
    title,
    slug,
    make: 'Lexus',
    model: 'RX350',
    variant: 'Luxury AT SR',
    year: 2016,
    chassis_code: null,
    chassis_number: CHASSIS,
    stock_number: CHASSIS,
    engine_code: '3456cc',
    transmission: 'Automatic',
    fuel_type: 'Petrol',
    mileage: 50602,
    color: 'Gray',
    vehicle_class: 'passenger',
    price: 10300,
    price_fob: 10300,
    currency: 'USD',
    show_price: true,
    description,
    location: 'Singapore',
    is_published: false,
    is_featured: false,
    stock_origin: 'singapore',
    stock_pool: 'owned',
    stock_status: 'available',
    lifecycle_stage: 'unassigned',
    meta_title: `${title} | ANSHA Trading`,
    meta_description:
      'Singapore stock Lexus RX350 2016 Luxury AT SR — FOB USD 10,300. Gray, Automatic, Petrol, RHD.',
    search_keywords: [
      'Lexus',
      'RX350',
      'Luxury AT SR',
      '2016',
      CHASSIS,
      'Singapore',
      'RHD',
      '2WD',
      'Petrol',
      'Automatic',
      'Gray',
    ],
    destination_markets: [],
    shipping_methods: [],
  };

  const { data: vehicle, error: vehicleErr } = await supabase
    .from('vehicles')
    .insert(vehiclePayload)
    .select('id, slug, is_published, chassis_number')
    .single();

  if (vehicleErr || !vehicle) {
    console.error('Vehicle insert failed', vehicleErr?.message);
    process.exit(1);
  }

  console.log('Created vehicle', vehicle.id);

  fs.mkdirSync(OUT, { recursive: true });
  const photoRows = [];
  let coverSet = false;

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const inputPath = path.join(SRC, fileName);
    const stem =
      path.parse(fileName).name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || `photo-${i + 1}`;
    const outName = `${stem}-${i + 1}.webp`;
    const outPath = path.join(OUT, outName);

    try {
      await optimizeToWebp(inputPath, outPath);
    } catch (err) {
      console.error('Optimize failed', fileName, err instanceof Error ? err.message : err);
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
      console.error('Upload failed', fileName, upErr.message);
      continue;
    }

    const isCover = !coverSet;
    if (isCover) coverSet = true;

    photoRows.push({
      vehicle_id: vehicle.id,
      storage_path: storagePath,
      is_cover: isCover,
      is_auction_sheet: false,
      sort_order: i,
    });
    console.log(`OK photo ${i + 1}/${files.length}${isCover ? ' (cover)' : ''}`);
  }

  if (photoRows.length > 0) {
    const { error: photoErr } = await supabase.from('vehicle_photos').insert(photoRows);
    if (photoErr) {
      console.error('Photo rows failed', photoErr.message);
      process.exit(1);
    }
  }

  console.log(
    JSON.stringify(
      {
        id: vehicle.id,
        slug: vehicle.slug,
        chassis_number: vehicle.chassis_number,
        is_published: vehicle.is_published,
        photo_count: photoRows.length,
        admin_url: `/admin/vehicles/${vehicle.id}`,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Japan WhatsApp key-fob / car-electronics parts import for production Supabase.
 * Same pipeline as import-whatsapp-parts-dubai.mjs (sharp → WebP → part-images + SEO).
 * Usage: node --env-file=.tmp-wa-keys/.env.import scripts/import-whatsapp-parts-keys.mjs
 *    or: node --env-file=.env.local scripts/import-whatsapp-parts-keys.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WORK = path.join(ROOT, '.tmp-wa-keys');
const SRC = path.join(WORK, 'src');
const OUT = path.join(WORK, 'optimized');
const CATALOG = path.join(WORK, 'catalog.json');
const REPORT = path.join(WORK, 'import-report.json');

const MAX_EDGE = 1600;
const WEBP_QUALITY = 78;

function loadEnvFallbacks() {
  const candidates = [
    path.join(WORK, '.env.import'),
    path.join(ROOT, '.env.local'),
  ];
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

function pickKey(...candidates) {
  for (const v of candidates) {
    if (!v) continue;
    const t = v.trim();
    if (!t || t === '[SENSITIVE]' || t.toLowerCase() === 'your-service-role-key') continue;
    if (t.length < 40) continue; // JWT / sb keys are long
    return t;
  }
  return null;
}

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://ydrnilquojvalhgifest.supabase.co';
const serviceKey = pickKey(
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_SECRET_KEY,
  process.env.SUPABASE_SERVICE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  process.env.SUPABASE_ANON_KEY,
);

if (!serviceKey) {
  console.error('Missing Supabase key (service role preferred; anon OK with temp import policies).');
  process.exit(1);
}
console.log('Using Supabase key length', serviceKey.length, 'url', url);

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function metaFor(item) {
  const title = `${item.name} | ANSHA Trading`;
  const desc =
    item.description?.slice(0, 155) ||
    `Used ${item.name} in Japan stock at ANSHA. Ask for quote — quantity 1.`;
  return { meta_title: title, meta_description: desc };
}

async function optimizeImage(file, crop, outName) {
  const inputPath = path.join(SRC, file);
  if (!fs.existsSync(inputPath)) throw new Error(`Missing source image ${file}`);
  let pipeline = sharp(inputPath, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  if (crop) {
    const left = Math.max(0, Math.floor(w * crop.left));
    const top = Math.max(0, Math.floor(h * crop.top));
    const width = Math.min(w - left, Math.floor(w * crop.width));
    const height = Math.min(h - top, Math.floor(h * crop.height));
    pipeline = sharp(inputPath, { failOn: 'none' }).rotate().extract({ left, top, width, height });
  }
  const outPath = path.join(OUT, outName);
  await pipeline
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outPath);
  return outPath;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

  const { data: categories, error: catErr } = await supabase
    .from('categories')
    .select('id, slug');
  if (catErr) throw catErr;
  const catBySlug = Object.fromEntries((categories || []).map((c) => [c.slug, c.id]));

  const { data: existing } = await supabase.from('parts').select('part_code');
  const existingCodes = new Set((existing || []).map((r) => r.part_code));

  const created = [];
  const skipped = [];
  const errors = [];

  for (const item of catalog) {
    if (existingCodes.has(item.part_code)) {
      skipped.push({ part_code: item.part_code, reason: 'part_code already exists' });
      continue;
    }

    const baseSlug = slugify(item.name);
    let slug = `${baseSlug}-${slugify(item.part_code).slice(0, 24)}`;
    const seo = metaFor(item);
    const category_id = catBySlug[item.category] || null;

    const row = {
      part_code: item.part_code,
      name: item.name,
      slug,
      category_id,
      brand: item.brand,
      part_number: item.part_number,
      oem_number: item.oem_number,
      condition: 'used',
      price: 0,
      currency: 'USD',
      quantity: 1,
      location: 'Japan — WhatsApp key-fob intake Sep 2026',
      description: item.description,
      is_published: true,
      is_featured: false,
      show_price: false,
      stock_origin: 'japan',
      stock_status: 'available',
      meta_title: seo.meta_title,
      meta_description: seo.meta_description,
      search_keywords: item.keywords || [],
      manufacturer_part_number: item.oem_number || item.part_number,
      interchange_numbers: [],
      superseded_part_numbers: [],
      export_markets: ['UAE', 'Africa', 'Middle East', 'Japan'],
    };

    let part = null;
    const { data: inserted, error: partErr } = await supabase
      .from('parts')
      .insert(row)
      .select('id, part_code, slug, name')
      .single();

    if (partErr) {
      if (partErr.message?.includes('slug') || partErr.code === '23505') {
        row.slug = `${slug}-${Date.now().toString(36).slice(-5)}`;
        const retry = await supabase.from('parts').insert(row).select('id, part_code, slug, name').single();
        if (retry.error) {
          errors.push({ part_code: item.part_code, error: retry.error.message });
          continue;
        }
        part = retry.data;
      } else {
        errors.push({ part_code: item.part_code, error: partErr.message });
        continue;
      }
    } else {
      part = inserted;
    }

    const partId = part.id;
    existingCodes.add(item.part_code);

    if (item.compat?.length) {
      const compatRows = item.compat
        .filter((c) => c.make)
        .map((c) => ({
          part_id: partId,
          make: c.make,
          model: c.model || 'Various',
          variant: c.variant || null,
          chassis_code: c.chassis_code || null,
          engine_code: c.engine_code || null,
          year_from: c.year_from || null,
          year_to: c.year_to || null,
        }));
      if (compatRows.length) {
        const { error: cErr } = await supabase.from('part_compatibility').insert(compatRows);
        if (cErr) errors.push({ part_code: item.part_code, error: `compat: ${cErr.message}` });
      }
    }

    const photoPaths = [];
    for (let i = 0; i < (item.images || []).length; i++) {
      const img = item.images[i];
      const outName = `${item.part_code.replace(/[^a-zA-Z0-9_-]/g, '_')}-${i + 1}.webp`;
      try {
        const outPath = await optimizeImage(img.file, img.crop, outName);
        const buf = fs.readFileSync(outPath);
        const storagePath = `${item.part_code}/${Date.now()}-${outName}`;
        const { error: upErr } = await supabase.storage
          .from('part-images')
          .upload(storagePath, buf, {
            contentType: 'image/webp',
            cacheControl: '31536000',
            upsert: false,
          });
        if (upErr) {
          errors.push({ part_code: item.part_code, error: `upload ${img.file}: ${upErr.message}` });
          continue;
        }
        photoPaths.push(storagePath);
        const { error: phErr } = await supabase.from('part_photos').insert({
          part_id: partId,
          storage_path: storagePath,
          is_cover: i === 0,
          sort_order: i,
        });
        if (phErr) errors.push({ part_code: item.part_code, error: `photo row: ${phErr.message}` });
      } catch (e) {
        errors.push({ part_code: item.part_code, error: `image ${img.file}: ${e.message}` });
      }
    }

    created.push({
      id: partId,
      part_code: item.part_code,
      name: item.name,
      slug: part.slug || slug,
      photos: photoPaths.length,
    });
    console.log(`OK ${item.part_code} — ${item.name} (${photoPaths.length} photos)`);
  }

  const report = {
    created_count: created.length,
    skipped_count: skipped.length,
    error_count: errors.length,
    created,
    skipped,
    errors,
    skipped_source_photos: [
      {
        file: 'Toyota/Honda pile (kf-03) — Honda units',
        reason:
          'Pile photo shows Toyota/Lexus smart keys with NZE141 tags; no clear Honda-branded remotes for a separate Honda listing',
      },
      {
        file: 'bulk brand piles (VW/Toyota/Nissan/BMW/Suzuki/etc.)',
        reason:
          'Curated into representative brand/type listings (qty 1 each) with more-available-on-inquiry notes — same pattern as Dubai bulk coils',
      },
    ],
    image_pipeline: {
      format: 'webp',
      max_edge: MAX_EDGE,
      quality: WEBP_QUALITY,
      bucket: 'part-images',
      source: 'own WhatsApp warehouse photos (not BeForward CDN)',
    },
    confirm: {
      show_price: false,
      price: 0,
      stock_origin: 'japan',
      condition: 'used',
      stock_status: 'available',
      is_published: true,
      quantity: 1,
      ask_for_quote: true,
      seo: 'meta_title, meta_description, descriptive slug, search_keywords',
      category: 'electrical (Car Electronics / Keyless Entry style naming in titles)',
    },
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\nDone.', report.created_count, 'created,', report.skipped_count, 'skipped,', report.error_count, 'errors');
  console.log('Report:', REPORT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Dubai WhatsApp stock import — vehicles + parts (Sep 2026 yard / warehouse photos).
 * Usage: node --env-file=.env.vercel.prod scripts/import-dubai-whatsapp-sep20-stock.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WORK = path.join(ROOT, '.tmp-dubai-wa-sep20');
const OUT = path.join(WORK, 'optimized');
const REPORT = path.join(WORK, 'import-report.json');
const ASSETS = path.join(
  process.env.USERPROFILE || '',
  '.cursor',
  'projects',
  'h-ansha2',
  'assets'
);

const MAX_EDGE = 1600;
const WEBP_QUALITY = 78;

function loadEnvFallbacks() {
  for (const file of [
    path.join(ROOT, '.env.vercel.prod'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.tmp-wa-dubai', '.env.import'),
  ]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
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

console.log('Using', serviceKey ? 'service_role/secret' : 'anon', 'key');

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

function asset(...names) {
  for (const name of names) {
    const p = path.join(ASSETS, name);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Missing asset among: ${names.join(' | ')}`);
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

const VEHICLES = [
  {
    key: 'fielder-hybrid-1341672',
    title: 'Toyota Corolla Fielder Hybrid Black',
    make: 'Toyota',
    model: 'Corolla Fielder',
    variant: 'Hybrid',
    year: null,
    color: 'Black',
    stock_number: '1341672',
    vehicle_class: 'passenger',
    fuel_type: 'Hybrid',
    description:
      'Dubai yard stock — black Toyota Corolla Fielder Hybrid (E160 wagon). Windshield auction/stock sheet 1341672; yellow UAE marking 216890 also visible. Visual ID preferred over nearby ground tag reading “TOYOTA CAMRY HYBRID / 1332128” (misplaced). Ask for quote.',
    keywords: [
      'Toyota',
      'Corolla Fielder',
      'Fielder Hybrid',
      'Black',
      '1341672',
      '216890',
      'Dubai stock',
      'hybrid wagon',
      'E160',
    ],
    photos: [
      {
        file: 'c__Users_ATJ_AppData_Roaming_Cursor_User_workspaceStorage_e1fc1512931e50b426ae49c13e92e58d_images_WhatsApp_Image_2026-09-18_at_1.59.25_AM-f5c3e2db-90fa-4f71-8131-cd55d1ce3bd2.jpg',
        alt: 'Black Toyota Corolla Fielder Hybrid front three-quarter Dubai stock sheet 1341672',
      },
      {
        file: 'c__Users_ATJ_AppData_Roaming_Cursor_User_workspaceStorage_e1fc1512931e50b426ae49c13e92e58d_images_WhatsApp_Image_2026-09-18_at_1.59.23_AM__3_-c61fac53-02a4-4ce7-a252-c8d382a1a771.jpg',
        alt: 'Black Toyota Corolla Fielder Hybrid front Jan Jahan Motors UAE 216890',
      },
      {
        file: 'c__Users_ATJ_AppData_Roaming_Cursor_User_workspaceStorage_e1fc1512931e50b426ae49c13e92e58d_images_WhatsApp_Image_2026-09-18_at_1.59.28_AM-ce09b611-c0e4-4601-884a-cd63963d9059.jpg',
        alt: 'Black Toyota Corolla Fielder Hybrid rear with Hybrid Synergy Drive badge',
      },
      {
        file: 'c__Users_ATJ_AppData_Roaming_Cursor_User_workspaceStorage_e1fc1512931e50b426ae49c13e92e58d_images_WhatsApp_Image_2026-09-18_at_1.59.28_AM__1_-b2cf7376-2066-40d0-afa5-4e9f378af355.jpg',
        alt: 'Black Toyota Corolla Fielder rear badge COROLLA FIELDER Dubai yard',
      },
    ],
  },
  {
    key: 'hilux-gr-sport',
    title: 'Toyota Hilux GR Sport Black',
    make: 'Toyota',
    model: 'Hilux',
    variant: 'GR Sport',
    year: null,
    color: 'Black',
    stock_number: 'DXB-HILUX-GR-SEP20',
    vehicle_class: 'commercial_truck',
    fuel_type: null,
    description:
      'Dubai / Sharjah yard stock — black Toyota Hilux GR Sport double-cab with GR SPORT bed decal, sport bar, black alloys, red mudflaps. Ask for quote.',
    keywords: [
      'Toyota',
      'Hilux',
      'GR Sport',
      'Black',
      'pickup',
      'Dubai stock',
      '4x4',
    ],
    photos: [
      {
        file: 'c__Users_ATJ_AppData_Roaming_Cursor_User_workspaceStorage_e1fc1512931e50b426ae49c13e92e58d_images_WhatsApp_Image_2026-09-18_at_1.59.38_AM-b6a41515-2a73-49f2-bc73-7c4266b3a06c.jpg',
        alt: 'Black Toyota Hilux GR Sport front Dubai stock',
      },
      {
        file: 'c__Users_ATJ_AppData_Roaming_Cursor_User_workspaceStorage_e1fc1512931e50b426ae49c13e92e58d_images_WhatsApp_Image_2026-09-18_at_1.59.38_AM__1_-0f1b6f45-07d9-4020-8525-fddf154003a4.jpg',
        alt: 'Black Toyota Hilux GR Sport front three-quarter Dubai stock',
      },
      {
        file: 'c__Users_ATJ_AppData_Roaming_Cursor_User_workspaceStorage_e1fc1512931e50b426ae49c13e92e58d_images_WhatsApp_Image_2026-09-18_at_1.59.38_AM__2_-3acd2693-85e2-41ca-a2b6-6e101e5822d7.jpg',
        alt: 'Black Toyota Hilux GR Sport rear side GR SPORT decal Dubai stock',
      },
    ],
  },
];

const PARTS = [
  {
    part_code: 'DXB-WHL-VOLK-FORGED-16',
    name: 'RAYS Volk Racing Forged 10-Spoke Black Alloy 16"',
    category: 'suspension',
    brand: 'RAYS Volk Racing',
    part_number: null,
    oem_number: null,
    description:
      'Used RAYS Volk Racing forged 10-spoke gloss black alloy with red outer pinstripe and RAYS center cap. Spoke marked FORGED; lip marked RAYS ENG. / VOLK RACING. Mounted tire ~225/55R16 95V. Single wheel shown (not sold as a set of 4 unless confirmed). Other wheels in photo (VW alloy, Bridgestone steel, Seiberling) are background only. Dubai stock. Ask for quote.',
    keywords: [
      'RAYS',
      'Volk Racing',
      'forged',
      '10-spoke',
      '16 inch',
      '225/55R16',
      'Dubai',
      'alloy wheel',
    ],
    compat: [],
    images: [
      {
        file: 'c__Users_ATJ_AppData_Roaming_Cursor_User_workspaceStorage_e1fc1512931e50b426ae49c13e92e58d_images_WhatsApp_Image_2026-09-18_at_1.59.38_AM__4_-c7d229dd-c764-4368-adb7-5da3a2cfef53.jpg',
        alt: 'RAYS Volk Racing forged black 10-spoke alloy with 225/55R16 tire Dubai stock',
      },
    ],
  },
  {
    part_code: 'DXB-ENG-STI-EJ-BAY',
    name: 'Subaru WRX STI Engine Bay / EJ with STI Intercooler',
    category: 'engines',
    brand: 'Subaru',
    part_number: null,
    oem_number: null,
    description:
      'Dubai parts stock photo — Subaru WRX STI engine bay with top-mount intercooler (red STI logo), red intake manifold, and boxer EJ-series layout. Exterior not shown; listed as engine/bay assembly for inquiry, not a complete vehicle. Ask for quote.',
    keywords: [
      'Subaru',
      'WRX STI',
      'STI',
      'EJ',
      'engine',
      'intercooler',
      'Dubai',
      'boxer',
    ],
    compat: [
      { make: 'Subaru', model: 'WRX STI', engine_code: 'EJ' },
      { make: 'Subaru', model: 'Impreza', variant: 'WRX STI' },
    ],
    images: [
      {
        file: 'c__Users_ATJ_AppData_Roaming_Cursor_User_workspaceStorage_e1fc1512931e50b426ae49c13e92e58d_images_WhatsApp_Image_2026-09-18_at_1.59.38_AM__3_-7355a72c-d6d2-43d8-ab6f-7af95265a93a.jpg',
        alt: 'Subaru WRX STI EJ engine bay top-mount intercooler Dubai parts stock',
      },
    ],
  },
];

const SKIP_PARTS_NOTE = [
  {
    part_code: 'ANS-WHL-24540R19-001',
    reason:
      'Already in Dubai parts (2 photos): Used 19" Alloy Wheel with Aptany Sport 245/40ZR19 — matches WhatsApp 1.59.39 AM __5/__6 Aptany Sport Macro 245/40ZR19 98W XL set; not duplicated',
  },
];

async function importVehicles(report) {
  const { data: existing } = await supabase
    .from('vehicles')
    .select('id, stock_number, title')
    .eq('stock_origin', 'dubai');
  const byStock = new Map(
    (existing || [])
      .filter((r) => r.stock_number)
      .map((r) => [String(r.stock_number).toUpperCase(), r])
  );

  for (const v of VEHICLES) {
    const stockKey = String(v.stock_number).toUpperCase();
    if (byStock.has(stockKey)) {
      report.vehicles.skipped.push({
        key: v.key,
        reason: 'stock_number exists',
        id: byStock.get(stockKey).id,
      });
      continue;
    }

    const slug = slugify(`${v.title}-${Date.now().toString().slice(-6)}`);
    const meta_title = `${v.title} | ANSHA Trading`;
    const meta_description = `Dubai stock ${v.make} ${v.model}${v.variant ? ` ${v.variant}` : ''}${v.color ? ` ${v.color}` : ''} available for export from ANSHA. Ask for quote.`;

    const payload = {
      title: v.title,
      slug,
      make: v.make,
      model: v.model,
      variant: v.variant,
      year: v.year,
      color: v.color,
      chassis_code: null,
      chassis_number: null,
      stock_number: v.stock_number,
      engine_code: null,
      transmission: null,
      fuel_type: v.fuel_type,
      mileage: null,
      price: null,
      currency: 'USD',
      show_price: false,
      description: v.description,
      location: 'Dubai — WhatsApp intake Sep 2026',
      is_published: true,
      is_featured: false,
      stock_origin: 'dubai',
      stock_status: 'available',
      lifecycle_stage: 'unassigned',
      vehicle_class: v.vehicle_class,
      meta_title,
      meta_description,
      search_keywords: v.keywords,
      destination_markets: [],
      shipping_methods: [],
    };

    const { data: vehicle, error: vehicleErr } = await supabase
      .from('vehicles')
      .insert(payload)
      .select('id, slug, title, stock_number')
      .single();

    if (vehicleErr || !vehicle) {
      report.vehicles.errors.push({
        key: v.key,
        stage: 'vehicle',
        message: vehicleErr?.message || 'insert failed',
      });
      console.error('FAIL vehicle', v.key, vehicleErr?.message);
      continue;
    }

    byStock.set(stockKey, vehicle);
    const outDir = path.join(OUT, 'vehicles', v.key);
    fs.mkdirSync(outDir, { recursive: true });

    const photoRows = [];
    let photoCount = 0;
    for (let i = 0; i < v.photos.length; i++) {
      const ph = v.photos[i];
      const inputPath = asset(
        ph.file,
        // duplicated long-prefix copies from Cursor workspaceStorage path
        `C__Users_ATJ_.cursor_projects_h-ansha2_assets_${ph.file}`
      );
      const outName = `photo-${i + 1}.webp`;
      const outPath = path.join(outDir, outName);
      try {
        await optimizeToWebp(inputPath, outPath);
      } catch (err) {
        report.vehicles.errors.push({
          key: v.key,
          stage: 'optimize',
          file: ph.file,
          message: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      const storagePath = `${vehicle.slug}/${Date.now()}-${outName}`;
      const body = fs.readFileSync(outPath);
      const { error: upErr } = await supabase.storage
        .from('vehicle-images')
        .upload(storagePath, body, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: false,
        });
      if (upErr) {
        report.vehicles.errors.push({
          key: v.key,
          stage: 'storage',
          file: ph.file,
          message: upErr.message,
        });
        continue;
      }

      photoRows.push({
        vehicle_id: vehicle.id,
        storage_path: storagePath,
        is_cover: i === 0,
        is_auction_sheet: false,
        sort_order: i,
      });
      photoCount += 1;
      // SEO alt carried in keywords/description (no alt column on vehicle_photos)
      void ph.alt;
    }

    if (photoRows.length) {
      const { error: photoErr } = await supabase.from('vehicle_photos').insert(photoRows);
      if (photoErr) {
        report.vehicles.errors.push({
          key: v.key,
          stage: 'photos',
          message: photoErr.message,
        });
      }
    }

    report.vehicles.created.push({
      id: vehicle.id,
      title: vehicle.title,
      slug: vehicle.slug,
      stock_number: vehicle.stock_number,
      photos: photoCount,
      ocr: {
        stock_sheet: v.stock_number === '1341672' ? '1341672' : null,
        uae_mark: v.key.includes('fielder') ? '216890' : null,
        ignored_ground_tag: v.key.includes('fielder')
          ? '1332128 TOYOTA CAMRY HYBRID (misplaced)'
          : null,
      },
    });
    console.log(`OK vehicle ${vehicle.title} photos=${photoCount}`);
  }
}

async function importParts(report) {
  const { data: categories, error: catErr } = await supabase
    .from('categories')
    .select('id, slug');
  if (catErr) throw catErr;
  const catBySlug = Object.fromEntries((categories || []).map((c) => [c.slug, c.id]));

  const { data: existing } = await supabase.from('parts').select('part_code');
  const existingCodes = new Set((existing || []).map((r) => r.part_code));

  for (const note of SKIP_PARTS_NOTE) {
    report.parts.skipped.push(note);
  }

  for (const item of PARTS) {
    if (existingCodes.has(item.part_code)) {
      report.parts.skipped.push({
        part_code: item.part_code,
        reason: 'part_code already exists',
      });
      continue;
    }

    const baseSlug = slugify(item.name);
    let slug = `${baseSlug}-${slugify(item.part_code).slice(0, 24)}`;
    const meta_title = `${item.name} | ANSHA Trading`;
    const meta_description =
      item.description?.slice(0, 155) ||
      `Used ${item.name} in Dubai stock at ANSHA. Ask for quote.`;

    const row = {
      part_code: item.part_code,
      name: item.name,
      slug,
      category_id: catBySlug[item.category] || null,
      brand: item.brand,
      part_number: item.part_number,
      oem_number: item.oem_number,
      condition: 'used',
      price: 0,
      currency: 'USD',
      quantity: 1,
      location: 'Dubai — WhatsApp intake Sep 2026',
      description: item.description,
      is_published: true,
      is_featured: false,
      show_price: false,
      stock_origin: 'dubai',
      stock_status: 'available',
      meta_title,
      meta_description,
      search_keywords: item.keywords || [],
      manufacturer_part_number: item.oem_number || item.part_number,
      interchange_numbers: [],
      superseded_part_numbers: [],
      export_markets: ['UAE', 'Africa', 'Middle East'],
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
        const retry = await supabase
          .from('parts')
          .insert(row)
          .select('id, part_code, slug, name')
          .single();
        if (retry.error) {
          report.parts.errors.push({
            part_code: item.part_code,
            error: retry.error.message,
          });
          continue;
        }
        part = retry.data;
      } else {
        report.parts.errors.push({
          part_code: item.part_code,
          error: partErr.message,
        });
        continue;
      }
    } else {
      part = inserted;
    }

    existingCodes.add(item.part_code);

    if (item.compat?.length) {
      const compatRows = item.compat
        .filter((c) => c.make)
        .map((c) => ({
          part_id: part.id,
          make: c.make,
          model: c.model || null,
          variant: c.variant || null,
          chassis_code: c.chassis_code || null,
          engine_code: c.engine_code || null,
          year_from: c.year_from || null,
          year_to: c.year_to || null,
        }));
      if (compatRows.length) {
        const { error: cErr } = await supabase.from('part_compatibility').insert(compatRows);
        if (cErr) {
          report.parts.errors.push({
            part_code: item.part_code,
            error: `compat: ${cErr.message}`,
          });
        }
      }
    }

    const outDir = path.join(OUT, 'parts', item.part_code);
    fs.mkdirSync(outDir, { recursive: true });
    let photos = 0;
    for (let i = 0; i < item.images.length; i++) {
      const img = item.images[i];
      const inputPath = asset(img.file);
      const outName = `${item.part_code}-${i + 1}.webp`;
      const outPath = path.join(outDir, outName);
      try {
        await optimizeToWebp(inputPath, outPath);
      } catch (e) {
        report.parts.errors.push({
          part_code: item.part_code,
          error: `optimize: ${e.message}`,
        });
        continue;
      }
      const buf = fs.readFileSync(outPath);
      const storagePath = `${item.part_code}/${Date.now()}-${outName}`;
      const { error: upErr } = await supabase.storage.from('part-images').upload(storagePath, buf, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false,
      });
      if (upErr) {
        report.parts.errors.push({
          part_code: item.part_code,
          error: `upload: ${upErr.message}`,
        });
        continue;
      }
      const { error: phErr } = await supabase.from('part_photos').insert({
        part_id: part.id,
        storage_path: storagePath,
        is_cover: i === 0,
        sort_order: i,
      });
      if (phErr) {
        report.parts.errors.push({
          part_code: item.part_code,
          error: `photo row: ${phErr.message}`,
        });
        continue;
      }
      photos += 1;
      void img.alt;
    }

    report.parts.created.push({
      id: part.id,
      part_code: item.part_code,
      name: item.name,
      slug: part.slug,
      photos,
    });
    console.log(`OK part ${item.part_code} — ${item.name} (${photos} photos)`);
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(ASSETS)) {
    console.error('Assets folder missing', ASSETS);
    process.exit(1);
  }

  const report = {
    startedAt: new Date().toISOString(),
    vehicles: { created: [], skipped: [], errors: [] },
    parts: { created: [], skipped: [], errors: [] },
    ambiguities: [
      'Photo batch labeled “Aqua” for one front shot — visual ID is Corolla Fielder Hybrid wagon (long roof + Hybrid fender badge), not Aqua hatch; no separate Aqua vehicle created.',
      'Ground tag 1332128 “TOYOTA CAMRY HYBRID” ignored — body/badge is Corolla Fielder; windshield sheet 1341672 used as stock_number.',
      'Years unknown (no readable year on sheets) — titles omit year.',
      'Subaru WRX STI under-hood photo imported as Dubai PART (engine bay), not a vehicle.',
      'Aptany 245/40ZR19 already existed as ANS-WHL-24540R19-001 — skipped duplicate.',
    ],
  };

  await importVehicles(report);
  await importParts(report);

  report.finishedAt = new Date().toISOString();
  report.summary = {
    vehicles_created: report.vehicles.created.length,
    vehicles_skipped: report.vehicles.skipped.length,
    vehicles_errors: report.vehicles.errors.length,
    parts_created: report.parts.created.length,
    parts_skipped: report.parts.skipped.length,
    parts_errors: report.parts.errors.length,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\nDone', report.summary);
  console.log('Report', REPORT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

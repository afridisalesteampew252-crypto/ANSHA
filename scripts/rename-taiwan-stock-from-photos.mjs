/**
 * One-off: rename Taiwan auction stock from photo/VIN evidence.
 * Preserves public slugs. Does NOT invent FOB - leaves price null when unknown.
 *
 * Evidence sources:
 * - VIN folders under _import_taiwan_stock (make/model corrections + color from photos)
 * - ATW front/rear photos (make/model/color); year left null unless plate/sticker year present
 *
 * Usage: node scripts/rename-taiwan-stock-from-photos.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT = path.join(ROOT, '_import_taiwan_rename_report.json');

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

const supabase = createClient(url, apiKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * stock_number → update fields.
 * year: only when VIN year-code or windshield year sticker / exact badge evidence.
 * color/make/model: from photos (logos, rear badges) or corrected VIN decode.
 * price_fob intentionally omitted (null) - no price sheets in ZIPs/Excel.
 */
const UPDATES = {
  // --- VIN lot (TAIWAN 17 OCTOBER 2025) ---
  '3TMCZ5AN7HM118436': {
    make: 'Toyota',
    model: 'Tacoma',
    year: 2017,
    color: 'White',
    evidence: 'VIN + windshield 2017 sticker + front photo Toyota Tacoma',
  },
  '4T1EZ1FB3MU066577': {
    make: 'Toyota',
    model: 'Avalon',
    year: 2021,
    color: 'Silver',
    evidence: 'VIN year M=2021; rear badge AVALON XSE (was wrongly Camry)',
  },
  '5N1AL0MM9EC532518': {
    make: 'Infiniti',
    model: 'QX60',
    year: 2014,
    color: 'White',
    evidence: 'VIN year E=2014; Infiniti headrest/grille photos (was wrongly Nissan Rogue)',
  },
  JTHCZ1D21J5015727: {
    make: 'Lexus',
    model: 'IS',
    year: 2018,
    color: 'White',
    evidence: 'VIN year J=2018; windshield 18 sticker + Lexus IS photos',
  },
  JTJHY7AX8F4168306: {
    make: 'Lexus',
    model: 'LX 570',
    year: 2015,
    color: 'Black',
    evidence: 'VIN year F=2015; LX body/interior photos (was wrongly RX)',
  },
  JTJHZKFA9N2039960: {
    make: 'Lexus',
    model: 'RX 350L',
    year: 2022,
    color: 'Dark Grey',
    evidence: 'VIN year N=2022; rear badge RX 350L (was wrongly NX)',
  },
  JTMRF4DV9A5034848: {
    make: 'Toyota',
    model: 'RAV4',
    year: 2010,
    color: 'Red',
    evidence: 'VIN year A=2010; Sport badge + red exterior photos',
  },
  SALGS5RE4KA565037: {
    make: 'Land Rover',
    model: 'Range Rover',
    year: 2019,
    color: 'White',
    evidence: 'VIN year K=2019; windshield 19 + Range Rover badge (was wrongly Sport)',
  },
  SCFSMGAW7LGN04549: {
    make: 'Aston Martin',
    model: 'Vantage',
    year: 2020,
    color: 'Navy Blue',
    evidence: 'VIN year L=2020; coupe exterior + Vantage interior (was wrongly DBX)',
  },
  W1K7X6BB9NA049152: {
    make: 'Mercedes-Benz',
    model: 'AMG GT 53',
    year: 2022,
    color: 'Silver',
    evidence: 'VIN year N=2022; rear badges AMG / GT 53 (was wrongly C-Class)',
  },
  W1KZF6BB5NB066262: {
    make: 'Mercedes-Benz',
    model: 'AMG E 53',
    year: 2022,
    color: 'Grey',
    evidence: 'VIN year N=2022; E-Class AMG sedan photos + AMG interior (was wrongly GLC)',
  },
  WDCGG8JB2DG148747: {
    make: 'Mercedes-Benz',
    model: 'GLK',
    year: 2013,
    color: 'Black',
    evidence: 'VIN year D=2013; windshield 2013 sticker + GLK photos',
  },
  WDDSJ4GB4JN534701: {
    make: 'Mercedes-Benz',
    model: 'CLA 250',
    year: 2018,
    color: 'Black',
    evidence: 'VIN year J=2018; rear badges CLA 250 4MATIC (was wrongly C-Class)',
  },
  WP1AB2A57JLB32921: {
    make: 'Porsche',
    model: 'Macan',
    year: 2018,
    color: 'Dark Blue',
    evidence: 'VIN year J=2018; Porsche Macan front photos',
  },

  // --- ATW lots (photo ID only; year null - no VIN/year sticker) ---
  ATW00127: {
    make: 'Toyota',
    model: 'RAV4',
    year: null,
    color: 'Black',
    mileage: 204104,
    evidence: 'F/M photos: Toyota RAV4 black; odometer 204,104 km',
  },
  ATW00128: {
    make: 'Toyota',
    model: 'RAV4 Hybrid',
    year: null,
    color: 'Red',
    evidence: 'F photo: Toyota RAV4 Hybrid, dark metallic red, Hybrid badge',
  },
  ATW00129: {
    make: 'Toyota',
    model: 'RAV4',
    year: null,
    color: 'Dark Grey',
    evidence: 'F photo: Toyota RAV4 dark grey',
  },
  ATW00130: {
    make: 'Toyota',
    model: 'RAV4',
    year: null,
    color: 'White',
    evidence: 'F photo: Toyota RAV4 white',
  },
  ATW00131: {
    make: 'Honda',
    model: 'Fit',
    year: null,
    color: 'White',
    evidence: 'F photo: Honda Fit white',
  },
  ATW00132: {
    make: 'Honda',
    model: 'Fit',
    year: null,
    color: 'White',
    evidence: 'F photo: Honda Fit white (older gen)',
  },
  ATW00133: {
    make: 'Honda',
    model: 'Fit',
    year: null,
    color: 'Dark Grey',
    evidence: 'F photo: Honda Fit dark grey',
  },
  ATW00134: {
    make: 'Nissan',
    model: 'Juke',
    year: null,
    color: 'White',
    evidence: 'F photo: Nissan Juke white',
  },
  ATW00135: {
    make: 'Nissan',
    model: 'Juke',
    year: null,
    color: 'Grey',
    evidence: 'F photo: Nissan Juke grey (2nd gen)',
  },
  ATW00136: {
    make: 'Nissan',
    model: 'Juke',
    year: null,
    color: 'Blue',
    evidence: 'F photo: Nissan Juke blue',
  },
  ATW00137: {
    make: 'Mazda',
    model: 'Mazda3',
    year: null,
    color: 'Champagne',
    evidence: 'F photo: Mazda3 hatchback champagne/sand',
  },
  ATW00138: {
    make: 'Mazda',
    model: 'Mazda3',
    year: null,
    color: 'White',
    evidence: 'F photo: Mazda3 sedan white',
  },
  ATW00139: {
    make: 'Mazda',
    model: 'Mazda3',
    year: null,
    color: 'White',
    evidence: 'F photo: Mazda3 hatchback white',
  },
  ATW00140: {
    make: 'Honda',
    model: 'CR-V',
    year: null,
    color: 'White',
    evidence: 'F photo: Honda CR-V white; plate BRS-0870',
  },
  ATW00141: {
    make: 'Honda',
    model: 'CR-V',
    year: null,
    color: 'Dark Grey',
    evidence: 'F photo: Honda CR-V dark grey',
  },
  ATW00142: {
    make: 'Honda',
    model: 'CR-V',
    year: null,
    color: 'Dark Grey',
    evidence: 'F photo: Honda CR-V dark grey',
  },
  ATW00143: {
    make: 'Honda',
    model: 'CR-V',
    year: null,
    color: 'White',
    evidence: 'F photo: Honda CR-V white',
  },
  ATW00144: {
    make: 'Toyota',
    model: 'Alphard Hybrid',
    year: null,
    color: 'Black',
    evidence: 'F photo: Toyota Alphard Hybrid black; Hybrid fender badge',
  },
  ATW00145: {
    make: 'Toyota',
    model: 'Alphard',
    year: null,
    color: 'Silver',
    evidence: 'F photo: Toyota Alphard silver',
  },
  ATW00146: {
    make: 'Toyota',
    model: 'Alphard Hybrid',
    year: null,
    color: 'Black',
    evidence: 'F photo: Toyota Alphard Hybrid black; Hybrid fender badge',
  },
  ATW00147: {
    make: 'Ford',
    model: 'Escape',
    year: null,
    color: 'Dark Grey',
    evidence: 'F photo: Ford Escape dark grey',
  },
  ATW00148: {
    make: 'Mercedes-Benz',
    model: 'S 500',
    year: null,
    color: 'Black',
    evidence: 'F/B photos: Mercedes S-Class; rear badge S 500',
  },
  ATW00149: {
    make: 'Mercedes-Benz',
    model: 'C-Class Estate',
    year: null,
    color: 'White',
    evidence: 'F/B photos: Mercedes C-Class estate white',
  },
  ATW00150: {
    make: 'Toyota',
    model: 'Corolla Sport',
    year: null,
    color: 'White',
    evidence: 'F photo: Toyota Corolla Sport white; plate BUJ-3937',
  },
  ATW00151: {
    make: 'Toyota',
    model: 'Corolla Sport',
    year: null,
    color: 'Red',
    evidence: 'F photo: Toyota Corolla Hatchback/Sport red',
  },
  ATW00152: {
    make: 'Toyota',
    model: 'Corolla Sport',
    year: null,
    color: 'Dark Blue',
    evidence: 'F photo: Toyota Corolla Sport dark teal/blue',
  },
  ATW00231: {
    make: 'Porsche',
    model: 'Cayman',
    year: null,
    color: 'White',
    evidence: 'F/B photos: Porsche Cayman white; mid-engine hatch',
  },
  ATW00232: {
    make: 'Mercedes-Benz',
    model: 'GLC Coupe',
    year: null,
    color: 'Black',
    evidence: 'F/B photos: Mercedes GLC Coupe; rear badge GLC 300 4MATIC',
  },
  ATW00233: {
    make: 'Mercedes-Benz',
    model: 'CLA-Class',
    year: null,
    color: 'White',
    evidence: 'F photo: Mercedes CLA white, AMG Line grille',
  },
  ATW00234: {
    make: 'Kia',
    model: 'Stonic',
    year: null,
    color: 'White',
    evidence: 'F photo: Kia Stonic white',
  },
  ATW00235: {
    make: 'Toyota',
    model: 'Corolla Sport',
    year: null,
    color: 'White',
    evidence: 'F photo: Toyota Corolla Sport white',
  },
  ATW00236: {
    make: 'Mercedes-Benz',
    model: 'C-Class',
    year: null,
    color: 'White',
    evidence: 'F photo: Mercedes C-Class sedan white',
  },
  ATW00237: {
    make: 'Lexus',
    model: 'UX',
    year: null,
    color: 'White',
    evidence: 'F photo: Lexus UX white',
  },
  ATW00238: {
    make: 'Lexus',
    model: 'ES',
    year: null,
    color: 'Silver',
    evidence: 'F photo: Lexus ES silver/grey',
  },
  ATW00239: {
    make: 'Lexus',
    model: 'IS',
    year: null,
    color: 'White',
    evidence: 'F photo: Lexus IS white, F Sport-style mesh grille',
  },
  ATW00240: {
    make: 'Hyundai',
    model: 'Venue',
    year: null,
    color: 'Yellow',
    evidence: 'F photo: Hyundai Venue pale yellow',
  },
  ATW00241: {
    make: 'Toyota',
    model: 'C-HR',
    year: null,
    color: 'Silver',
    evidence: 'F photo: Toyota C-HR silver',
  },
  ATW00242: {
    make: 'Nissan',
    model: 'Kicks',
    year: null,
    color: 'White',
    evidence: 'F photo: Nissan Kicks white',
  },
  ATW00243: {
    make: 'Mercedes-Benz',
    model: 'CLA-Class',
    year: null,
    color: 'White',
    evidence: 'F photo: Mercedes CLA AMG white (matte/satin)',
  },
  ATW00244: {
    make: 'Mercedes-Benz',
    model: 'E200',
    year: null,
    color: 'Black',
    evidence: 'F/B photos: Mercedes E-Class; rear badge E200',
  },
  ATW00245: {
    make: 'Audi',
    model: 'A4',
    year: null,
    color: 'Black',
    evidence: 'F/B photos: Audi A4 black; rear badge A4',
  },
  ATW00247: {
    make: 'Mercedes-Benz',
    model: 'E200',
    year: null,
    color: 'Black',
    evidence: 'F/B photos: Mercedes E-Class; rear badge E200',
  },
  ATW00248: {
    make: 'Audi',
    model: 'A4',
    year: null,
    color: 'Black',
    evidence: 'F/B photos: Audi A4 S line black; rear badge A4',
  },
  ATW00249: {
    make: 'Mercedes-Benz',
    model: 'CLA-Class',
    year: null,
    color: 'White',
    evidence: 'F photo: Mercedes CLA white; TURBO 4MATIC fender badge',
  },
};

function buildTitle({ make, model, year, color }) {
  return [make, model, year, color].filter((v) => v != null && v !== '').join(' ').toUpperCase();
}

function buildSeo(meta, chassisKey, stockKey) {
  const yearBit = meta.year ? String(meta.year) : null;
  const titleCore = [meta.make, meta.model, yearBit, meta.color].filter(Boolean).join(' ');
  const seoTitle = `${titleCore} ${stockKey || chassisKey} | Taiwan Auction | ANSHA`.slice(0, 120);
  const metaDescription =
    `${titleCore} - Taiwan auction stock ${stockKey || chassisKey}. Inquire for FOB pricing from ANSHA Trading.`.slice(
      0,
      300
    );
  const search_keywords = [
    meta.make,
    meta.model,
    yearBit,
    meta.color,
    chassisKey,
    stockKey,
    'taiwan',
    'auction',
    'fob',
    'export',
  ].filter(Boolean);
  return { seoTitle, metaDescription, search_keywords };
}

async function main() {
  const { data: rows, error } = await supabase
    .from('vehicles')
    .select(
      'id, slug, stock_number, chassis_number, title, make, model, year, color, mileage, price_fob, show_price, meta_title, meta_description'
    )
    .eq('stock_origin', 'taiwan')
    .eq('stock_pool', 'auction_third_party');

  if (error) throw error;

  const report = {
    startedAt: new Date().toISOString(),
    updated: [],
    skipped: [],
    incomplete: [],
    errors: [],
    notes: [
      'Slugs preserved (no redirects).',
      'FOB left null for all - no price sheets in five ZIPs or Downloads Excel.',
      'ATW year left null - photo generation ranges only, not exact years.',
      'Several VIN models corrected from rear badges / photos vs original WMI heuristics.',
    ],
  };

  for (const row of rows || []) {
    const key = String(row.stock_number || row.chassis_number || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const patchSrc = UPDATES[key];
    if (!patchSrc) {
      report.skipped.push({ id: row.id, stock_number: row.stock_number, reason: 'no mapping' });
      continue;
    }

    const before = {
      title: row.title,
      make: row.make,
      model: row.model,
      year: row.year,
      color: row.color,
      mileage: row.mileage,
      price_fob: row.price_fob,
      slug: row.slug,
    };

    const title = buildTitle(patchSrc);
    const chassisKey = String(row.chassis_number || key)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const stockKey = String(row.stock_number || key)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const { seoTitle, metaDescription, search_keywords } = buildSeo(patchSrc, chassisKey, stockKey);

    const patch = {
      title,
      make: patchSrc.make,
      model: patchSrc.model,
      year: patchSrc.year,
      color: patchSrc.color,
      description: patchSrc.year
        ? `Taiwan auction stock - ${patchSrc.make} ${patchSrc.model} (${patchSrc.year})${patchSrc.color ? `, ${patchSrc.color}` : ''}, chassis ${chassisKey}. Inquire for FOB.`
        : `Taiwan auction stock - ${patchSrc.make} ${patchSrc.model}${patchSrc.color ? `, ${patchSrc.color}` : ''} (${stockKey}). Photos from Taiwan auction lot. Inquire for FOB.`,
      meta_title: seoTitle,
      meta_description: metaDescription,
      search_keywords,
      // keep ask-for-quote; do not invent prices
      price_fob: null,
      price: null,
      show_price: false,
    };
    if (patchSrc.mileage != null) patch.mileage = patchSrc.mileage;

    const { error: updErr } = await supabase.from('vehicles').update(patch).eq('id', row.id);
    if (updErr) {
      report.errors.push({ id: row.id, stock_number: key, message: updErr.message });
      console.error('FAIL', key, updErr.message);
      continue;
    }

    const full =
      Boolean(patchSrc.make) &&
      Boolean(patchSrc.model) &&
      patchSrc.year != null &&
      Boolean(patchSrc.color);

    report.updated.push({
      id: row.id,
      stock_number: key,
      slug: row.slug,
      before,
      after: {
        title,
        make: patchSrc.make,
        model: patchSrc.model,
        year: patchSrc.year,
        color: patchSrc.color,
        mileage: patchSrc.mileage ?? row.mileage,
        price_fob: null,
      },
      fullFields: full,
      evidence: patchSrc.evidence,
    });
    console.log(
      `${full ? 'FULL' : 'PARTIAL'} ${key}: ${before.title} → ${title}`
    );
  }

  const incomplete = report.updated.filter((u) => !u.fullFields);
  report.incomplete = incomplete.map((u) => ({
    stock_number: u.stock_number,
    missing: [
      !u.after.make && 'make',
      !u.after.model && 'model',
      u.after.year == null && 'year',
      !u.after.color && 'color',
      'price_fob',
    ].filter(Boolean),
  }));
  report.finishedAt = new Date().toISOString();
  report.summary = {
    totalTaiwan: (rows || []).length,
    updated: report.updated.length,
    fullMakeModelYearColor: report.updated.filter((u) => u.fullFields).length,
    withYear: report.updated.filter((u) => u.after.year != null).length,
    withColor: report.updated.filter((u) => u.after.color).length,
    withFob: 0,
    incompleteCount: report.incomplete.length,
    errors: report.errors.length,
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\nSummary', report.summary);
  console.log('Report', REPORT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

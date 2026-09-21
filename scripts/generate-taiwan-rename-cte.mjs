/**
 * Generate compact CTE UPDATE for Taiwan rename via Supabase MCP.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const renameSrc = fs.readFileSync(path.join(ROOT, 'scripts/rename-taiwan-stock-from-photos.mjs'), 'utf8');
const m = renameSrc.match(/const UPDATES = (\{[\s\S]*?\n\});/);
if (!m) throw new Error('UPDATES not found');
const UPDATES = new Function(`return (${m[1]})`)();

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function buildTitle({ make, model, year, color }) {
  return [make, model, year, color].filter((v) => v != null && v !== '').join(' ').toUpperCase();
}

const valueRows = [];
for (const [key, u] of Object.entries(UPDATES)) {
  const title = buildTitle(u);
  const yearSql = u.year == null ? 'NULL::int' : `${u.year}::int`;
  const mileageSql = u.mileage == null ? 'NULL::int' : `${u.mileage}::int`;
  const yearBit = u.year ? String(u.year) : null;
  const titleCore = [u.make, u.model, yearBit, u.color].filter(Boolean).join(' ');
  const seoTitle = `${titleCore} ${key} | Taiwan Auction | ANSHA`.slice(0, 120);
  const metaDescription =
    `${titleCore} - Taiwan auction stock ${key}. Inquire for FOB pricing from ANSHA Trading.`.slice(0, 300);
  const keywords = [u.make, u.model, yearBit, u.color, key, 'taiwan', 'auction', 'fob', 'export'].filter(Boolean);
  const desc = u.year
    ? `Taiwan auction stock - ${u.make} ${u.model} (${u.year})${u.color ? `, ${u.color}` : ''}, chassis ${key}. Inquire for FOB.`
    : `Taiwan auction stock - ${u.make} ${u.model}${u.color ? `, ${u.color}` : ''} (${key}). Photos from Taiwan auction lot. Inquire for FOB.`;

  valueRows.push(
    `('${key}', '${esc(title)}', '${esc(u.make)}', '${esc(u.model)}', ${yearSql}, '${esc(u.color)}', ${mileageSql}, '${esc(desc)}', '${esc(seoTitle)}', '${esc(metaDescription)}', ARRAY[${keywords.map((k) => `'${esc(k)}'`).join(',')}]::text[])`
  );
}

const sql = `WITH data (
  stock_key, title, make, model, year, color, mileage, description, meta_title, meta_description, search_keywords
) AS (
  VALUES
  ${valueRows.join(',\n  ')}
)
UPDATE vehicles v
SET
  title = d.title,
  make = d.make,
  model = d.model,
  year = d.year,
  color = d.color,
  mileage = COALESCE(d.mileage, v.mileage),
  description = d.description,
  meta_title = d.meta_title,
  meta_description = d.meta_description,
  search_keywords = d.search_keywords,
  price_fob = NULL,
  price = NULL,
  show_price = false
FROM data d
WHERE v.stock_origin = 'taiwan'
  AND v.stock_pool = 'auction_third_party'
  AND regexp_replace(upper(coalesce(v.stock_number, v.chassis_number, '')), '[^A-Z0-9]', '', 'g') = d.stock_key;

SELECT count(*) AS updated
FROM vehicles
WHERE stock_origin = 'taiwan'
  AND stock_pool = 'auction_third_party'
  AND make <> 'Taiwan'
  AND color IS NOT NULL;`;

fs.writeFileSync(path.join(ROOT, '_tmp_taiwan_rename_cte.sql'), sql);
console.log('bytes', sql.length, 'rows', valueRows.length);

// Also write smaller chunks for MCP execute_sql
const entries = Object.entries(UPDATES);
const chunkSize = 15;
for (let c = 0; c < Math.ceil(entries.length / chunkSize); c++) {
  const slice = entries.slice(c * chunkSize, (c + 1) * chunkSize);
  const chunkValues = [];
  for (const [key, u] of slice) {
    const title = buildTitle(u);
    const yearSql = u.year == null ? 'NULL::int' : `${u.year}::int`;
    const mileageSql = u.mileage == null ? 'NULL::int' : `${u.mileage}::int`;
    const yearBit = u.year ? String(u.year) : null;
    const titleCore = [u.make, u.model, yearBit, u.color].filter(Boolean).join(' ');
    const seoTitle = `${titleCore} ${key} | Taiwan Auction | ANSHA`.slice(0, 120);
    const metaDescription =
      `${titleCore} - Taiwan auction stock ${key}. Inquire for FOB pricing from ANSHA Trading.`.slice(0, 300);
    const keywords = [u.make, u.model, yearBit, u.color, key, 'taiwan', 'auction', 'fob', 'export'].filter(Boolean);
    const desc = u.year
      ? `Taiwan auction stock - ${u.make} ${u.model} (${u.year})${u.color ? `, ${u.color}` : ''}, chassis ${key}. Inquire for FOB.`
      : `Taiwan auction stock - ${u.make} ${u.model}${u.color ? `, ${u.color}` : ''} (${key}). Photos from Taiwan auction lot. Inquire for FOB.`;
    chunkValues.push(
      `('${key}', '${esc(title)}', '${esc(u.make)}', '${esc(u.model)}', ${yearSql}, '${esc(u.color)}', ${mileageSql}, '${esc(desc)}', '${esc(seoTitle)}', '${esc(metaDescription)}', ARRAY[${keywords.map((k) => `'${esc(k)}'`).join(',')}]::text[])`
    );
  }
  const chunkSql = `WITH data (
  stock_key, title, make, model, year, color, mileage, description, meta_title, meta_description, search_keywords
) AS (
  VALUES
  ${chunkValues.join(',\n  ')}
)
UPDATE vehicles v
SET
  title = d.title,
  make = d.make,
  model = d.model,
  year = d.year,
  color = d.color,
  mileage = COALESCE(d.mileage, v.mileage),
  description = d.description,
  meta_title = d.meta_title,
  meta_description = d.meta_description,
  search_keywords = d.search_keywords,
  price_fob = NULL,
  price = NULL,
  show_price = false
FROM data d
WHERE v.stock_origin = 'taiwan'
  AND v.stock_pool = 'auction_third_party'
  AND regexp_replace(upper(coalesce(v.stock_number, v.chassis_number, '')), '[^A-Z0-9]', '', 'g') = d.stock_key;`;
  fs.writeFileSync(path.join(ROOT, `_tmp_tw_cte_${c}.sql`), chunkSql);
  console.log('chunk', c, 'rows', slice.length, 'bytes', chunkSql.length);
}

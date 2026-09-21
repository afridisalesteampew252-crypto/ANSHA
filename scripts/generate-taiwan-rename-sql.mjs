/**
 * Generate SQL for Taiwan rename (service-role / MCP apply).
 * Usage: node scripts/generate-taiwan-rename-sql.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Re-read UPDATES from rename script via Function
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

const stmts = [];
for (const [key, u] of Object.entries(UPDATES)) {
  const title = buildTitle(u);
  const yearBit = u.year ? String(u.year) : null;
  const titleCore = [u.make, u.model, yearBit, u.color].filter(Boolean).join(' ');
  const seoTitle = `${titleCore} ${key} | Taiwan Auction | ANSHA`.slice(0, 120);
  const desc = u.year
    ? `Taiwan auction stock - ${u.make} ${u.model} (${u.year})${u.color ? `, ${u.color}` : ''}, chassis ${key}. Inquire for FOB.`
    : `Taiwan auction stock - ${u.make} ${u.model}${u.color ? `, ${u.color}` : ''} (${key}). Photos from Taiwan auction lot. Inquire for FOB.`;
  const metaDescription =
    `${titleCore} - Taiwan auction stock ${key}. Inquire for FOB pricing from ANSHA Trading.`.slice(0, 300);
  const keywords = [u.make, u.model, yearBit, u.color, key, 'taiwan', 'auction', 'fob', 'export'].filter(Boolean);

  const sets = [
    `title = '${esc(title)}'`,
    `make = '${esc(u.make)}'`,
    `model = '${esc(u.model)}'`,
    u.year == null ? 'year = null' : `year = ${u.year}`,
    `color = '${esc(u.color)}'`,
    `description = '${esc(desc)}'`,
    `meta_title = '${esc(seoTitle)}'`,
    `meta_description = '${esc(metaDescription)}'`,
    `search_keywords = ARRAY[${keywords.map((k) => `'${esc(k)}'`).join(',')}]`,
    'price_fob = null',
    'price = null',
    'show_price = false',
  ];
  if (u.mileage != null) sets.push(`mileage = ${u.mileage}`);

  stmts.push(
    `UPDATE vehicles SET ${sets.join(', ')} WHERE stock_origin = 'taiwan' AND stock_pool = 'auction_third_party' AND regexp_replace(upper(coalesce(stock_number, chassis_number, '')), '[^A-Z0-9]', '', 'g') = '${key}';`
  );
}

const out = path.join(ROOT, '_tmp_taiwan_rename.sql');
fs.writeFileSync(out, stmts.join('\n') + '\n');
console.log(`Wrote ${stmts.length} statements → ${out}`);

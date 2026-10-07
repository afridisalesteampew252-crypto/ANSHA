import { parseCatalogTags } from './part-identity';
import { normalizeVehicleModel } from './vehicle-freight';

export type CatalogImportRow = Record<string, string | number | boolean | null>;
export type ImportedCompatibility = {
  make: string; model: string; variant: string | null; chassis_code: string | null;
  engine_code: string | null; year_from: number | null; year_to: number | null;
};
const text = (value: unknown) => String(value ?? '').trim();
const nullableText = (value: unknown) => text(value) || null;

export function importNumber(value: unknown, label: string): number | null {
  if (value == null || text(value) === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} must be a finite non-negative number`);
  return amount;
}

/** Missing workbook columns never clear an existing catalog value. */
export function optionalCatalogFields(row: CatalogImportRow, kind: 'part' | 'vehicle'): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const identityColumns = kind === 'part'
    ? ['brand', 'part_number', 'oem_number', 'manufacturer_part_number', 'category_id']
    : ['variant', 'stock_number', 'chassis_code', 'engine_code', 'transmission', 'fuel_type', 'color'];
  for (const column of ['description', 'location', 'meta_title', 'meta_description', ...identityColumns]) {
    if (column in row) fields[column] = nullableText(row[column]);
  }
  for (const column of ['price', 'price_fob', 'price_cf', 'price_cif', ...(kind === 'vehicle' ? ['mileage', 'year'] : [])]) {
    if (column in row) fields[column] = importNumber(row[column], column);
  }
  for (const column of ['search_keywords', ...(kind === 'part' ? ['interchange_numbers', 'superseded_part_numbers', 'export_markets'] : ['shipping_methods'])]) {
    if (column in row) fields[column] = parseCatalogTags(row[column]);
  }
  if (kind === 'vehicle' && 'destination_markets' in row) {
    fields.destination_markets = parseCatalogTags(row.destination_markets).map((code) => code.toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code));
  }
  for (const column of ['is_published', 'is_featured', 'show_price']) {
    if (column in row) fields[column] = row[column] === true || /^(true|1|yes)$/i.test(text(row[column]));
  }
  if ('currency' in row && text(row.currency)) fields.currency = text(row.currency).toUpperCase();
  if (kind === 'part' && 'quantity' in row) {
    const quantity = importNumber(row.quantity, 'quantity') ?? 0;
    if (!Number.isInteger(quantity)) throw new Error('quantity must be a whole number');
    fields.quantity = quantity;
  }
  return fields;
}

/** Supports a JSON compatibility array, or a single make/model row. Omission preserves fitment. */
export function importPartCompatibility(row: CatalogImportRow): ImportedCompatibility[] | undefined {
  const jsonColumn = 'compatible_vehicles' in row ? 'compatible_vehicles' : 'compatibility' in row ? 'compatibility' : null;
  if (!jsonColumn && !('compatible_make' in row) && !('compatible_model' in row) && !('make' in row) && !('model' in row)) return undefined;
  let values: unknown;
  if (jsonColumn) {
    const value = text(row[jsonColumn]);
    try { values = value ? JSON.parse(value) : []; } catch { throw new Error(`${jsonColumn} must be a JSON array of make/model entries`); }
  } else {
    const make = nullableText(row.compatible_make ?? row.make);
    const model = nullableText(row.compatible_model ?? row.model);
    values = make || model ? [{ ...row, make, model }] : [];
  }
  if (!Array.isArray(values) || values.length > 100) throw new Error('Compatible vehicles must be an array with at most 100 entries');
  const entries = values.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each compatible vehicle needs a make and model');
    const item = value as Record<string, unknown>;
    const make = text(item.make); const model = text(item.model);
    if (!make || !model) throw new Error('Each compatible vehicle needs a make and model');
    const yearFrom = importNumber(item.year_from, 'year_from');
    const yearTo = importNumber(item.year_to, 'year_to');
    if ([yearFrom, yearTo].some((year) => year != null && (!Number.isInteger(year) || year < 1900 || year > 2200))) throw new Error('Fitment years must be whole years between 1900 and 2200');
    if (yearFrom != null && yearTo != null && yearFrom > yearTo) throw new Error('Fitment year_from cannot be later than year_to');
    return { make, model, variant: nullableText(item.variant), chassis_code: nullableText(item.chassis_code), engine_code: nullableText(item.engine_code), year_from: yearFrom, year_to: yearTo };
  });
  return Array.from(new Map(entries.map((entry) => [JSON.stringify(entry), entry])).values());
}

/** Try the complete number before removing a photo suffix: OEM numbers often end in digits. */
export function catalogImageMatchKeys(filename: string): string[] {
  const stem = (filename.split('/').pop() || filename).replace(/\.[^.]+$/, '');
  return Array.from(new Set([stem, stem.replace(/(?:_(?:(?:image|img|photo)?\d+)|-(?:image|img|photo)\d+)$/i, '')].map(normalizeVehicleModel)));
}

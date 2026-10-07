import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import ExcelJS from 'exceljs';

function load(path, dependencies = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(compiled.outputText, { exports, require: (name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const freight = load('lib/vehicle-freight.ts');
const identity = load('lib/part-identity.ts');
const imports = load('lib/catalog-import.ts', { './part-identity': identity, './vehicle-freight': freight });
const cache = load('lib/public-revalidation-paths.ts');
const prices = load('lib/product-schema.ts');
assert.equal(freight.normalizeVehicleModel(' HONDA  CR-V '), freight.normalizeVehicleModel('Honda CR V'));
assert.equal(freight.vehicleVolume(4, 1.5, 1.4), 8.4);
assert.equal(freight.vehicleVolume('', 1.5, 1.4), null);
assert.equal(freight.vehicleVolume(Infinity, 1.5, 1.4), null);
assert.equal(freight.freightPerVehicle('roro', 8.4, 80), 672);
for (const [volume, size, capacity] of [[9, 'small', 6], [9.001, 'large', 4], [14, 'large', 4], [14.001, 'xl', 3]]) {
  assert.equal(freight.vehicleSizeForVolume(volume), size);
  assert.equal(freight.freightPerVehicle('container_40ft', volume, 6000), 6000 / capacity);
}
assert.equal(freight.freightPerVehicle('container_40ft', 16, 6000, 'small'), 1000, 'Carrier size override controls allocation');
assert.throws(() => freight.freightPerVehicle('roro', 0, 80));
assert.throws(() => freight.freightPerVehicle('roro', 8.4, NaN));
assert.deepEqual(plain(freight.exportQuotePrices(10000, 672, 95.75)), { fob: 10000, cf: 10672, cif: 10767.75 });
assert.throws(() => freight.exportQuotePrices(10000, -1, 95));
assert.deepEqual(plain(prices.publicPriceLines({ showPrice: true, price: 9, priceFob: 10000, priceCf: 10672, priceCif: 10767.75 })), [
  { label: 'FOB', amount: 10000 }, { label: 'C&F', amount: 10672 }, { label: 'CIF', amount: 10767.75 },
]);
assert.deepEqual(plain(prices.publicPriceLines({ showPrice: false, priceFob: 10000 })), []);
assert.equal(prices.positiveCatalogPrice(Infinity), null, 'Never emit infinite amounts into public prices or structured data');

const metadata = identity.buildPartIdentity({
  name: 'Headlight', brand: 'Toyota', part_number: '81110-52J30', oem_number: '81110-52J30', condition: 'used',
  compatibility: [{ make: 'Toyota', model: 'Aqua', chassis_code: 'NHP10', engine_code: '1NZ-FXE' }],
  search_keywords: ['Headlight', 'HEADLIGHT', 'lamp'],
});
assert.match(metadata.meta_title, /Toyota Headlight 81110-52J30/);
assert.match(metadata.meta_description, /Toyota Aqua NHP10/);
assert.ok(metadata.meta_title.length <= 60 && metadata.meta_description.length <= 160);
for (const tag of ['81110-52j30', '8111052j30', 'aqua', 'nhp10', '1nz-fxe', 'lamp']) assert.ok(metadata.search_keywords.includes(tag));
assert.equal(metadata.search_keywords.filter((tag) => tag === 'headlight').length, 1);
const unknown = identity.buildPartIdentity({ name: 'Clip' });
assert.doesNotMatch(unknown.meta_description, /Toyota|Aqua|OEM|For /, 'Unknown brand and fitment must not be invented');
assert.deepEqual(plain(imports.optionalCatalogFields({ price_fob: 0, quantity: 2, destination_markets: 'ke;tz' }, 'part')), { price_fob: 0, quantity: 2 });
assert.deepEqual(plain(imports.optionalCatalogFields({ price_cf: 12000, destination_markets: 'ke;tz;invalid', show_price: 'yes' }, 'vehicle')), { price_cf: 12000, destination_markets: ['KE', 'TZ'], show_price: true });
assert.deepEqual(plain(imports.optionalCatalogFields({ name: 'Clip' }, 'part')), {}, 'Omitted workbook columns preserve current values');
assert.throws(() => imports.optionalCatalogFields({ quantity: 1.5 }, 'part'));
assert.throws(() => imports.optionalCatalogFields({ price: 'NaN' }, 'part'));
assert.equal(imports.importPartCompatibility({ name: 'Clip' }), undefined, 'Missing fitment columns preserve current fitment');
assert.deepEqual(plain(imports.importPartCompatibility({ compatible_vehicles: '[{"make":"Toyota","model":"Aqua","year_from":2012,"year_to":2021}]' }))[0], {
  make: 'Toyota', model: 'Aqua', variant: null, chassis_code: null, engine_code: null, year_from: 2012, year_to: 2021,
});
assert.throws(() => imports.importPartCompatibility({ compatible_vehicles: 'broken' }));
assert.throws(() => imports.importPartCompatibility({ make: 'Toyota', model: 'Aqua', year_from: 2021, year_to: 2012 }));
assert.deepEqual(plain(imports.catalogImageMatchKeys('90915-10004.jpg')), ['90915 10004'], 'Numeric OEM suffixes are part of the number');
assert.deepEqual(plain(imports.catalogImageMatchKeys('folder/90915-10004_2.jpg')), ['90915 10004 2', '90915 10004']);

const bulkPaths = cache.publicRevalidationPaths('vehicle', []);
assert.ok(bulkPaths.some((entry) => entry.path === '/vehicles/[slug]' && entry.type === 'page'));
assert.ok(bulkPaths.some((entry) => entry.path === '/markets/[code]' && entry.type === 'page'), 'Country picks refresh after bulk or single stock edits');
const manyPaths = cache.publicRevalidationPaths('vehicle', Array.from({ length: 20 }, (_, index) => `vehicle-${index}`));
assert.ok(manyPaths.some((entry) => entry.path === '/vehicles/[slug]'), 'More than ten updates must not leave later detail pages stale');
assert.deepEqual(plain(cache.sanitizeListingSlugs(['valid', '../admin', 'bad/slash', 'valid', '<script>'])), ['valid']);
const partPaths = cache.publicRevalidationPaths('part', ['part-one']);
assert.ok(partPaths.some((entry) => entry.path === '/categories/[slug]' && entry.type === 'page'));
assert.ok(partPaths.some((entry) => entry.path === '/parts/part-one'));
for (const [kind, expected] of [['parts', ['part_number', 'brand', 'compatible_vehicles', 'meta_title', 'meta_description', 'search_keywords']], ['vehicles', ['volume_m3', 'length_m', 'width_m', 'height_m', 'destination_markets']]]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(`public/templates/ansha-${kind}-import-template.xlsx`);
  const headers = workbook.worksheets[0].getRow(1).values;
  for (const column of [...expected, 'price_fob', 'price_cf', 'price_cif']) assert.ok(headers.includes(column), `${kind} template supports ${column}`);
  assert.equal(workbook.worksheets[0].rowCount, 1, 'Import templates must not accidentally create sample stock');
}
console.log('Catalog checks passed: freight volumes/6-4-3 sharing, FOB→C&F→CIF, identity/fitment tags, import preservation and bulk cache invalidation.');

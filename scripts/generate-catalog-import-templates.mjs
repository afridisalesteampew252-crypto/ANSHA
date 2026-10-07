import ExcelJS from 'exceljs';

const shared = ['price', 'price_fob', 'price_cf', 'price_cif', 'currency', 'description', 'location', 'show_price', 'is_published', 'is_featured', 'slug', 'meta_title', 'meta_description', 'search_keywords'];
const templates = {
  parts: ['part_code', 'name', 'brand', 'part_number', 'oem_number', 'manufacturer_part_number', 'condition', 'quantity', 'category_id', 'compatible_vehicles', 'interchange_numbers', 'superseded_part_numbers', 'export_markets', ...shared],
  vehicles: ['chassis_number', 'make', 'model', 'title', 'stock_number', 'variant', 'year', 'chassis_code', 'engine_code', 'transmission', 'fuel_type', 'mileage', 'color', 'volume_m3', 'length_m', 'width_m', 'height_m', 'destination_markets', 'shipping_methods', ...shared],
};
for (const [kind, columns] of Object.entries(templates)) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ANSHA Trading';
  const sheet = workbook.addWorksheet(kind === 'parts' ? 'Parts Import' : 'Vehicles Import');
  sheet.columns = columns.map((name) => ({ header: name, key: name, width: name === 'compatible_vehicles' ? 60 : 23 }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: columns.length } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF102435' } };
  const guide = workbook.addWorksheet('Guide');
  const notes = [
    ['Field / workflow', 'Instructions'],
    ['Required fields', kind === 'parts' ? 'part_code and name' : 'chassis_number, make and model'],
    ['Existing records', 'The matching part_code or chassis_number updates an existing record. Remove unused optional COLUMNS when updating records to preserve their current values. A blank cell in an included column clears that value. Existing slugs are preserved unless a replacement slug is entered.'],
    ['Export prices', 'price_fob is FOB/listing price; price_cf is C&F; price_cif is CIF. Enter numbers in currency, without currency symbols. Zero is retained. show_price controls public visibility.'],
    ['Publishing', 'Use true/false or yes/no. New records are drafts unless is_published is true. Fill confirmed product identity and fitment; do not invent missing details.'],
    ['Search & SEO', 'meta_title and meta_description are optional. Parts receive defaults based on their identity and confirmed compatibility. search_keywords accepts comma, semicolon or pipe separated tags.'],
    ['ZIP images', `Use exact ${kind === 'parts' ? 'part_number' : 'chassis_number'} followed by _1, _2 etc. Numbers ending in digits are preserved. Duplicate part numbers require uploading on the specific part detail page. Images are resized and stored as WebP.`],
  ];
  if (kind === 'parts') {
    notes.push(['compatible_vehicles', 'JSON array example: [{"make":"Toyota","model":"Aqua","chassis_code":"NHP10","engine_code":"1NZ-FXE","year_from":2012,"year_to":2021}]. Leave the column out to preserve current fitment. Enter [] to clear fitment.']);
    notes.push(['Identity', 'Enter the real product name, brand and part/OEM number. interchange_numbers and superseded_part_numbers accept comma-separated numbers. category_id is an existing category UUID.']);
  } else {
    notes.push(['Dimensions', 'Enter positive length_m, width_m and height_m in metres, or volume_m3. If absent, the saved make/model M³ default is used. Complete dimensions calculate volume as L × W × H.']);
    notes.push(['Country picks', 'destination_markets accepts ISO country codes such as KE,TZ,UG. Each country page includes only vehicles assigned to its own code.']);
  }
  guide.addRows(notes);
  guide.columns = [{ width: 26 }, { width: 110 }];
  guide.getRow(1).font = { bold: true };
  guide.eachRow((row, index) => {
    row.alignment = { vertical: 'top', wrapText: true };
    if (index > 1) row.height = 60;
  });
  await workbook.xlsx.writeFile(`public/templates/ansha-${kind}-import-template.xlsx`);
}
console.log('Catalog templates generated with export prices, fitment, SEO, tags and model dimensions.');

type Compatibility = {
  make?: string | null;
  model?: string | null;
  chassis_code?: string | null;
  engine_code?: string | null;
  year_from?: number | null;
  year_to?: number | null;
};

type PartIdentity = {
  name: string;
  brand?: string | null;
  part_number?: string | null;
  oem_number?: string | null;
  manufacturer_part_number?: string | null;
  condition?: string | null;
  compatibility?: Compatibility[];
  search_keywords?: string[];
};

const clean = (value: string | null | undefined) => (value || '').trim().replace(/\s+/g, ' ');

export function parseCatalogTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : String(value || '').split(/[,;\n|]/);
  const unique = new Map<string, string>();
  for (const raw of values) {
    const tag = clean(String(raw)).slice(0, 120);
    if (tag && !unique.has(tag.toLowerCase())) unique.set(tag.toLowerCase(), tag);
  }
  return Array.from(unique.values()).slice(0, 100);
}

/** Derive metadata only from supplied product identity and confirmed fitment. */
export function buildPartIdentity(input: PartIdentity) {
  const name = clean(input.name);
  const brand = clean(input.brand);
  const number = clean(input.manufacturer_part_number || input.part_number || input.oem_number);
  const productName = brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name;
  const title = number && !productName.toLowerCase().includes(number.toLowerCase())
    ? `${productName.slice(0, Math.max(1, 59 - number.length)).trim()} ${number}` : productName;
  const fitments = (input.compatibility || []).filter((fitment) => clean(fitment.make) && clean(fitment.model));
  const fitmentNames = parseCatalogTags(fitments.map((fitment) => [clean(fitment.make), clean(fitment.model), clean(fitment.chassis_code)].filter(Boolean).join(' ')));
  const description = [
    productName,
    number ? `Part number ${number}.` : null,
    input.oem_number && clean(input.oem_number) !== number ? `OEM ${clean(input.oem_number)}.` : null,
    fitmentNames.length ? `For ${fitmentNames.join(', ')}.` : null,
    input.condition ? `${clean(input.condition)} condition.` : null,
    'Ask ANSHA Trading for availability and export shipping.',
  ].filter(Boolean).join(' ');
  const keywords = parseCatalogTags([
    ...(input.search_keywords || []), name, brand,
    clean(input.part_number), clean(input.oem_number), clean(input.manufacturer_part_number),
    ...[input.part_number, input.oem_number, input.manufacturer_part_number].map((value) => clean(value).replace(/[^a-z0-9]/gi, '')),
    ...fitmentNames,
    ...fitments.flatMap((fitment) => [clean(fitment.make), clean(fitment.model), clean(fitment.chassis_code), clean(fitment.engine_code)]),
  ]);
  return { meta_title: title.slice(0, 60), meta_description: description.slice(0, 160), search_keywords: keywords.map((keyword) => keyword.toLowerCase()) };
}

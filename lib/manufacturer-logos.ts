export const DEFAULT_MANUFACTURER_LOGO = '/brands/default.svg';

const manufacturerLogos: Record<string, string> = {
  toyota: '/brands/toyota.svg',
  nissan: '/brands/nissan.svg',
  honda: '/brands/honda.svg',
  mazda: '/brands/mazda.svg',
  mitsubishi: '/brands/mitsubishi.svg',
  subaru: '/brands/subaru.svg',
  suzuki: '/brands/suzuki.svg',
  daihatsu: '/brands/daihatsu.svg',
};

const manufacturerAliases: Record<string, string> = {
  'land cruiser': 'toyota',
  'land cruser': 'toyota',
  landcruiser: 'toyota',
  prado: 'toyota',

  'nissan motor': 'nissan',
  'honda motor': 'honda',
  'mazda motor': 'mazda',
  'mitsubishi motors': 'mitsubishi',
  'suzuki motor': 'suzuki',
};

export function normalizeManufacturer(name?: string | null): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
}

export function getManufacturerLogo(
  name?: string | null,
  logoUrl?: string | null
): string {
  if (logoUrl?.trim()) {
    return logoUrl.trim();
  }

  const normalized = normalizeManufacturer(name);

  if (!normalized) {
    return DEFAULT_MANUFACTURER_LOGO;
  }

  const manufacturer = manufacturerAliases[normalized] ?? normalized;

  return manufacturerLogos[manufacturer] ?? DEFAULT_MANUFACTURER_LOGO;
}

export function hasManufacturerLogo(name?: string | null): boolean {
  const normalized = normalizeManufacturer(name);

  if (!normalized) return false;

  const manufacturer = manufacturerAliases[normalized] ?? normalized;

  return Boolean(manufacturerLogos[manufacturer]);
}

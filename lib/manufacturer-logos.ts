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

export const DEFAULT_MANUFACTURER_LOGO = '/brands/default.svg';

export function getManufacturerLogo(name: string, logoUrl?: string | null): string {
  if (logoUrl) return logoUrl;
  const slug = name.toLowerCase().trim();
  return manufacturerLogos[slug] ?? DEFAULT_MANUFACTURER_LOGO;
}

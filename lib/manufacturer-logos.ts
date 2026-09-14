export const DEFAULT_MANUFACTURER_LOGO = '/brands/default.svg';

const manufacturerLogos: Record<string, string> = {
  // Japanese
  toyota: '/brands/toyota.svg',
  nissan: '/brands/nissan.svg',
  honda: '/brands/honda.svg',
  mazda: '/brands/mazda.svg',
  mitsubishi: '/brands/mitsubishi.svg',
  subaru: '/brands/subaru.svg',
  suzuki: '/brands/suzuki.svg',
  daihatsu: '/brands/daihatsu.svg',
  lexus: '/brands/lexus.svg',
  isuzu: '/brands/isuzu.svg',
  hino: '/brands/hino.svg',
  infiniti: '/brands/infiniti.svg',
  acura: '/brands/acura.svg',

  // European
  bmw: '/brands/bmw.svg',
  mercedes: '/brands/mercedes.svg',
  audi: '/brands/audi.svg',
  volkswagen: '/brands/volkswagen.svg',
  porsche: '/brands/porsche.svg',
  volvo: '/brands/volvo.svg',
  polestar: '/brands/polestar.svg',
  peugeot: '/brands/peugeot.svg',
  renault: '/brands/renault.svg',
  citroen: '/brands/citroen.svg',
  fiat: '/brands/fiat.svg',
  ferrari: '/brands/ferrari.svg',
  lamborghini: '/brands/lamborghini.svg',
  maserati: '/brands/maserati.svg',
  'alfa-romeo': '/brands/alfa-romeo.svg',
  skoda: '/brands/skoda.svg',
  seat: '/brands/seat.svg',
  cupra: '/brands/cupra.svg',
  mini: '/brands/mini.svg',
  bentley: '/brands/bentley.svg',
  'rolls-royce': '/brands/rolls-royce.svg',
  'aston-martin': '/brands/aston-martin.svg',

  // Korean
  hyundai: '/brands/hyundai.svg',
  kia: '/brands/kia.svg',
  genesis: '/brands/genesis.svg',

  // American
  ford: '/brands/ford.svg',
  chevrolet: '/brands/chevrolet.svg',
  jeep: '/brands/jeep.svg',
  tesla: '/brands/tesla.svg',
  cadillac: '/brands/cadillac.svg',
  gmc: '/brands/gmc.svg',

  // British
  'land-rover': '/brands/land-rover.svg',
  jaguar: '/brands/jaguar.svg',
  mg: '/brands/mg.svg',

  // Chinese
  byd: '/brands/byd.svg',
  geely: '/brands/geely.svg',
  chery: '/brands/chery.svg',
  haval: '/brands/haval.svg',
  'great-wall': '/brands/great-wall.svg',
  changan: '/brands/changan.svg',

  // Indian
  tata: '/brands/tata.svg',
  mahindra: '/brands/mahindra.svg',
};

const manufacturerAliases: Record<string, string> = {
  'land cruiser': 'toyota',
  'land cruser': 'toyota',
  landcruiser: 'toyota',
  prado: 'toyota',

  'mercedes benz': 'mercedes',
  'mercedes-benz': 'mercedes',
  benz: 'mercedes',

  vw: 'volkswagen',

  landrover: 'land-rover',
  'range rover': 'land-rover',

  'nissan motor': 'nissan',
  'honda motor': 'honda',
  'mazda motor': 'mazda',
  'mitsubishi motors': 'mitsubishi',
  'suzuki motor': 'suzuki',

  'great wall motors': 'great-wall',
  'great wall': 'great-wall',
  gwm: 'great-wall',
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

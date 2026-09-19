export type ExportMarket = {
  code: string;
  name: string;
  region: string;
  defaultImportNotes: string;
};

export const EXPORT_MARKETS: ExportMarket[] = [
  {
    code: 'AE',
    name: 'United Arab Emirates',
    region: 'Middle East',
    defaultImportNotes:
      'GCC destination. Right-hand drive and left-hand drive both common. Typical clearance needs invoice, export declaration, and vehicle/parts packing list. ANSHA coordinates from Dubai.',
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    region: 'Middle East',
    defaultImportNotes:
      'SASO / SABER conformity may apply for vehicles and some parts. Provide chassis/OEM details early. Freight usually via sea or land through GCC corridors.',
  },
  {
    code: 'OM',
    name: 'Oman',
    region: 'Middle East',
    defaultImportNotes:
      'GCC import route. Customs require commercial invoice and packing list. Confirm model year and steering side before booking freight.',
  },
  {
    code: 'QA',
    name: 'Qatar',
    region: 'Middle East',
    defaultImportNotes:
      'Import often via sea/air into Doha. Keep HS codes and values accurate on the commercial invoice for smooth clearance.',
  },
  {
    code: 'KW',
    name: 'Kuwait',
    region: 'Middle East',
    defaultImportNotes:
      'GCC clearance with invoice + packing list. Confirm any age or specification limits for used vehicles before purchase.',
  },
  {
    code: 'BH',
    name: 'Bahrain',
    region: 'Middle East',
    defaultImportNotes:
      'Compact GCC market. Standard commercial docs; coordinate last-mile delivery after port/airport arrival.',
  },
  {
    code: 'KE',
    name: 'Kenya',
    region: 'Africa',
    defaultImportNotes:
      'Common via Mombasa. Used vehicles may face age/duty rules — confirm before booking. Parts: invoice, packing list, and HS codes required.',
  },
  {
    code: 'TZ',
    name: 'Tanzania',
    region: 'Africa',
    defaultImportNotes:
      'Typical entry via Dar es Salaam. Check vehicle age limits and duty bands. ANSHA can quote FOB Dubai or CIF.',
  },
  {
    code: 'UG',
    name: 'Uganda',
    region: 'Africa',
    defaultImportNotes:
      'Often inland via Mombasa corridor. Plan transit time and confirm destination inland freight separately from ocean freight.',
  },
  {
    code: 'NG',
    name: 'Nigeria',
    region: 'Africa',
    defaultImportNotes:
      'Lagos / Apapa routes common. Import duties and inspection rules vary by vehicle age — share destination city early for freight quoting.',
  },
  {
    code: 'GH',
    name: 'Ghana',
    region: 'Africa',
    defaultImportNotes:
      'Tema port common. Confirm valuation and any destination inspection needs. Parts shipments should list OEM numbers clearly.',
  },
  {
    code: 'ZA',
    name: 'South Africa',
    region: 'Africa',
    defaultImportNotes:
      'Homologation / LOA may apply for vehicles. Share VIN/chassis and intended use. Parts: commercial invoice with accurate HS codes.',
  },
  {
    code: 'IN',
    name: 'India',
    region: 'Asia',
    defaultImportNotes:
      'Import licensing and duty depend on category. Used vehicle imports are restricted — parts and new units need precise HS classification.',
  },
  {
    code: 'PK',
    name: 'Pakistan',
    region: 'Asia',
    defaultImportNotes:
      'Import policy varies by vehicle age and category. Share chassis/OEM and destination city for duty/freight guidance from Dubai.',
  },
  {
    code: 'BD',
    name: 'Bangladesh',
    region: 'Asia',
    defaultImportNotes:
      'Chittagong common for sea freight. Confirm LC/payment terms and packing standards for mixed parts containers.',
  },
  {
    code: 'SG',
    name: 'Singapore',
    region: 'Asia',
    defaultImportNotes:
      'Strict vehicle import rules (COE/PARF). Parts shipments are more common — use accurate invoices and packing lists.',
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    region: 'Europe',
    defaultImportNotes:
      'Post-Brexit customs declarations required. IVA/type approval considerations for vehicles. Prefer clear commercial invoices for parts.',
  },
  {
    code: 'DE',
    name: 'Germany',
    region: 'Europe',
    defaultImportNotes:
      'EU entry with EORI and customs entry. Vehicles may need registration compliance; parts need correct HS and preference docs if any.',
  },
  {
    code: 'NL',
    name: 'Netherlands',
    region: 'Europe',
    defaultImportNotes:
      'Rotterdam hub. Often used for EU redistribution. Provide commercial invoice, packing list, and consignee EORI where applicable.',
  },
  {
    code: 'FR',
    name: 'France',
    region: 'Europe',
    defaultImportNotes:
      'EU customs process. Confirm VAT handling (DDP vs DAP). Vehicle registration rules depend on age and emissions class.',
  },
];

export function getExportMarket(code: string) {
  const normalized = code.trim().toUpperCase();
  return EXPORT_MARKETS.find((m) => m.code === normalized) ?? null;
}

export function flagImageUrl(code: string, width = 80) {
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`;
}

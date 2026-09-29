import { ADDITIONAL_EXPORT_MARKETS } from './export-market-shipping';

export type ExportMarket = {
  code: string;
  name: string;
  region: string;
  defaultImportNotes: string;
};

const BASE_EXPORT_MARKETS: ExportMarket[] = [
  // —— Middle East ——
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
    code: 'JO',
    name: 'Jordan',
    region: 'Middle East',
    defaultImportNotes:
      'Aqaba common for sea freight. Confirm vehicle age and emissions rules. Parts need clear commercial invoices and packing lists.',
  },
  {
    code: 'LB',
    name: 'Lebanon',
    region: 'Middle East',
    defaultImportNotes:
      'Beirut entry for vehicles and parts. Share payment terms early; confirm duty bands and any temporary-import options with your broker.',
  },
  // —— Africa ——
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
    code: 'MZ',
    name: 'Mozambique',
    region: 'Africa',
    defaultImportNotes:
      'Maputo / Beira routes common. Confirm duty and inspection requirements for used vehicles. Parts need invoice + packing list.',
  },
  {
    code: 'RW',
    name: 'Rwanda',
    region: 'Africa',
    defaultImportNotes:
      'Inland via Mombasa or Dar corridors. Plan transit and confirm EAC duty treatment. Share chassis/OEM details for quoting.',
  },
  {
    code: 'ZM',
    name: 'Zambia',
    region: 'Africa',
    defaultImportNotes:
      'Often via Durban or Dar inland corridors. Confirm vehicle age limits and destination city for door delivery quotes.',
  },
  {
    code: 'ZW',
    name: 'Zimbabwe',
    region: 'Africa',
    defaultImportNotes:
      'Inland routing via South Africa or Mozambique ports. Check duty and valuation rules before purchase; parts need clear HS codes.',
  },
  {
    code: 'ET',
    name: 'Ethiopia',
    region: 'Africa',
    defaultImportNotes:
      'Djibouti corridor common for sea freight. Confirm import licensing and age limits for vehicles. Share consignee details early.',
  },
  {
    code: 'EG',
    name: 'Egypt',
    region: 'Africa',
    defaultImportNotes:
      'Alexandria / Port Said entries. Vehicle import rules are strict by age and category — confirm before booking. Parts: accurate invoices.',
  },
  {
    code: 'SN',
    name: 'Senegal',
    region: 'Africa',
    defaultImportNotes:
      'Dakar common West Africa hub. Confirm inspection and duty bands. ANSHA can quote FOB Dubai or CIF Dakar.',
  },
  {
    code: 'CM',
    name: 'Cameroon',
    region: 'Africa',
    defaultImportNotes:
      'Douala main sea gateway. Share destination city and vehicle specs early for duty/freight guidance from Dubai.',
  },
  {
    code: 'AO',
    name: 'Angola',
    region: 'Africa',
    defaultImportNotes:
      'Luanda entry common. Confirm documentation language and valuation. Parts containers need detailed packing lists.',
  },
  {
    code: 'BW',
    name: 'Botswana',
    region: 'Africa',
    defaultImportNotes:
      'Often inland via Durban or Walvis Bay. Confirm SADC transit docs and vehicle compliance before purchase.',
  },
  {
    code: 'NA',
    name: 'Namibia',
    region: 'Africa',
    defaultImportNotes:
      'Walvis Bay gateway. Homologation may apply for vehicles. Parts: commercial invoice with OEM and HS detail.',
  },
  {
    code: 'MU',
    name: 'Mauritius',
    region: 'Africa',
    defaultImportNotes:
      'Island destination — confirm age and left-hand-drive rules. Sea and air options from Dubai; share preferred Incoterms.',
  },
  {
    code: 'LR',
    name: 'Liberia',
    region: 'Africa',
    defaultImportNotes:
      'Monrovia routes for vehicles and parts. Confirm inspection needs and payment terms. List OEM numbers clearly on packing lists.',
  },
  {
    code: 'SL',
    name: 'Sierra Leone',
    region: 'Africa',
    defaultImportNotes:
      'Freetown entry. Share vehicle age and destination for duty estimates. Parts shipments need invoice + packing list.',
  },
  // —— Asia ——
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
    code: 'LK',
    name: 'Sri Lanka',
    region: 'Asia',
    defaultImportNotes:
      'Colombo sea entry. Vehicle import permits and duties vary by age — confirm early. Parts: invoice, packing list, HS codes.',
  },
  {
    code: 'MY',
    name: 'Malaysia',
    region: 'Asia',
    defaultImportNotes:
      'Port Klang / Pasir Gudang common. AP/permit may apply for vehicles. Parts need accurate commercial docs and OEM numbers.',
  },
  {
    code: 'PH',
    name: 'Philippines',
    region: 'Asia',
    defaultImportNotes:
      'Manila / Batangas routes. Confirm BOC valuation and any age limits. Share chassis and destination island for freight quotes.',
  },
  {
    code: 'JP',
    name: 'Japan',
    region: 'Asia',
    defaultImportNotes:
      'High-spec market; used-vehicle re-import rare. Parts and accessory shipments more typical — precise OEM and HS codes required.',
  },
  {
    code: 'ID',
    name: 'Indonesia',
    region: 'Asia',
    defaultImportNotes:
      'Jakarta / Surabaya entries. Vehicle import licensing is restrictive — parts and CKD-style shipments need clear classification.',
  },
  {
    code: 'TH',
    name: 'Thailand',
    region: 'Asia',
    defaultImportNotes:
      'Laem Chabang hub. Confirm duty and any type-approval needs. Parts containers should list OEM numbers and packing detail.',
  },
  {
    code: 'VN',
    name: 'Vietnam',
    region: 'Asia',
    defaultImportNotes:
      'Ho Chi Minh / Haiphong ports. Vehicle import rules are strict by category — parts freights are more common from Dubai.',
  },
  {
    code: 'MV',
    name: 'Maldives',
    region: 'Asia',
    defaultImportNotes:
      'Island logistics via Malé. Confirm vessel/air options and last-mile transfer. Share packing limits for parts shipments.',
  },
  {
    code: 'KR',
    name: 'South Korea',
    region: 'Asia',
    defaultImportNotes:
      'Busan / Incheon entries. Homologation and emissions rules apply for vehicles. Parts need accurate HS and commercial invoices.',
  },
  // —— Caribbean ——
  {
    code: 'JM',
    name: 'Jamaica',
    region: 'Caribbean',
    defaultImportNotes:
      'Kingston common for RoRo and containers. Confirm age limits and right-hand-drive preference. Share chassis early for quoting.',
  },
  {
    code: 'GY',
    name: 'Guyana',
    region: 'Caribbean',
    defaultImportNotes:
      'Georgetown entry. Right-hand-drive demand is strong. Confirm duty bands and inspection; ANSHA can quote FOB Dubai or CIF.',
  },
  {
    code: 'SR',
    name: 'Suriname',
    region: 'Caribbean',
    defaultImportNotes:
      'Paramaribo routes. Confirm steering side and age rules. Parts shipments need invoice, packing list, and clear consignee details.',
  },
  {
    code: 'TT',
    name: 'Trinidad & Tobago',
    region: 'Caribbean',
    defaultImportNotes:
      'Port of Spain / Point Lisas. Confirm vehicle age and duty. Popular for Japanese and GCC-spec units from Dubai.',
  },
  {
    code: 'BB',
    name: 'Barbados',
    region: 'Caribbean',
    defaultImportNotes:
      'Bridgetown entry. Island clearance — confirm age and left/right-hand rules. Share preferred Incoterms for freight quotes.',
  },
  {
    code: 'BS',
    name: 'Bahamas',
    region: 'Caribbean',
    defaultImportNotes:
      'Nassau / Freeport gateways. Confirm duty and any temporary-import options. Parts need accurate commercial invoices.',
  },
  {
    code: 'DO',
    name: 'Dominican Republic',
    region: 'Caribbean',
    defaultImportNotes:
      'Caucedo / Rio Haina common. Confirm vehicle age and tax structure. Share destination city for inland delivery quotes.',
  },
  {
    code: 'HT',
    name: 'Haiti',
    region: 'Caribbean',
    defaultImportNotes:
      'Port-au-Prince routes. Confirm documentation and payment terms early. Parts and used vehicles both ship from Dubai regularly.',
  },
  // —— Americas ——
  {
    code: 'US',
    name: 'United States',
    region: 'Americas',
    defaultImportNotes:
      'EPA/DOT rules restrict many used imports. Parts and compliant vehicles need precise invoices, HS codes, and broker coordination.',
  },
  {
    code: 'CA',
    name: 'Canada',
    region: 'Americas',
    defaultImportNotes:
      'RIV/compliance considerations for vehicles. Parts freights common — provide commercial invoice, packing list, and consignee BN.',
  },
  {
    code: 'MX',
    name: 'Mexico',
    region: 'Americas',
    defaultImportNotes:
      'Manzanillo / Veracruz hubs. Confirm NOM and import permits for vehicles. Parts need accurate HS classification.',
  },
  {
    code: 'CL',
    name: 'Chile',
    region: 'Americas',
    defaultImportNotes:
      'San Antonio / Valparaíso entries. Confirm age and emissions rules. ANSHA can quote FOB Dubai or CIF Chilean ports.',
  },
  {
    code: 'PE',
    name: 'Peru',
    region: 'Americas',
    defaultImportNotes:
      'Callao main gateway. Confirm SUNAT valuation and vehicle age limits. Parts: invoice + packing list with OEM detail.',
  },
  {
    code: 'BR',
    name: 'Brazil',
    region: 'Americas',
    defaultImportNotes:
      'Santos / Paranaguá routes. Import licensing can be complex — share NCM/HS early. Parts shipments need complete commercial docs.',
  },
  {
    code: 'CO',
    name: 'Colombia',
    region: 'Americas',
    defaultImportNotes:
      'Cartagena / Buenaventura entries. Confirm age and homologation for vehicles. Share destination city for quoting.',
  },
  {
    code: 'PA',
    name: 'Panama',
    region: 'Americas',
    defaultImportNotes:
      'Colón / Balboa hubs for regional redistribution. Confirm free-zone vs local import treatment and provide clear consignee details.',
  },
  // —— Europe ——
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
  {
    code: 'IT',
    name: 'Italy',
    region: 'Europe',
    defaultImportNotes:
      'Genoa / Gioia Tauro entries. EU EORI and VAT handling required. Confirm registration compliance for used vehicles.',
  },
  {
    code: 'ES',
    name: 'Spain',
    region: 'Europe',
    defaultImportNotes:
      'Valencia / Barcelona hubs. EU customs with EORI. Share Incoterms and VAT treatment for smooth clearance.',
  },
  {
    code: 'BE',
    name: 'Belgium',
    region: 'Europe',
    defaultImportNotes:
      'Antwerp hub for EU redistribution. Provide commercial invoice, packing list, and consignee EORI.',
  },
  {
    code: 'PL',
    name: 'Poland',
    region: 'Europe',
    defaultImportNotes:
      'Gdansk / Gdynia entries. EU process with EORI. Confirm registration and emissions class for vehicles.',
  },
  {
    code: 'PT',
    name: 'Portugal',
    region: 'Europe',
    defaultImportNotes:
      'Lisbon / Leixões ports. EU customs and VAT rules apply. Parts need accurate HS codes on commercial invoices.',
  },
  {
    code: 'IE',
    name: 'Ireland',
    region: 'Europe',
    defaultImportNotes:
      'Dublin / Cork entries. Confirm VRT and registration rules for vehicles. Parts: clear invoices and packing lists.',
  },
  // —— Oceania ——
  {
    code: 'AU',
    name: 'Australia',
    region: 'Oceania',
    defaultImportNotes:
      'SEVS / import approval often required for vehicles. Right-hand drive preferred. Parts need accurate invoices and biosecurity-aware packing.',
  },
  {
    code: 'NZ',
    name: 'New Zealand',
    region: 'Oceania',
    defaultImportNotes:
      'Auckland / Tauranga entries. Entry certification for used vehicles. Confirm age and compliance before booking from Dubai.',
  },
  {
    code: 'FJ',
    name: 'Fiji',
    region: 'Oceania',
    defaultImportNotes:
      'Suva / Lautoka gateways. Island logistics — confirm vessel schedules and duty. Share chassis and preferred Incoterms early.',
  },
];


export const EXPORT_MARKETS: ExportMarket[] = [
  ...BASE_EXPORT_MARKETS,
  ...ADDITIONAL_EXPORT_MARKETS.filter(
    (additional) => !BASE_EXPORT_MARKETS.some((market) => market.code === additional.code)
  ),
];

export function getExportMarket(code: string) {
  const normalized = code.trim().toUpperCase();
  return EXPORT_MARKETS.find((m) => m.code === normalized) ?? null;
}

export function flagImageUrl(code: string, width = 80) {
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`;
}
